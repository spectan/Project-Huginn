export type DeedRename = {
  newName: string;
  oldName: string;
};

export function extractDeedNameFromDisbandMessage(message: string): string | null;

export function extractDeedRenameFromMessage(message: string): DeedRename | null;
