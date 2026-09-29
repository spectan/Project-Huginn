const DISBAND_PATTERN = /^The settlement of (.+?) has just been disbanded/i;
const RENAME_PATTERN = /^Village (.+?) changed name to (.+?)\.?$/i;

export function extractDeedNameFromDisbandMessage(message) {
  const match = message.match(DISBAND_PATTERN);
  return match?.[1]?.trim() ?? null;
}

export function extractDeedRenameFromMessage(message) {
  const match = message.trim().match(RENAME_PATTERN);
  const oldName = match?.[1]?.trim() ?? "";
  const newName = match?.[2]?.trim() ?? "";

  if (oldName === "" || newName === "" || oldName === newName) {
    return null;
  }

  return { newName, oldName };
}
