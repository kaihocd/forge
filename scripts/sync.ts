import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./lib/config.js";
import { expandHome, resolveRepoPath } from "./lib/paths.js";

const args = new Set(process.argv.slice(2));
const isPreview = args.has("--preview");
const unknownArgs = [...args].filter((arg) => arg !== "--preview");

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument: ${unknownArgs.join(", ")}`);
}

async function maybeLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

const config = await loadConfig();

if (config.links.length === 0) {
  console.log("[skip] no links configured");
  process.exit(0);
}

for (const link of config.links) {
  const source = resolveRepoPath(link.source);
  const target = expandHome(link.target);

  const sourceStat = await maybeLstat(source);

  if (!sourceStat) {
    throw new Error(`[missing] ${link.name}: source does not exist: ${source}`);
  }

  const targetStat = await maybeLstat(target);

  if (targetStat?.isSymbolicLink()) {
    const currentTarget = await readlink(target);
    const resolvedCurrentTarget = path.resolve(
      path.dirname(target),
      currentTarget,
    );

    if (resolvedCurrentTarget === source) {
      console.log(`[skip] ${link.name}: already linked`);
      continue;
    }

    if (isPreview) {
      console.log(
        `[conflict] ${link.name}: ${target} points to ${resolvedCurrentTarget}, expected ${source}`,
      );
      continue;
    }

    throw new Error(
      `[conflict] ${link.name}: ${target} points to ${resolvedCurrentTarget}, expected ${source}`,
    );
  }

  if (targetStat) {
    if (isPreview) {
      console.log(
        `[conflict] ${link.name}: ${target} exists and is not a symlink`,
      );
      continue;
    }

    throw new Error(
      `[conflict] ${link.name}: ${target} exists and is not a symlink`,
    );
  }

  console.log(
    `${isPreview ? "[preview]" : "[sync]"} ${link.name}: ${source} -> ${target}`,
  );

  if (!isPreview) {
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(source, target, sourceStat.isDirectory() ? "dir" : "file");
  }
}
