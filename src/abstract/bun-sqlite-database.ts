import { writeFile } from 'node:fs/promises';
import type { Database as BunDatabase } from 'bun:sqlite';

import type {
  AggregateOptions,
  AnyFunc,
  BackupMetadata,
  BackupOptions,
  FunctionOptions,
} from '@/typings';

import { BaseDatabase } from './database';

export class BunSqliteDatabase extends BaseDatabase<BunDatabase> {
  override async backup(
    destinationFile: string,
    _options?: BackupOptions
  ): Promise<BackupMetadata> {
    const db = await this.raw();
    const buffer = db.serialize();
    await writeFile(destinationFile, buffer);
    // Bun's serialize method doesn't provide progress, so we return a completed state.
    return {
      totalPages: 1,
      remainingPages: 0,
    };
  }

  override async serialize(name?: string): Promise<Buffer> {
    const db = await this.raw();
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const buffer = db.serialize(name);
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    });
  }

  override function(
    _name: string,
    _options: FunctionOptions | AnyFunc,
    _cb?: AnyFunc
  ): Promise<void> {
    return Promise.reject(new Error('Custom functions are not supported by this driver.'));
  }

  override aggregate(_name: string, _options: AggregateOptions): Promise<void> {
    return Promise.reject(
      new Error('Custom aggregate functions are not supported by this driver.')
    );
  }
}
