import type { ColumnDefinition, IStatement, Params, RunResult } from '@/typings';
import { transformParams, transformResult } from '@/utils';

export class BaseStatement implements IStatement {
  #isPlucked = false;

  constructor(
    protected _statement: any,
    private readonly stripPrefixes = false
  ) {}

  pluck(toggle = true): this {
    this.#isPlucked = toggle;
    return this;
  }

  #transformPlucked(row: unknown): unknown {
    if (row && typeof row === 'object') {
      const keys = Object.keys(row);
      if (keys.length > 0) {
        return (row as Record<string, unknown>)[keys[0]];
      }
    }
    return undefined;
  }

  run(params: Params = []): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      try {
        const finalParams = transformParams(params, this.stripPrefixes);
        const result = this._statement.run(
          ...(Array.isArray(finalParams) ? finalParams : [finalParams])
        );
        resolve({
          lastID: result.lastInsertRowid,
          changes: result.changes,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  get<T>(params: Params = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      try {
        const finalParams = transformParams(params, this.stripPrefixes);
        const result = this._statement.get(
          ...(Array.isArray(finalParams) ? finalParams : [finalParams])
        );
        if (result === null || result === undefined) {
          resolve(undefined);
          return;
        }
        if (this.#isPlucked) {
          resolve(this.#transformPlucked(result) as T | undefined);
          return;
        }
        resolve(transformResult(result) as T | undefined);
      } catch (err) {
        reject(err);
      }
    });
  }

  all<T>(params: Params = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      try {
        const finalParams = transformParams(params, this.stripPrefixes);
        const result = this._statement.all(
          ...(Array.isArray(finalParams) ? finalParams : [finalParams])
        );
        if (this.#isPlucked) {
          resolve(result.map((row: unknown) => this.#transformPlucked(row)) as T[]);
          return;
        }
        resolve(transformResult(result) as T[]);
      } catch (err) {
        reject(err);
      }
    });
  }

  async *iterate<T>(params: Params = []): AsyncIterableIterator<T> {
    const finalParams = transformParams(params, this.stripPrefixes);
    const result = this._statement.iterate(
      ...(Array.isArray(finalParams) ? finalParams : [finalParams])
    );
    for (const row of result) {
      if (this.#isPlucked) {
        yield this.#transformPlucked(row) as T;
      } else {
        yield transformResult(row) as T;
      }
    }
  }

  columns(): Promise<ColumnDefinition[]> {
    return new Promise((resolve, reject) => {
      try {
        // better-sqlite3 and node:sqlite have a columns() method
        if (typeof this._statement.columns === 'function') {
          resolve(this._statement.columns());
          return;
        }

        // bun:sqlite has columnNames and declaredTypes properties
        if (this._statement.columnNames) {
          // Ensure the statement is executed at least once to populate declaredTypes
          if (!this._statement.declaredTypes) {
            try {
              this._statement.get(); // Execute a dummy query
            } catch (e) {
              // Ignore errors if the query requires parameters
            }
          }

          const columns: ColumnDefinition[] = this._statement.columnNames.map(
            (name: string, i: number) => ({
              name,
              column: null,
              table: null,
              database: null,
              type: this._statement.declaredTypes?.[i] ?? null,
            })
          );
          resolve(columns);
          return;
        }

        reject(new Error('Could not retrieve column information for the statement.'));
      } catch (err) {
        reject(err);
      }
    });
  }
}
