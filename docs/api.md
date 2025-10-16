# API

- [class `Database`](#class-database)
- [class `Statement`](#class-statement)

---

## class _Database_

Creates a new database connection. If the database file does not exist, it is created. This happens asynchronously, so you must wait for the promise to resolve before executing queries.

### `new Database(path, [options])`

Creates a new database connection.

- `path`: The path to the database file. Can be `':memory:'` for an in-memory database, or a buffer from `database.serialize()`.
- `options` (optional): An object with the following properties:
  - `driver`: The driver to use (`'node:sqlite'`, `'bun:sqlite'`, or `'better-sqlite3'`). If not specified, the best available driver is used.
  - `readOnly`: If `true`, the database is opened in read-only mode. Default: `false`.
  - `busyTimeout`: The busy timeout in milliseconds. Default: `0`.
  - `enableForeignKeyConstraints`: If `true`, foreign key constraints are enabled. Default: `true`.
  - `safeIntegers`: If `true`, integer fields are read as JavaScript `BigInt` values. Default: `false`.
  - `returnArrays`: If `true`, query results are returned as arrays instead of objects. Default: `false`.

```typescript
import { Database } from 'isomorphic-sqlite';

const db = new Database('mydatabase.db');
```

### `database.prepare(sql)`

Creates a new prepared `Statement` from the given SQL string.

Returns a `Promise<Statement>`.

```typescript
const stmt = await db.prepare('SELECT name, age FROM cats');
```

### `database.transaction(fn)`

Creates a function that always runs inside a transaction. When the function is invoked, it will begin a new transaction. When the function returns, the transaction will be committed. If an exception is thrown, the transaction will be rolled back.

The transaction function can be `async`.

```typescript
const insert = db.transaction(async (tx, cats) => {
  const stmt = await tx.prepare(
    'INSERT INTO cats (name, age) VALUES (@name, @age)'
  );
  for (const cat of cats) {
    await stmt.run(cat);
  }
});

await insert([
  { name: 'Joey', age: 2 },
  { name: 'Sally', age: 4 },
]);
```

Transactions also come with `deferred`, `immediate`, and `exclusive` versions.

```typescript
await insert.deferred(cats); // uses "BEGIN DEFERRED"
await insert.immediate(cats); // uses "BEGIN IMMEDIATE"
await insert.exclusive(cats); // uses "BEGIN EXCLUSIVE"
```

### `database.pragma(sql, [options])`

Executes a `PRAGMA` statement and returns the result.

- `options.simple`: If `true`, returns a single value instead of a full result set. Default: `false`.

Returns a `Promise<any>`.

```typescript
const journalMode = await db.pragma('journal_mode', { simple: true });
console.log(journalMode); // 'wal'
```

### `database.backup(destination, [options])`

Initiates a backup of the database.

- `destination`: The path to the backup file.
- `options.progress`: A function that is called with the progress of the backup.

Returns a `Promise<BackupMetadata>`.

```typescript
await db.backup('backup.db');
```

### `database.serialize([name])`

Serializes the database into a buffer.

- `name`: The name of the database to serialize. Defaults to `'main'`.

Returns a `Promise<Buffer>`.

```typescript
const buffer = await db.serialize();
const restoredDb = new Database(buffer);
```

### `database.function(name, [options], fn)`

Registers a user-defined function.

- `options.varargs`: If `true`, the function can be invoked with any number of arguments.
- `options.deterministic`: If `true`, the function is deterministic.
- `options.directOnly`: If `true`, the function can only be used in top-level SQL statements.

Returns a `Promise<void>`.

```typescript
await db.function('toUpperCase', (str) => str.toUpperCase());
const result = await db.get('SELECT toUpperCase("hello") as name');
// result.name === 'HELLO'
```

### `database.aggregate(name, options)`

Registers a user-defined aggregate function.

- `options.start`: The initial value of the accumulator.
- `options.step`: A function called for each row in the group.
- `options.result`: A function to retrieve the final result from the accumulator.
- `options.inverse`: For window functions, a function to remove a value from the accumulator.

Returns a `Promise<void>`.

```typescript
await db.aggregate('sum_custom', {
  start: 0,
  step: (total, next) => total + next,
});
const result = await db.get('SELECT sum_custom(value) as total FROM items');
```

### `database.loadExtension(path)`

Loads a SQLite extension.

Returns a `Promise<void>`.

```typescript
await db.loadExtension('./my-extension.so');
```

### `database.exec(sql)`

Executes multiple SQL statements.

Returns a `Promise<void>`.

```typescript
await db.exec(`
  CREATE TABLE t1 (id INTEGER PRIMARY KEY);
  CREATE TABLE t2 (id INTEGER PRIMARY KEY);
`);
```

### `database.close()`

Closes the database connection.

Returns a `Promise<void>`.

```typescript
await db.close();
```

### `database.raw()`

Returns the raw, underlying database instance. This is useful for accessing driver-specific, non-isomorphic features.

Returns a `Promise<any>`.

```typescript
const rawDb = await db.raw();
```

---

## class _Statement_

An object representing a single SQL statement.

### `statement.run([params])`

Executes the prepared statement.

- `params`: The parameters to bind to the statement. Can be an array for positional parameters or an object for named parameters.

Returns a `Promise<RunResult>`, which has `lastID` and `changes` properties.

```typescript
const stmt = await db.prepare('INSERT INTO cats (name, age) VALUES (?, ?)');
const info = await stmt.run('Joey', 2);
console.log(info.changes); // 1
```

### `statement.get([params])`

Executes the prepared statement and returns the first row.

Returns a `Promise<T | undefined>`.

```typescript
const stmt = await db.prepare('SELECT age FROM cats WHERE name = ?');
const cat = await stmt.get('Joey');
console.log(cat.age); // 2
```

### `statement.all([params])`

Executes the prepared statement and returns all rows.

Returns a `Promise<T[]>`.

```typescript
const stmt = await db.prepare('SELECT * FROM cats');
const cats = await stmt.all();
```

### `statement.iterate([params])`

Executes the prepared statement and returns an async iterator for the result rows.

```typescript
const stmt = await db.prepare('SELECT * FROM cats');
for await (const cat of stmt.iterate()) {
  console.log(cat.name);
}
```

### `statement.pluck([toggle])`

Modifies the statement to return only the value of the first column from each row.

- `toggle`: Whether to enable or disable pluck mode. Defaults to `true`.

Returns the `Statement` instance for chaining.

```typescript
const stmt = await db.prepare('SELECT name FROM cats');
const names = await stmt.pluck().all(); // ['Joey', 'Sally']
```

### `statement.columns()`

Retrieves information about the columns returned by the prepared statement.

Returns a `Promise<ColumnDefinition[]>`.

```typescript
const stmt = await db.prepare('SELECT id, name FROM cats');
const columns = await stmt.columns();
/*
[
  { name: 'id', type: 'INTEGER', ... },
  { name: 'name', type: 'TEXT', ... }
]
*/
```
