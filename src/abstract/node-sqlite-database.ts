import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BackupOptions as NodeBackupOptions, DatabaseSync as NodeDatabase } from 'node:sqlite';

import type { BackupMetadata, BackupOptions } from '@/typings';

import { BaseDatabase } from './database';

export class NodeSqliteDatabase extends BaseDatabase<NodeDatabase> {
  override async backup(destinationFile: string, options?: BackupOptions): Promise<BackupMetadata> {
    const db = await this.raw();
    const { backup } = await import('node:sqlite');

    const nodeOptions: NodeBackupOptions = {};
    if (options?.progress) {
      // node:sqlite progress returns void and doesn't support sleep.
      // We'll just call the user's progress function and ignore the return value.
      nodeOptions.progress = (info) => {
        options.progress(info);
      };
    }

    const totalPages = await backup(db, destinationFile, nodeOptions);

    // The backup is complete, so remainingPages is 0.
    // The return value of backup is the total number of pages.
    return { totalPages, remainingPages: 0 };
  }

  /**
   * node:sqlite does not have a direct `serialize` method.
   * This is a workaround that backs up the database to a temporary file,
   * reads the file into a buffer, and then deletes the temporary file.
   */
  override async serialize(_name?: string): Promise<Buffer> {
    const tempFile = join(tmpdir(), `isomorphic-sqlite-serialize-${Date.now()}.db`);
    try {
      await this.backup(tempFile);
      const buffer = await readFile(tempFile);
      return buffer;
    } finally {
      await unlink(tempFile).catch(() => {}); // Ignore errors on cleanup
    }
  }
}
