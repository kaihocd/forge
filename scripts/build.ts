import { loadConfig } from './lib/config.js';
import { zshenvBuilder } from './builders/zshenv.js';
import { zshRuntimeBuilder } from './builders/zsh-runtime.js';
import { errTag, red, skipTag } from './lib/colors.js';
import type { Builder } from './builders/shared.js';

const builders: Record<string, Builder> = {
  zshenv: zshenvBuilder,
  'zsh-runtime': zshRuntimeBuilder,
};

try {
  const config = await loadConfig();

  if (config.build.length === 0) {
    console.log(`${skipTag()} no build tasks configured`);
    process.exit(0);
  }

  for (const task of config.build) {
    const builder = builders[task.builder];

    if (!builder) {
      throw new Error(
        `${errTag()} ${red(`unknown builder "${task.builder}"; available builders: ${Object.keys(builders).join(', ')}`)}`,
      );
    }

    await builder.build({
      source: task.source,
      output: task.output,
      opts: task.opts,
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
