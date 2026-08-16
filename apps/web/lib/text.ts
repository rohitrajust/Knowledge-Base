export function snippet(body: string, length = 140): string {
  const trimmed = body.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length)}...` : trimmed;
}
