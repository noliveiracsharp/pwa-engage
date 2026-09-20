export type Row = Record<string, unknown>;

/** Picks the first present key from a row (schema-tolerant helper). */
export function pick<T = string>(row: Row | null | undefined, keys: string[], fallback?: T): T | undefined {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value as T;
  }
  return fallback;
}

export function findKey(row: Row | null | undefined, keys: string[]): string | undefined {
  if (!row) return undefined;
  return keys.find((key) => key in row);
}
