// Conditional write: the write only matches rows still in the expected state
// (live, or still restorable), so concurrent races resolve to exactly one
// winner. Returns null when no row matched, otherwise re-reads it.
export async function conditionalWrite<T>(
  write: Promise<{ count: number }>,
  reread: () => Promise<T | null>
): Promise<T | null> {
  const { count } = await write;

  return count === 0 ? null : reread();
}
