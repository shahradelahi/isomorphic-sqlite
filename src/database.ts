import { createDb } from './loader';
import type {
  AggregateOptions,
  AnyFunc,
  BackupMetadata,
  BackupOptions,
  DatabaseOptions,
  FunctionOptions,
  IDatabase,
  IStatement,
  ITransaction,
  Params,
  PragmaOptions,
  RunResult,
  Transaction,
} from './typings';

export class Database implements IDatabase {
  #queue: Promise<any>;

  constructor(filename: string | Buffer, options?: DatabaseOptions) {
    this.#queue = createDb(filename, options);
  }

  static open(filename: string, options?: DatabaseOptions): Database {
    return new Database(filename, options);
  }

  #enqueue<T>(operation: (db: IDatabase) => Promise<T> | T): Promise<T> {
    const resultPromise = this.#queue.then((db) => operation(db as IDatabase));

    const queueUpdatePromise = this.#queue.then(async (db) => {
      try {
        await resultPromise;
      } catch {
        // The error is handled by the caller of the public method.
        // We catch it here to prevent the main queue from breaking.
      }
      return db;
    });

    // Prevent unhandled rejection from createDb failure
    queueUpdatePromise.catch(() => {});

    this.#queue = queueUpdatePromise;

    return resultPromise;
  }

  run(sql: string, params?: Params): Promise<RunResult> {
    return this.#enqueue((db) => db.run(sql, params));
  }

  get<T>(sql: string, params?: Params): Promise<T | undefined> {
    return this.#enqueue((db) => db.get<T>(sql, params));
  }

  all<T>(sql: string, params?: Params): Promise<T[]> {
    return this.#enqueue((db) => db.all<T>(sql, params));
  }

  prepare(sql: string): Promise<IStatement> {
    return this.#enqueue((db) => db.prepare(sql));
  }

  exec(sql: string): Promise<void> {
    return this.#enqueue((db) => db.exec(sql));
  }

  begin(): Promise<void> {
    return this.#enqueue((db) => db.begin());
  }

  commit(): Promise<void> {
    return this.#enqueue((db) => db.commit());
  }

  rollback(): Promise<void> {
    return this.#enqueue((db) => db.rollback());
  }

  transaction<A extends any[], T>(
    fn: (tx: ITransaction, ...args: A) => T
  ): Transaction<A, Promise<T>> {
    const transactional = (...args: A): Promise<T> => {
      return this.#enqueue((db) => db.transaction(fn)(...args));
    };

    transactional.deferred = (...args: A): Promise<T> => {
      return this.#enqueue((db) => db.transaction(fn).deferred(...args));
    };

    transactional.immediate = (...args: A): Promise<T> => {
      return this.#enqueue((db) => db.transaction(fn).immediate(...args));
    };

    transactional.exclusive = (...args: A): Promise<T> => {
      return this.#enqueue((db) => db.transaction(fn).exclusive(...args));
    };

    return transactional as Transaction<A, Promise<T>>;
  }
  function(name: string, options: FunctionOptions | AnyFunc, cb?: AnyFunc): Promise<void> {
    if (typeof options === 'function') {
      return this.#enqueue((db) => db.function(name, options));
    }
    return this.#enqueue((db) => db.function(name, options, cb as AnyFunc));
  }

  aggregate(name: string, options: AggregateOptions): Promise<void> {
    return this.#enqueue((db) => db.aggregate(name, options));
  }

  loadExtension(path: string): Promise<void> {
    return this.#enqueue((db) => db.loadExtension(path));
  }

  backup(destinationFile: string, options?: BackupOptions): Promise<BackupMetadata> {
    return this.#enqueue((db) => db.backup(destinationFile, options));
  }

  pragma(sql: string, options?: PragmaOptions): Promise<any> {
    return this.#enqueue((db) => db.pragma(sql, options));
  }

  attach(alias: string, path: string): Promise<void> {
    return this.#enqueue((db) => db.attach(alias, path));
  }

  serialize(name?: string): Promise<Buffer> {
    return this.#enqueue((db) => db.serialize(name));
  }

  close(): Promise<void> {
    return this.#enqueue((db) => db.close());
  }

  raw(): Promise<any> {
    return this.#enqueue((db) => db.raw());
  }
}
