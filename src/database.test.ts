import fs from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Database } from './index';
import { getRuntime } from './utils';

describe('Database', () => {
  const originalDriver = process.env['ISOMORPHIC_SQLITE_DRIVER'];

  afterEach(() => {
    process.env['ISOMORPHIC_SQLITE_DRIVER'] = originalDriver;
  });

  it('should open an in-memory database', async () => {
    const db = new Database(':memory:');
    await db.close();
  });

  it('should open a database using the static open method', async () => {
    const db = Database.open(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.close();
  });

  it('should execute a query', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.close();
  });

  it('should run a query', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const result = await db.run('INSERT INTO test (name) VALUES (?)', ['test-name']);
    expect(result.lastID).toBe(1);
    expect(result.changes).toBe(1);
    await db.close();
  });

  it('should insert and retrieve data', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.run('INSERT INTO test (name) VALUES (?)', ['test-name']);
    const row = await db.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', [1]);
    expect(row).toEqual({ id: 1, name: 'test-name' });
    await db.close();
  });

  it('should return undefined when get finds no row', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const row = await db.get('SELECT * FROM test WHERE id = 1');
    expect(row).toBeUndefined();
    await db.close();
  });

  it('should insert and retrieve all data', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.run('INSERT INTO test (name) VALUES (?), (?)', ['test-name-1', 'test-name-2']);
    const rows = await db.all<{ id: number; name: string }>('SELECT * FROM test');
    expect(rows).toEqual([
      { id: 1, name: 'test-name-1' },
      { id: 2, name: 'test-name-2' },
    ]);
    await db.close();
  });

  it('should return an empty array when all finds no rows', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    const rows = await db.all('SELECT * FROM test');
    expect(rows).toEqual([]);
    await db.close();
  });

  it('should handle different data types', async () => {
    const db = new Database(':memory:');
    await db.exec(
      'CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, height REAL, data BLOB, extra TEXT)'
    );
    const buffer = Buffer.from([1, 2, 3]);
    await db.run('INSERT INTO test (name, age, height, data, extra) VALUES (?, ?, ?, ?, ?)', [
      'test-name',
      25,
      1.8,
      buffer,
      null,
    ]);
    const row = await db.get<{
      id: number;
      name: string;
      age: number;
      height: number;
      data: Buffer;
      extra: null;
    }>('SELECT * FROM test WHERE id = 1');
    expect(row).toEqual({
      id: 1,
      name: 'test-name',
      age: 25,
      height: 1.8,
      data: buffer,
      extra: null,
    });
    await db.close();
  });

  it('should handle oversized BigInt values', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    const oversizedBigInt = 9223372036854775808n; // MAX_BIGINT + 1
    await db.run('INSERT INTO test (value) VALUES ($value)', { $value: oversizedBigInt });
    const row = await db.get<{ id: number; value: string }>('SELECT * FROM test WHERE id = $id', {
      $id: 1,
    });
    expect(row).toEqual({ id: 1, value: oversizedBigInt.toString() });
    await db.close();
  });

  it('should handle named parameters', async () => {
    const db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await db.run('INSERT INTO test (name) VALUES ($name)', { $name: 'test-name' });
    const row = await db.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = $id', {
      $id: 1,
    });
    expect(row).toEqual({ id: 1, name: 'test-name' });
    await db.close();
  });

  describe('General Edge Cases', () => {
    let db: Database;

    beforeEach(async () => {
      db = new Database(':memory:');
      await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    });

    afterEach(async () => {
      await db.close();
    });

    it('should handle multiple statements in exec', async () => {
      await db.exec(`
        INSERT INTO test (name) VALUES ('one');
        INSERT INTO test (name) VALUES ('two');
      `);
      const rows = await db.all('SELECT * FROM test');
      expect(rows).toEqual([
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ]);
    });

    it('should execute pragmas', async () => {
      // This is a simple way to test pragmas. The actual result might vary by driver.
      // The main point is that it doesn't throw.
      const result = await db.get('PRAGMA user_version;');
      expect(result).toBeDefined();
    });

    it('should be idempotent when closing the database', async () => {
      await db.close();
      await expect(db.close()).resolves.toBeUndefined();
    });

    it('should return the raw underlying database object', async () => {
      const rawDb = await db.raw();
      expect(rawDb).toBeDefined();
      // We can't easily assert the exact type here as it's driver-specific,
      // but we can check if it's a non-null object.
      expect(typeof rawDb).toBe('object');
      expect(rawDb).not.toBeNull();
    });
  });

  describe('Database.pragma()', () => {
    const dbPath = './test-pragma.db';
    let db: Database;

    beforeEach(async () => {
      db = new Database(dbPath);
    });

    afterEach(async () => {
      await db.close();
      try {
        await fs.unlink(dbPath);
      } catch (e) {
        // Ignore errors
      }
    });

    it('should set and get a pragma value', async () => {
      await db.pragma('journal_mode = WAL');
      const journalMode = await db.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');
    });

    it('should get a pragma value with simple: true', async () => {
      await db.pragma('user_version = 123');
      const userVersion = await db.pragma('user_version', { simple: true });
      expect(userVersion).toBe(123);
    });

    it('should get a pragma value with simple: false', async () => {
      await db.pragma('user_version = 456');
      const userVersion = await db.pragma('user_version');
      expect(userVersion).toEqual([{ user_version: 456 }]);
    });
  });

  describe('Database.attach()', () => {
    let db: Database;

    beforeEach(async () => {
      db = new Database(':memory:');
    });

    afterEach(async () => {
      await db.close();
    });

    it('should attach another database and query it', async () => {
      await db.exec('CREATE TABLE main_test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.run("INSERT INTO main_test (name) VALUES ('main-db')");

      await db.attach('attached_db', ':memory:');

      await db.exec('CREATE TABLE attached_db.attached_test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.run("INSERT INTO attached_db.attached_test (name) VALUES ('attached-db')");

      const mainRow = await db.get('SELECT * FROM main_test');
      expect(mainRow).toEqual({ id: 1, name: 'main-db' });

      const attachedRow = await db.get('SELECT * FROM attached_db.attached_test');
      expect(attachedRow).toEqual({ id: 1, name: 'attached-db' });
    });
  });

  it('should throw an error when trying to write to a readonly database', async () => {
    const db = new Database(':memory:', { readOnly: true });
    await expect(
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    ).rejects.toThrow();
    await db.close();
  });

  it('should reject with an error for invalid SQL', async () => {
    const db = new Database(':memory:');
    await expect(db.exec('CREATE TABLE')).rejects.toThrow();
    await db.close();
  });

  it('should reject when using a closed database', async () => {
    const db = new Database(':memory:');
    await db.close();
    await expect(db.exec('CREATE TABLE test (id INTEGER)')).rejects.toThrow();
  });

  it('should throw an error for an unknown driver', async () => {
    process.env['ISOMORPHIC_SQLITE_DRIVER'] = 'unknown';
    const db = new Database(':memory:');
    await expect(db.exec('SELECT 1')).rejects.toThrow('Unknown driver: unknown');
  });

  it('should fail to load a non-existent extension', async () => {
    const db = new Database(':memory:');
    await expect(db.loadExtension('./non-existent-extension')).rejects.toThrow();
    await db.close();
  });

  describe('Database.function()', () => {
    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] !== 'bun:sqlite') {
      it('should register a custom function', async () => {
        const db = new Database(':memory:');
        await db.function('toUpperCase', (str) => str.toUpperCase());
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        await db.run("INSERT INTO test (name) VALUES ('hello')");
        const row = await db.get<{ name: string }>('SELECT toUpperCase(name) as name FROM test');
        expect(row?.name).toBe('HELLO');
        await db.close();
      });
    }

    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] === 'bun:sqlite') {
      it('should throw an error when using bun:sqlite', async () => {
        const db = new Database(':memory:');
        await expect(db.function('test', () => {})).rejects.toThrow(
          'Custom functions are not supported by this driver.'
        );
        await db.close();
      });
    }
  });

  describe('Database.aggregate()', () => {
    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] !== 'bun:sqlite') {
      it('should register a custom aggregate function', async () => {
        const db = new Database(':memory:');
        await db.aggregate('sumint', {
          start: 0,
          step: (total, next) => total + next,
        });
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');
        await db.run('INSERT INTO test (value) VALUES (1), (2), (3)');
        const result = await db.get<{ total: number }>('SELECT sumint(value) as total FROM test');
        expect(result?.total).toBe(6);
        await db.close();
      });
    }

    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] === 'bun:sqlite') {
      it('should throw an error when using bun:sqlite', async () => {
        const db = new Database(':memory:');
        await expect(db.aggregate('test', { step: () => {} })).rejects.toThrow(
          'Custom aggregate functions are not supported by this driver.'
        );
        await db.close();
      });
    }
  });

  describe('Database.backup()', () => {
    const backupPath = './test-backup.db';

    afterEach(async () => {
      try {
        await fs.unlink(backupPath);
      } catch (e) {
        // Ignore errors if the file doesn't exist
      }
    });

    it('should create a backup of the database', async () => {
      const db = new Database(':memory:');
      await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.run("INSERT INTO test (name) VALUES ('test-name')");

      const result = await db.backup(backupPath);
      expect(result.totalPages).toBeGreaterThan(0);
      expect(result.remainingPages).toBe(0);

      const backupDb = new Database(backupPath);
      const row = await backupDb.get('SELECT * FROM test');
      expect(row).toEqual({ id: 1, name: 'test-name' });

      await db.close();
      await backupDb.close();
    });
  });

  describe('Database Serialization', () => {
    it('should serialize and deserialize the database', async () => {
      const db = new Database(':memory:');
      await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.run("INSERT INTO test (name) VALUES ('test-name')");

      const buffer = await db.serialize();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const restoredDb = new Database(buffer);
      const row = await restoredDb.get('SELECT * FROM test');
      expect(row).toEqual({ id: 1, name: 'test-name' });

      await db.close();
      await restoredDb.close();
    });
  });

  describe('options', () => {
    it('should enforce foreign key constraints', async () => {
      const db = new Database(':memory:', { enableForeignKeyConstraints: true });
      await db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
      await db.exec(
        'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER, FOREIGN KEY (parent_id) REFERENCES parent(id))'
      );
      await expect(db.run('INSERT INTO child (parent_id) VALUES (1)')).rejects.toThrow();
      await db.close();
    });

    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] === 'node:sqlite') {
      it('should return arrays when returnArrays is true', async () => {
        const db = new Database(':memory:', { returnArrays: true });
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        await db.run("INSERT INTO test (name) VALUES ('test-name')");
        const row = await db.get('SELECT * FROM test WHERE id = 1');
        expect(Array.isArray(row)).toBe(true);
        expect(row).toEqual([1, 'test-name']);
        await db.close();
      });
    }

    if (process.env['ISOMORPHIC_SQLITE_DRIVER'] === 'bun:sqlite') {
      it('should return safe integers when safeIntegers is true', async () => {
        const db = new Database(':memory:', { safeIntegers: true });
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');
        const largeInt = 9007199254740991n; // Number.MAX_SAFE_INTEGER
        await db.run('INSERT INTO test (value) VALUES (?)', [largeInt]);
        const row = await db.get<{ id: number; value: bigint }>('SELECT * FROM test WHERE id = 1');
        expect(typeof row?.value).toBe('bigint');
        expect(row?.value).toBe(largeInt);
        await db.close();
      });
    }

    describe('driver', () => {
      // This test is specific to the node environment because we can reliably test the fallback
      if (getRuntime() === 'node') {
        it('should force the use of better-sqlite3 when specified', async () => {
          const db = new Database(':memory:', { driver: 'better-sqlite3' });
          const rawDb = await db.raw();
          expect(rawDb.constructor.name).toBe('Database');
          await db.close();
        });
      }
    });
  });

  describe('Database Promise Queue', () => {
    let db: Database;

    beforeAll(async () => {
      db = new Database(':memory:');
      await db.exec('CREATE TABLE queue_test (id INTEGER PRIMARY KEY, value INTEGER)');
    });

    afterAll(async () => {
      await db.close();
    });

    it('should execute operations sequentially without await', async () => {
      const promises = [];
      // Fire off 10 inserts without awaiting them
      for (let i = 1; i <= 10; i++) {
        promises.push(db.run('INSERT INTO queue_test (value) VALUES (?)', [i]));
      }

      // Wait for all promises to resolve
      await Promise.all(promises);

      // Check if the data is consistent and ordered
      const rows = await db.all<{ id: number; value: number }>(
        'SELECT * FROM queue_test ORDER BY id ASC'
      );
      expect(rows.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(rows[i].id).toBe(i + 1);
        expect(rows[i].value).toBe(i + 1);
      }
    });
  });
});
