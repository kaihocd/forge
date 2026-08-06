import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { errTag, red } from '../lib/colors.js';
import { resolveRepoPath } from '../lib/paths.js';
import { GENERATED_MARKER, writeGeneratedFile, type Builder } from './shared.js';

const optsSchema = z.object({
  sources: z.array(z.string().min(1)).default([]),
});

async function readSource(input: string, label: string) {
  const sourcePath = resolveRepoPath(input);

  try {
    return await readFile(sourcePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `${errTag()} ${red(`missing ${label}: source does not exist: ${sourcePath}`)}`,
      );
    }

    throw error;
  }
}

export const zshrcBuilder: Builder = {
  async build({ source, output, opts }) {
    const parsed = optsSchema.parse(opts);
    const sources = [
      await readSource(source, 'zshrc'),
      ...(await Promise.all(parsed.sources.map((source) => readSource(source, 'zshrc source')))),
    ];
    const body = sources.map((content) => content.trim()).join('\n\n');

    const content = `# ${GENERATED_MARKER}. Edit the sources in the repo and run \`pnpm build\`.\n\n${body}\n`;

    await writeGeneratedFile('zshrc', output, content);
  },
};
