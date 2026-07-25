import { loadConfig } from "./lib/config.js";
import { zshrcBuilder } from "./builders/zshrc.js";
import type { Builder } from "./builders/shared.js";

const builders: Record<string, Builder> = {
  zshrc: zshrcBuilder,
};

const config = await loadConfig();

if (config.build.length === 0) {
  console.log("[skip] no build tasks configured");
  process.exit(0);
}

for (const task of config.build) {
  const builder = builders[task.builder];

  if (!builder) {
    throw new Error(
      `[unknown] builder "${task.builder}"; available builders: ${Object.keys(builders).join(", ")}`,
    );
  }

  await builder.build({
    source: task.source,
    output: task.output,
    opts: task.opts,
  });
}
