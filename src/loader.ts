import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options as Sqlite3Options } from 'better-sqlite3';

import { BetterSqlite3Database, BunSqliteDatabase, NodeSqliteDatabase } from './abstract/database';
import type { DatabaseOptions, IDatabase } from './typings';
import { getRuntime } from './utils';

async function loadNodeSqlite(
  filename: string | Buffer,
  options: DatabaseOptions
): Promise<IDatabase> {
  const { DatabaseSync: NodeDatabase } = await import('node:sqlite');

  if (typeof filename !== 'string') {
    const tempFile = join(tmpdir(), `isomorphic-sqlite-deserialize-${Date.now()}.db`);
    try {
      await writeFile(tempFile, filename);
      const db = new NodeDatabase(tempFile, {
        readOnly: options.readOnly,
        timeout: options.busyTimeout,
        enableForeignKeyConstraints: options.enableForeignKeyConstraints,
        returnArrays: options.returnArrays,
      });
      return new NodeSqliteDatabase(db);
    } finally {
      await unlink(tempFile).catch(() => {}); // Ignore errors on cleanup
    }
  }

  return new NodeSqliteDatabase(
    new NodeDatabase(filename, {
      readOnly: options.readOnly,
      timeout: options.busyTimeout,
      enableForeignKeyConstraints: options.enableForeignKeyConstraints,
      returnArrays: options.returnArrays,
    })
  );
}

async function loadBetterSqlite3(
  filename: string | Buffer,
  options: DatabaseOptions
): Promise<IDatabase> {
  const Sqlite3 = await import('better-sqlite3');

  // better-sqlite3 cannot open a readonly in-memory database directly.
  // The workaround is to create a writable in-memory database, serialize it to a buffer,
  // and then open a new readonly database from that buffer.
  if (filename === ':memory:' && options.readOnly) {
    const tempDb = new Sqlite3.default(':memory:');
    const buffer = tempDb.serialize();
    tempDb.close();
    return loadBetterSqlite3(buffer, options);
  }

  const opts: Sqlite3Options = {
    readonly: options.readOnly ?? false,
  };
  if (options.busyTimeout !== undefined) {
    opts.timeout = options.busyTimeout;
  }

  const db = new Sqlite3.default(filename, opts);

  if (options.enableForeignKeyConstraints ?? true) {
    db.pragma('foreign_keys = ON');
  }

  return new BetterSqlite3Database(db);
}

async function loadBunSqlite(
  filename: string | Buffer,
  options: DatabaseOptions
): Promise<IDatabase> {
  const { Database: BunDatabase } = await import('bun:sqlite');

  if (typeof filename !== 'string') {
    const tempFile = join(tmpdir(), `isomorphic-sqlite-deserialize-bun-${Date.now()}.db`);
    try {
      await writeFile(tempFile, filename);
      const db = new BunDatabase(tempFile, {
        readonly: options.readOnly,
        safeIntegers: options.safeIntegers,
      });
      return new BunSqliteDatabase(db);
    } finally {
      await unlink(tempFile).catch(() => {}); // Ignore errors on cleanup
    }
  }

  if (filename === ':memory:' && options.readOnly) {
    const tempDb = new BunDatabase(':memory:');
    const buffer = tempDb.serialize();
    tempDb.close();
    return loadBunSqlite(buffer, options);
  }

  const db = new BunSqliteDatabase(
    new BunDatabase(filename, {
      readonly: options.readOnly,
      safeIntegers: options.safeIntegers,
    })
  );

  if (options.enableForeignKeyConstraints ?? true) {
    await db.exec('PRAGMA foreign_keys = ON');
  }

  return db;
}

export async function createDb(
  filename: string | Buffer,
  options: DatabaseOptions = {}
): Promise<IDatabase> {
  const driver = options.driver ?? process?.env['ISOMORPHIC_SQLITE_DRIVER'];

  if (driver) {
    switch (driver) {
      case 'node:sqlite':
        return loadNodeSqlite(filename, options);
      case 'bun:sqlite':
        return loadBunSqlite(filename, options);
      case 'better-sqlite3':
        return loadBetterSqlite3(filename, options);
      default:
        throw new Error(`Unknown driver: ${driver}`);
    }
  }

  const runtime = getRuntime();

  if (runtime === 'bun') {
    try {
      return await loadBunSqlite(filename, options);
    } catch (bunErr) {
      try {
        return await loadBetterSqlite3(filename, options);
      } catch (betterSqlite3Err) {
        throw new Error('No SQLite driver found. Please install `better-sqlite3` as a dependency.');
      }
    }
  }

  if (runtime === 'node') {
    try {
      return await loadNodeSqlite(filename, options);
    } catch (nodeErr) {
      try {
        return await loadBetterSqlite3(filename, options);
      } catch (betterSqlite3Err) {
        throw new Error(
          'No SQLite driver found. Please install `better-sqlite3` or use a Node.js version with built-in `node:sqlite`.'
        );
      }
    }
  }

  throw new Error('Unsupported runtime. Could not determine how to load a SQLite driver.');
}
