import type { DatabaseSync as NodeDatabase, StatementSync as NodeStatement } from 'node:sqlite';
import type { Database as Sqlite3Database, Statement as Sqlite3Statement } from 'better-sqlite3';
import type { Database as BunDatabase, Statement as BunStatement } from 'bun:sqlite';

/**
 * Represents the union of all supported database drivers.
 */
export type DriverDatabase = NodeDatabase | Sqlite3Database | BunDatabase;

/**
 * Represents the union of all supported statement drivers.
 */
export type DriverStatement = NodeStatement | Sqlite3Statement | BunStatement;

export type AnyFunc = (...args: any[]) => any;

/**
 * Represents the parameters for a query. Can be an array of values for
 * positional placeholders, or an object for named placeholders.
 */
export type Params = unknown[] | Record<string, unknown>;

/**
 * Options for configuring a database connection.
 */
export interface DatabaseOptions {
  /**
   * The driver to use. If not specified, the best available driver will be used.
   */
  driver?: 'node:sqlite' | 'bun:sqlite' | 'better-sqlite3';
  /**
   * If `true`, the database is opened in read-only mode.
   * If the database does not exist, opening it will fail.
   * @default false
   */
  readOnly?: boolean;
  /**
   * The busy timeout in milliseconds.
   * @default 0
   */
  busyTimeout?: number;
  /**
   * If `true`, foreign key constraints are enabled.
   * @default true
   */
  enableForeignKeyConstraints?: boolean;
  /**
   * If `true`, integer fields are read as JavaScript `BigInt` values.
   * @default false
   */
  safeIntegers?: boolean;
  /**
   * If `true`, query results are returned as arrays instead of objects.
   * @default false
   */
  returnArrays?: boolean;
}

/**
 * Represents the result of a `run` operation.
 */
export interface RunResult {
  /**
   * The row ID of the last row inserted.
   */
  lastID: number | bigint;
  /**
   * The number of rows affected by the query.
   */
  changes: number | bigint;
}

/**
 * Options for creating a user-defined function.
 */
export interface FunctionOptions {
  /**
   * If `true`, the function can be invoked with any number of arguments.
   * @default false
   */
  varargs?: boolean;
  /**
   * If `true`, the function is deterministic and always returns the same result for the same input.
   * @default false
   */
  deterministic?: boolean;
  /**
   * If `true`, the function can only be used in top-level SQL statements, not in subqueries or views.
   * @default false
   */
  directOnly?: boolean;
}

/**
 * Options for creating a user-defined aggregate function.
 */
export interface AggregateOptions<T = any> {
  /**
   * The initial value of the accumulator.
   */
  start?: T | (() => T);
  /**
   * A function called for each row in the group.
   * It receives the current accumulator value and the row's arguments.
   * The return value becomes the new accumulator value.
   */
  step: (accumulator: T, ...args: any[]) => T;
  /**
   * (Optional) A function called to retrieve the final result from the accumulator.
   * If not provided, the final accumulator value is used as the result.
   */
  result?: (accumulator: T) => any;
  /**
   * (Optional) For window functions, a function to remove a value from the accumulator.
   */
  inverse?: (accumulator: T, ...droppedArgs: any[]) => T;
}

/**
 * Represents a prepared statement.
 */
export interface IStatement {
  /**
   * Executes the prepared statement.
   * @param params The parameters to bind to the statement.
   */
  run(params?: Params): Promise<RunResult>;

  /**
   * Executes the prepared statement and returns the first row.
   * @param params The parameters to bind to the statement.
   */
  get<T>(params?: Params): Promise<T | undefined>;

  /**
   * Executes the prepared statement and returns all rows.
   * @param params The parameters to bind to the statement.
   */
  all<T>(params?: Params): Promise<T[]>;

  /**
   * Executes the prepared statement and returns an async iterator for the result rows.
   * @param params The parameters to bind to the statement.
   */
  iterate<T>(params?: Params): AsyncIterableIterator<T>;

  /**
   * Modifies the statement to return only the value of the first column from each row.
   * @param toggle Whether to enable or disable pluck mode. Defaults to `true`.
   */
  pluck(toggle?: boolean): this;

  /**
   * Retrieves information about the columns returned by the prepared statement.
   */
  columns(): Promise<ColumnDefinition[]>;
}

/**
 * Represents the metadata of a result column.
 */
export interface ColumnDefinition {
  /**
   * The name assigned to the column in the result set.
   */
  name: string;
  /**
   * The unaliased name of the column in the origin table, or `null` if it cannot be determined.
   */
  column: string | null;
  /**
   * The unaliased name of the origin table, or `null` if it cannot be determined.
   */
  table: string | null;
  /**
   * The unaliased name of the origin database, or `null` if it cannot be determined.
   */
  database: string | null;
  /**
   * The declared data type of the column, or `null` if it cannot be determined.
   */
  type: string | null;
}

