import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Database } from './database';

describe('Statement', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.exec(
      'CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value INTEGER, data BLOB)'
    );
    await db.run('INSERT INTO test (name, value, data) VALUES (?, ?, ?)', [
      'one',
      1,
      Buffer.from('one'),
    ]);
    await db.run('INSERT INTO test (name, value, data) VALUES (?, ?, ?)', [
      'two',
      2,
      Buffer.from('two'),
    ]);
    await db.run('INSERT INTO test (name, value, data) VALUES (?, ?, ?)', [
      'three',
      3,
      Buffer.from('three'),
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should use a prepared statement to insert and select', async () => {
    const stmt = await db.prepare('INSERT INTO test (name) VALUES (?)');
    await stmt.run(['test-name-1']);
    await stmt.run(['test-name-2']);
    const rows = await db.all<{ id: number; name: string; value: null; data: null }>(
      'SELECT * FROM test WHERE name LIKE ?',
      ['test-name-%']
    );
    expect(rows).toEqual([
      { id: 4, name: 'test-name-1', value: null, data: null },
      { id: 5, name: 'test-name-2', value: null, data: null },
    ]);
  });

  it('should iterate over results from a prepared statement', async () => {
    const stmt = await db.prepare('INSERT INTO test (name) VALUES (?)');
    await stmt.run(['test-name-1']);
    await stmt.run(['test-name-2']);

    const selectStmt = await db.prepare('SELECT * FROM test');
    const rows = [];
    for await (const row of selectStmt.iterate()) {
      rows.push(row);
    }
    expect(rows).toHaveLength(5);
  });

  describe('run()', () => {
    it('should run a statement without parameters', async () => {
      const stmt = await db.prepare("INSERT INTO test (name) VALUES ('four')");
      const result = await stmt.run();
      expect(result.changes).toBe(1);
      expect(result.lastID).toBe(4);
    });

    it('should run a statement with positional parameters', async () => {
      const stmt = await db.prepare('INSERT INTO test (name, value) VALUES (?, ?)');
      const result = await stmt.run(['four', 4]);
      expect(result.changes).toBe(1);
      expect(result.lastID).toBe(4);
    });

    it('should run a statement with named parameters', async () => {
      const stmt = await db.prepare('INSERT INTO test (name, value) VALUES ($name, $value)');
      const result = await stmt.run({ $name: 'four', $value: 4 });
      expect(result.changes).toBe(1);
      expect(result.lastID).toBe(4);
    });

    it('should handle BigInt parameters', async () => {
      await db.exec('CREATE TABLE big (id INTEGER PRIMARY KEY, val TEXT)');
      const stmt = await db.prepare('INSERT INTO big (val) VALUES (?)');
      const bigIntValue = 9007199254740993n;
      await stmt.run([bigIntValue]);
      const row = await db.get<{ val: string }>('SELECT val FROM big WHERE id = 1');
      expect(row?.val).toBe(bigIntValue.toString());
    });

    it('should reject on constraint violation', async () => {
      await db.exec('CREATE TABLE unique_test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
      const stmt = await db.prepare('INSERT INTO unique_test (name) VALUES (?)');
      await stmt.run(['test']);
      await expect(stmt.run(['test'])).rejects.toThrow();
    });
  });

  describe('get()', () => {
    it('should get a row without parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id = 1');
      const row = await stmt.get();
      expect(row).toEqual({ id: 1, name: 'one', value: 1, data: Buffer.from('one') });
    });

    it('should get a row with positional parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id = ?');
      const row = await stmt.get([2]);
      expect(row).toEqual({ id: 2, name: 'two', value: 2, data: Buffer.from('two') });
    });

    it('should get a row with named parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id = $id');
      const row = await stmt.get({ $id: 3 });
      expect(row).toEqual({ id: 3, name: 'three', value: 3, data: Buffer.from('three') });
    });

    it('should return undefined if no row is found', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id = ?');
      const row = await stmt.get([99]);
      expect(row).toBeUndefined();
    });

    it('should reject if table is dropped after prepare', async () => {
      const stmt = await db.prepare('SELECT * FROM test');
      await db.exec('DROP TABLE test');
      await expect(stmt.get()).rejects.toThrow();
    });
  });

  describe('all()', () => {
    it('should get all rows without parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test ORDER BY id');
      const rows = await stmt.all();
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ id: 1, name: 'one', value: 1, data: Buffer.from('one') });
    });

    it('should get all rows with positional parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE value > ?');
      const rows = await stmt.all<{ name: string }>([1]);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('two');
    });

    it('should get all rows with named parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE value > $value');
      const rows = await stmt.all<{ name: string }>({ $value: 1 });
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('two');
    });

    it('should return an empty array if no rows are found', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id > ?');
      const rows = await stmt.all([99]);
      expect(rows).toEqual([]);
    });

    it('should reject if table is dropped after prepare', async () => {
      const stmt = await db.prepare('SELECT * FROM test');
      await db.exec('DROP TABLE test');
      await expect(stmt.all()).rejects.toThrow();
    });

    it('should get all rows from a prepared statement without parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test');
      const rows = await stmt.all();
      expect(rows.length).toBe(3);
    });
  });

  describe('iterate()', () => {
    it('should iterate over rows without parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test ORDER BY id');
      const rows = [];
      for await (const row of stmt.iterate()) {
        rows.push(row);
      }
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ id: 1, name: 'one', value: 1, data: Buffer.from('one') });
    });

    it('should iterate over rows with positional parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE value > ?');
      const rows = [];
      for await (const row of stmt.iterate([1])) {
        rows.push(row);
      }
      expect(rows).toHaveLength(2);
    });

    it('should iterate over rows with named parameters', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE value > $value');
      const rows = [];
      for await (const row of stmt.iterate({ $value: 1 })) {
        rows.push(row);
      }
      expect(rows).toHaveLength(2);
    });

    it('should produce an empty iterator if no rows are found', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id > ?');
      const rows = [];
      for await (const row of stmt.iterate([99])) {
        rows.push(row);
      }
      expect(rows).toEqual([]);
    });

    it('should reject if table is dropped after prepare', async () => {
      const stmt = await db.prepare('SELECT * FROM test');
      await db.exec('DROP TABLE test');
      const iterator = stmt.iterate();
      await expect(iterator.next()).rejects.toThrow();
    });
  });

  describe('columns()', () => {
    it('should return column definitions for a simple query', async () => {
      const stmt = await db.prepare('SELECT id, name FROM test');
      const columns = await stmt.columns();

      expect(columns).toBeInstanceOf(Array);
      expect(columns.length).toBe(2);

      expect(columns[0].name).toBe('id');
      expect(columns[0].type).toMatch(/integer/i);

      expect(columns[1].name).toBe('name');
      expect(columns[1].type).toMatch(/text/i);
    });

    it('should return column definitions for a query with aliases and expressions', async () => {
      const stmt = await db.prepare("SELECT id as userID, name, 'active' as status FROM test");
      const columns = await stmt.columns();

      expect(columns.length).toBe(3);

      expect(columns[0].name).toBe('userID');
      expect(columns[0].type).toMatch(/integer/i);

      expect(columns[1].name).toBe('name');
      expect(columns[1].type).toMatch(/text/i);

      expect(columns[2].name).toBe('status');
      // Expression types can be inconsistent, so we check for a string or null
      expect(columns[2].type).toBeDefined();
      expect(columns[2].column).toBeNull();
      expect(columns[2].table).toBeNull();
    });

    it('should return column definitions for a statement that has not been run', async () => {
      const stmt = await db.prepare('SELECT id, name FROM test');
      const columns = await stmt.columns();
      expect(columns).toHaveLength(2);
      expect(columns[0].name).toBe('id');
      expect(columns[1].name).toBe('name');
    });
  });

  describe('pluck()', () => {
    it('should get the first column value using get()', async () => {
      const stmt = await db.prepare('SELECT name, value FROM test WHERE id = 1');
      const name = await stmt.pluck().get<string>();
      expect(name).toBe('one');
    });

    it('should get an array of first column values using all()', async () => {
      const stmt = await db.prepare('SELECT name FROM test ORDER BY id');
      const names = await stmt.pluck().all<string>();
      expect(names).toEqual(['one', 'two', 'three']);
    });

    it('should iterate over first column values using iterate()', async () => {
      const stmt = await db.prepare('SELECT name FROM test ORDER BY id');
      const names = [];
      for await (const name of stmt.pluck().iterate<string>()) {
        names.push(name);
      }
      expect(names).toEqual(['one', 'two', 'three']);
    });

    it('should be possible to toggle pluck mode off', async () => {
      const stmt = await db.prepare('SELECT * FROM test WHERE id = 1');
      const name = await stmt.pluck(true).get<string>();
      expect(name).toBe(1); // Plucks the 'id' column

      const fullRow = await stmt.pluck(false).get<{ id: number; name: string }>();
      expect(fullRow).toEqual({ id: 1, name: 'one', value: 1, data: Buffer.from('one') });
    });

    it('should return undefined from get() when no row is found', async () => {
      const stmt = await db.prepare('SELECT name FROM test WHERE id = 99');
      const result = await stmt.pluck().get();
      expect(result).toBeUndefined();
    });

    it('should return an empty array from all() when no rows are found', async () => {
      const stmt = await db.prepare('SELECT name FROM test WHERE id = 99');
      const result = await stmt.pluck().all();
      expect(result).toEqual([]);
    });

    it('should allow chaining', async () => {
      const name = await db
        .prepare('SELECT name, value FROM test WHERE id = 1')
        .then((s) => s.pluck().get<string>());
      expect(name).toBe('one');
    });
  });
});
