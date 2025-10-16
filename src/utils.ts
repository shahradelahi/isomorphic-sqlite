import type { Params } from './typings';

export function getRuntime(): 'bun' | 'node' | 'unknown' {
  if (globalThis.Bun) {
    return 'bun';
  }
  if (globalThis.process) {
    return 'node';
  }
  return 'unknown';
}

function transformParam(p: unknown): unknown {
  if (typeof p === 'bigint') {
    return p.toString();
  }
  return p;
}

export function transformParams(params: Params, stripPrefixes = false): Params {
  if (Array.isArray(params)) {
    return params.map(transformParam);
  }

  const newParams: Record<string, unknown> = {};
  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const newKey = stripPrefixes ? key.replace(/^[:@$]/, '') : key;
      newParams[newKey] = transformParam(params[key]);
    }
  }
  return newParams;
}

export function transformResult(res: unknown): unknown {
  if (res instanceof Uint8Array) {
    return Buffer.from(res);
  }
  if (Array.isArray(res)) {
    return res.map(transformResult);
  }
  if (res !== null && typeof res === 'object') {
    const newRes: Record<string, unknown> = {};
    for (const key in res) {
      if (Object.prototype.hasOwnProperty.call(res, key)) {
        newRes[key] = transformResult((res as Record<string, unknown>)[key]);
      }
    }
    return newRes;
  }
  return res;
}
