import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./lib/config.js";
import { errTag, okTag, red, skipTag } from "./lib/colors.js";
import { expandHome, resolveRepoPath } from "./lib/paths.js";

const args = new Set(process.argv.slice(2));
const isPreview = args.has("--preview");
const unknownArgs = [...args].filter((arg) => arg !== "--preview");

if (unknownArgs.length > 0) {
  console.error(`${errTag()} ${red(`unknown argument: ${unknownArgs.join(", ")}`)}`);
  process.exit(1);
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

try {
  const config = await loadConfig();

  if (config.links.length === 0) {
    console.log(`${skipTag()} no links configured`);
    process.exit(0);
  }

  for (const link of config.links) {
    const source = resolveRepoPath(link.source);
    const target = expandHome(link.target);

    const sourceStat = await maybeLstat(source);

    if (!sourceStat) {
      throw new Error(
        `${errTag()} ${red(`missing ${link.name}: source does not exist: ${source}`)}`,
      );
    }

    const targetStat = await maybeLstat(target);

    if (targetStat?.isSymbolicLink()) {
      const currentTarget = await readlink(target);
      const resolvedCurrentTarget = path.resolve(
        path.dirname(target),
        currentTarget,
      );

      if (resolvedCurrentTarget === source) {
        console.log(`${skipTag()} ${link.name}: already linked`);
        continue;
      }

      if (isPreview) {
        console.log(
          `${errTag()} ${red(`conflict ${link.name}: ${target} points to ${resolvedCurrentTarget}, expected ${source}`)}`,
        );
        continue;
      }

      throw new Error(
        `${errTag()} ${red(`conflict ${link.name}: ${target} points to ${resolvedCurrentTarget}, expected ${source}`)}`,
      );
    }

    if (targetStat) {
      if (isPreview) {
        console.log(
          `${errTag()} ${red(`conflict ${link.name}: ${target} exists and is not a symlink`)}`,
        );
        continue;
      }

      throw new Error(
        `${errTag()} ${red(`conflict ${link.name}: ${target} exists and is not a symlink`)}`,
      );
    }

    console.log(
      `${okTag()} ${isPreview ? "preview" : "sync"} ${link.name}: ${source} -> ${target}`,
    );

    if (!isPreview) {
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(source, target, sourceStat.isDirectory() ? "dir" : "file");
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
