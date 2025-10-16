import type { Database as Sqlite3Database } from 'better-sqlite3';

import { BaseStatement } from '@/statement';
import type { BackupMetadata, BackupOptions, IStatement, PragmaOptions } from '@/typings';

import { BaseDatabase } from './database';

export class BetterSqlite3Database extends BaseDatabase<Sqlite3Database> {
  override async prepare(sql: string): Promise<IStatement> {
    const db = await this.raw();
    return new Promise<IStatement>((resolve, reject) => {
      try {
        const statement = db.prepare(sql);
        resolve(new BaseStatement(statement, true));
      } catch (err) {
        reject(err);
      }
    });
  }

  override async backup(destinationFile: string, options?: BackupOptions): Promise<BackupMetadata> {
    const db = await this.raw();
    return db.backup(destinationFile, options);
  }

  override async pragma(sql: string, options: PragmaOptions = {}): Promise<any> {
    const db = await this.raw();
    return db.pragma(sql, options);
  }

  override async serialize(name?: string): Promise<Buffer> {
    const db = await this.raw();
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const buffer = name ? db.serialize({ attached: name }) : db.serialize();
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    });
  }
}
