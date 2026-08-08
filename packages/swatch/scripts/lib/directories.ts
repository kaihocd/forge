import { lstat, rename, rm } from 'node:fs/promises';

export async function recoverDirectoryReplacement(target: string, backup: string): Promise<void> {
  const [targetExists, backupExists] = await Promise.all([exists(target), exists(backup)]);
  if (!backupExists) return;

  // A missing target means the previous process stopped after preserving the
  // old directory but before publishing its replacement.
  if (!targetExists) {
    await rename(backup, target);
    return;
  }

  // Both entries mean the replacement was published and only cleanup remained.
  await rm(backup, { force: true, recursive: true });
}

export async function replaceDirectory(
  staging: string,
  target: string,
  backup: string,
): Promise<void> {
  await recoverDirectoryReplacement(target, backup);
  const hadTarget = await exists(target);

  if (hadTarget) await rename(target, backup);

  try {
    await rename(staging, target);
  } catch (error) {
    // Keep the last known-good directory available when publishing staging
    // fails. Only restore a backup created by this replacement attempt.
    if (hadTarget) await rename(backup, target);
    throw error;
  }

  if (hadTarget) await rm(backup, { force: true, recursive: true });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
