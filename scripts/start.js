// Deliberately .js and dependency-free: this orchestrator must be able to run
// before "pnpm install" so it can report missing dependencies with a friendly
// message. Do not convert to TS and do not move it into lib/.

import { access } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");

async function hasLocalDependencies() {
  try {
    await access(tsxBin);
    return true;
  } catch {
    return false;
  }
}

function runPnpmScript(scriptName) {
  const result = spawnSync("pnpm", [scriptName], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (!(await hasLocalDependencies())) {
  console.error("[missing] local dependencies are not installed");
  console.error("Run `pnpm install` first, then rerun `pnpm start`.");
  process.exit(1);
}

const buildStatus = runPnpmScript("build");

if (buildStatus !== 0) {
  process.exit(buildStatus);
}

process.exit(runPnpmScript("sync"));