/**
 * Options for a database backup operation.
 */
export interface BackupOptions {
  /**
   * A function that is called with the progress of the backup.
   * @returns A number indicating how long to wait before the next backup step, in milliseconds.
   */
  progress: (meta: BackupMetadata) => number;
}

export interface BackupMetadata {
  /**
   * The total number of pages in the source database.
   */
  totalPages: number;
  /**
   * The number of pages remaining to be backed up.
   */
  remainingPages: number;
}

/**
 * Options for a pragma query.
 */
export interface PragmaOptions {
  /**
   * If `true`, the pragma returns a single value instead of a full result set.
   * @default false
   */
  simple?: boolean;
}

/**
 * Represents a database connection.
 */
export interface IDatabase {
  /**
   * Executes an SQL query that does not return any rows.
   * @param sql The SQL query to execute.
   * @param params The parameters to bind to the query.
   */
  run(sql: string, params?: Params): Promise<RunResult>;

  /**
   * Executes an SQL query that returns a single row.
   * @param sql The SQL query to execute.
   * @param params The parameters to bind to the query.
   */
  get<T>(sql: string, params?: Params): Promise<T | undefined>;

  /**
   * Executes an SQL query that returns an array of rows.
   * @param sql The SQL query to execute.
   * @param params The parameters to bind to the query.
   */
  all<T>(sql: string, params?: Params): Promise<T[]>;

  /**
   * Prepares an SQL statement for execution.
   * @param sql The SQL query to prepare.
   */
  prepare(sql: string): Promise<IStatement>;

  /**
   * Executes multiple SQL statements.
   * @param sql The SQL statements to execute.
   */
  exec(sql: string): Promise<void>;

  /**
   * Begins a transaction.
   */
  begin(): Promise<void>;

  /**
   * Commits a transaction.
   */
  commit(): Promise<void>;

  /**
   * Rolls back a transaction.
   */
  rollback(): Promise<void>;

  /**
   * Creates a function that always runs inside a transaction.
   * @param fn The callback which runs inside a transaction. It is passed a
   *           transaction-specific database object `tx` to perform operations on.
   */
  transaction<A extends any[], T>(
    fn: (tx: ITransaction, ...args: A) => T
  ): Transaction<A, Promise<T>>;

  /**
   * Registers a user-defined function.
   * @param name The name of the function.
   * @param cb The callback to execute.
   */
  function(name: string, cb: AnyFunc): Promise<void>;
  /**
   * Registers a user-defined function.
   * @param name The name of the function.
   * @param options The options for the function.
   * @param cb The callback to execute.
   */
  function(name: string, options: FunctionOptions, cb: AnyFunc): Promise<void>;

  /**
   * Registers a user-defined aggregate function.
   * @param name The name of the aggregate function.
   * @param options The options for the aggregate function.
   */
  aggregate(name: string, options: AggregateOptions): Promise<void>;

  /**
   * Loads a SQLite extension.
   * @param path The path to the extension file.
   */
  loadExtension(path: string): Promise<void>;

  /**
   * Creates a backup of the database.
   * @param destinationFile The path to the backup file.
   * @param options The options for the backup.
   */
  backup(destinationFile: string, options?: BackupOptions): Promise<BackupMetadata>;

  /**
   * Executes a PRAGMA statement.
   * @param sql The PRAGMA statement to execute.
   * @param options The options for the pragma.
   */
  pragma(sql: string, options?: PragmaOptions): Promise<any>;

  /**
   * Attaches another database file to the current connection.
   * @param alias The alias to use for the attached database.
   * @param path The path to the database file to attach.
   */
  attach(alias: string, path: string): Promise<void>;

  /**
   * Serializes the database into a buffer.
   * @param name The name of the database to serialize. Defaults to 'main'.
   */
  serialize(name?: string): Promise<Buffer>;

  /**
   * Closes the database connection.
   */
  close(): Promise<void>;

  /**
   * Returns the raw, underlying database instance.
   * This is useful for accessing driver-specific, non-isomorphic features.
   */
  raw(): Promise<any>;
}

/**
 * Represents a database connection within a transaction.
 */
export type ITransaction = Omit<
  IDatabase,
  'backup' | 'serialize' | 'close' | 'begin' | 'commit' | 'rollback'
>;

/**
 * Represents a function that executes a transaction. It can be called directly
 * for a default transaction, or its methods can be called for specific
 * transaction behaviors.
 */
export type Transaction<A extends any[] = any[], T = any> = {
  (...args: A): T;
  /**
   * Begins a DEFERRED transaction.
   */
  deferred(...args: A): T;
  /**
   * Begins an IMMEDIATE transaction.
   */
  immediate(...args: A): T;
  /**
   * Begins an EXCLUSIVE transaction.
   */
  exclusive(...args: A): T;
};
