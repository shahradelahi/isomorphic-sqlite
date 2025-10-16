import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Database } from './database';
import type { ITransaction } from './typings';

describe('Database.transaction()', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
  });

  afterEach(async () => {
    await db.close();
  });

  it('should commit a manual transaction', async () => {
    await db.begin();
    await db.run("INSERT INTO test (name) VALUES ('test-name')");
    await db.commit();
    const row = await db.get('SELECT * FROM test');
    expect(row).toEqual({ id: 1, name: 'test-name' });
  });

  it('should rollback a manual transaction', async () => {
    await db.begin();
    await db.run("INSERT INTO test (name) VALUES ('test-name')");
    await db.rollback();
    const row = await db.get('SELECT * FROM test');
    expect(row).toBeUndefined();
  });

  it('should perform a successful transaction', async () => {
    const insert = db.transaction(async (tx: ITransaction, name: string) => {
      const result = await tx.run('INSERT INTO test (name) VALUES (?)', [name]);
      return result;
    });

    const result = await insert('test-name');
    expect(result.lastID).toBe(1);

    const row = await db.get('SELECT * FROM test');
    expect(row).toEqual({ id: 1, name: 'test-name' });
  });

  it('should rollback a failed transaction', async () => {
    const insert = db.transaction(async (tx: ITransaction, name: string) => {
      await tx.run('INSERT INTO test (name) VALUES (?)', [name]);
    });

    await insert('test-name'); // successful
    await expect(insert('test-name')).rejects.toThrow(); // should fail due to UNIQUE constraint

    const rows = await db.all('SELECT * FROM test');
    expect(rows.length).toBe(1); // only the first one should be there
    expect(rows[0]).toEqual({ id: 1, name: 'test-name' });
  });

  it('should return a value from the transaction', async () => {
    const transacted = db.transaction(() => {
      return 42;
    });
    const result = await transacted();
    expect(result).toBe(42);
  });

  it('should work with synchronous functions', async () => {
    const insert = db.transaction((tx: ITransaction, name: string) => {
      return tx.run('INSERT INTO test (name) VALUES (?)', [name]);
    });
    await insert('test-name');
    const row = await db.get('SELECT * FROM test');
    expect(row).toEqual({ id: 1, name: 'test-name' });
  });

  it('should handle empty transactions', async () => {
    const transacted = db.transaction(() => {});
    await transacted();
    const rows = await db.all('SELECT * FROM test');
    expect(rows).toEqual([]);
  });

  it('should handle multiple operations in a transaction', async () => {
    const insertMultiple = db.transaction(async (tx: ITransaction) => {
      await tx.run("INSERT INTO test (name) VALUES ('test-1')");
      await tx.run("INSERT INTO test (name) VALUES ('test-2')");
    });
    await insertMultiple();
    const rows = await db.all('SELECT * FROM test');
    expect(rows.length).toBe(2);
  });

  it('should re-throw the exact error from the transaction function', async () => {
    const myError = new Error('My custom error');
    const transacted = db.transaction(() => {
      throw myError;
    });
    await expect(transacted()).rejects.toThrow(myError);
  });

  it('should rollback transaction if a non-Error is thrown', async () => {
    const insert = db.transaction(async (tx: ITransaction) => {
      await tx.run("INSERT INTO test (name) VALUES ('should-be-rolled-back')");
      throw 'a string error';
    });

    await expect(insert()).rejects.toBe('a string error');

    const row = await db.get('SELECT * FROM test');
    expect(row).toBeUndefined();
  });

  describe('nested transactions', () => {
    it('should handle nested transactions with savepoints', async () => {
      const outerTransaction = db.transaction(async (tx, name1: string, name2: string) => {
        const innerTransaction = tx.transaction(async (innerTx: ITransaction, name: string) => {
          await innerTx.run('INSERT INTO test (name) VALUES (?)', [name]);
        });
        await innerTransaction(name1);
        await innerTransaction(name2);
      });

      await outerTransaction('nested-1', 'nested-2');

      const rows = await db.all('SELECT * FROM test');
      expect(rows.length).toBe(2);
      expect(rows).toEqual([
        { id: 1, name: 'nested-1' },
        { id: 2, name: 'nested-2' },
      ]);
    });

    it('should rollback the entire transaction if the outer part fails', async () => {
      const outerTransaction = db.transaction(async (tx, name1: string, name2: string) => {
        const innerTransaction = tx.transaction(async (innerTx: ITransaction, name: string) => {
          await innerTx.run('INSERT INTO test (name) VALUES (?)', [name]);
        });
        await innerTransaction(name1);
        await innerTransaction(name2); // This will succeed as a savepoint
        throw new Error('Outer transaction failed');
      });

      await expect(outerTransaction('nested-1', 'nested-2')).rejects.toThrow(
        'Outer transaction failed'
      );

      const rows = await db.all('SELECT * FROM test');
      expect(rows.length).toBe(0);
    });

    it('should rollback only the inner transaction (savepoint) if it fails', async () => {
      const outerTransaction = db.transaction(
        async (tx: ITransaction, name1: string, _name2: string) => {
          const innerTransaction = tx.transaction(async (innerTx: ITransaction, name: string) => {
            await innerTx.run('INSERT INTO test (name) VALUES (?)', [name]);
          });
          await tx.run("INSERT INTO test (name) VALUES ('outer-before')");
          await expect(innerTransaction(name1)).rejects.toThrow(); // Fails due to unique constraint
          await tx.run("INSERT INTO test (name) VALUES ('outer-after')");
        }
      );

      await outerTransaction('outer-before', 'whatever');

      const rows = await db.all<{ name: string }>('SELECT * FROM test');
      expect(rows.length).toBe(2);
      expect(rows[0].name).toBe('outer-before');
      expect(rows[1].name).toBe('outer-after');
    });
  });

  describe('advanced modes', () => {
    it('should commit a deferred transaction', async () => {
      const insert = db.transaction((tx: ITransaction, name: string) => {
        return tx.run('INSERT INTO test (name) VALUES (?)', [name]);
      });
      await insert.deferred('test-name');
      const row = await db.get('SELECT * FROM test');
      expect(row).toEqual({ id: 1, name: 'test-name' });
    });

    it('should commit an immediate transaction', async () => {
      const insert = db.transaction((tx: ITransaction, name: string) => {
        return tx.run('INSERT INTO test (name) VALUES (?)', [name]);
      });
      await insert.immediate('test-name');
      const row = await db.get('SELECT * FROM test');
      expect(row).toEqual({ id: 1, name: 'test-name' });
    });

    it('should commit an exclusive transaction', async () => {
      const insert = db.transaction((tx: ITransaction, name: string) => {
        return tx.run('INSERT INTO test (name) VALUES (?)', [name]);
      });
      await insert.exclusive('test-name');
      const row = await db.get('SELECT * FROM test');
      expect(row).toEqual({ id: 1, name: 'test-name' });
    });
  });
});
