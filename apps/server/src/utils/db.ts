export function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeForDb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function parseJsonObject(value: unknown): Record<string, unknown>;
export function parseJsonObject(value: unknown, allowUndefined: true): Record<string, unknown> | undefined;
export function parseJsonObject(value: unknown, allowUndefined?: boolean): Record<string, unknown> | undefined {
  const fallback = allowUndefined ? undefined : {};
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : fallback;
    } catch {
      return fallback;
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : fallback;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}
