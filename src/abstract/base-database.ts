import { BaseStatement } from '@/statement';
import type {
  AggregateOptions,
  AnyFunc,
  BackupMetadata,
  BackupOptions,
  DriverDatabase,
  FunctionOptions,
  IDatabase,
  IStatement,
  ITransaction,
  Params,
  PragmaOptions,
  RunResult,
  Transaction,
} from '@/typings';

export abstract class BaseDatabase<T extends DriverDatabase> implements IDatabase {
  protected readonly _db: any;
  #transactionDepth = 0;
  #isClosed = false;

  constructor(db: any) {
    this._db = db;
  }

  run(sql: string, params: Params = []): Promise<RunResult> {
    return this.prepare(sql).then((stmt) => stmt.run(params));
  }

  get<T>(sql: string, params: Params = []): Promise<T | undefined> {
    return this.prepare(sql).then((stmt) => stmt.get<T>(params));
  }

  all<T>(sql: string, params: Params = []): Promise<T[]> {
    return this.prepare(sql).then((stmt) => stmt.all<T>(params));
  }

  prepare(sql: string): Promise<IStatement> {
    return new Promise<IStatement>((resolve, reject) => {
      try {
        const statement = this._db.prepare(sql);
        resolve(new BaseStatement(statement));
      } catch (err) {
        reject(err);
      }
    });
  }

  exec(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this._db.exec(sql);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function(name: string, options: FunctionOptions | AnyFunc, cb?: AnyFunc): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (typeof options === 'function') {
          this._db.function(name, options);
        } else {
          this._db.function(name, options, cb as AnyFunc);
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  async aggregate(name: string, options: AggregateOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this._db.aggregate(name, options);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  pragma(sql: string, options: PragmaOptions = {}): Promise<any> {
    const statement = `PRAGMA ${sql}`;
    if (options.simple) {
      return this.get(statement).then((row) => (row ? Object.values(row)[0] : undefined));
    }
    return this.all(statement);
  }

  attach(alias: string, path: string): Promise<void> {
    return this.exec(`ATTACH DATABASE '${path.replace(/'/g, "''")}' AS ${alias}`);
  }

  backup(_destinationFile: string, _options?: BackupOptions): Promise<BackupMetadata> {
    return Promise.reject(new Error('Database backup is not supported by this driver.'));
  }

  serialize(_name?: string): Promise<Buffer> {
    return Promise.reject(new Error('Database serialization is not supported by this driver.'));
  }

  loadExtension(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this._db.loadExtension(path);
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.#isClosed) {
        resolve();
        return;
      }
      try {
        this._db.close();
        this.#isClosed = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  begin(): Promise<void> {
    return this.exec('BEGIN');
  }

  commit(): Promise<void> {
    return this.exec('COMMIT');
  }

  rollback(): Promise<void> {
    return this.exec('ROLLBACK');
  }

  transaction<A extends any[], T>(
    fn: (tx: ITransaction, ...args: A) => T
  ): Transaction<A, Promise<T>> {
    const createTransactional = (
      mode: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE' | '' = ''
    ): ((...args: A) => Promise<T>) => {
      return async (...args: A): Promise<T> => {
        const depth = this.#transactionDepth;
        const savepointName = `isomorphic_sqlite_${depth}`;

        try {
          if (depth === 0) {
            await this.exec(`BEGIN ${mode}`);
          } else {
            await this.exec(`SAVEPOINT ${savepointName}`);
          }
          this.#transactionDepth++;

          const result = await fn(this, ...args);

          this.#transactionDepth--;
          if (depth === 0) {
            await this.exec('COMMIT');
          } else {
            await this.exec(`RELEASE SAVEPOINT ${savepointName}`);
          }

          return result;
        } catch (err) {
          if (this.#transactionDepth > 0) {
            if (depth === 0) {
              await this.exec('ROLLBACK');
            } else {
              await this.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            }
          }
          this.#transactionDepth = depth;
          throw err;
        }
      };
    };

    const transactional = createTransactional() as Transaction<A, Promise<T>>;
    transactional.deferred = createTransactional('DEFERRED');
    transactional.immediate = createTransactional('IMMEDIATE');
    transactional.exclusive = createTransactional('EXCLUSIVE');
    return transactional;
  }

  raw(): Promise<T> {
    return Promise.resolve(this._db);
  }
}
