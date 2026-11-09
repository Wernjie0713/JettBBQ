// The client is untyped (no generated DB types), so rows are cast to the shapes callers declare.
// No imports: safe to pull into modules that client components also use.

/** Throw if a Supabase call failed; otherwise return its data as T. */
export function check<T>(label: string, result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

/**
 * What to tell the user for a database error our functions raise on purpose (RAISE EXCEPTION 'CODE'
 * arrives as exactly that message). Exact match, so a longer driver or Postgres message never
 * passes for a known code. Null for anything unexpected: log it and show a generic message.
 */
export function knownErrorMessage<T>(error: { message: string }, byCode: Record<string, T>): T | null {
  return Object.hasOwn(byCode, error.message) ? byCode[error.message] : null;
}
