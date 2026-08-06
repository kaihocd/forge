import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { errTag, okTag, red, skipTag } from '../lib/colors.js';
import { expandHome, repoRoot, resolveRepoPath } from '../lib/paths.js';
import { GENERATED_MARKER, writeGeneratedFile, type Builder } from './shared.js';

const optsSchema = z.object({
  zdotdir: z.string().min(1),
  localenv: z.string().min(1),
});

function resolveOutputPath(input: string) {
  const expanded = expandHome(input);
  if (path.isAbsolute(expanded)) return expanded;

  return path.resolve(repoRoot, expanded);
}

function quoteForZsh(input: string) {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

async function initializeLocalEnv(target: string) {
  await mkdir(path.dirname(target), { recursive: true });

  try {
    await writeFile(
      target,
      '# Machine-local environment. Forge initializes this file once and never overwrites it.\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    console.log(`${okTag()} initialize local env: ${target}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      console.log(`${skipTag()} local env: already exists`);
      return;
    }

    throw error;
  }
}

function renderTemplate(template: string, tokens: Record<string, string>, label: string) {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, token: string) => {
    const value = tokens[token];

    if (value === undefined) {
      throw new Error(`${errTag()} ${red(`unknown ${label}: unknown token {{ ${token} }`)}`);
    }

    return value;
  });
}

export const zshenvBuilder: Builder = {
  async build({ source, output, opts }) {
    const parsed = optsSchema.parse(opts);
    const sourcePath = resolveRepoPath(source);
    let template: string;

    try {
      template = await readFile(sourcePath, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(
          `${errTag()} ${red(`missing zshenv: source does not exist: ${sourcePath}`)}`,
        );
      }

      throw error;
    }

    const body = renderTemplate(
      template,
      {
        zdotdir: resolveOutputPath(parsed.zdotdir),
        localenv: quoteForZsh(resolveOutputPath(parsed.localenv)),
      },
      'zshenv',
    );
    const content = `# ${GENERATED_MARKER}. Edit the template in the repo and run \`pnpm build\`.\n\n${body.trimStart()}`;

    await writeGeneratedFile('zshenv', output, content);
    await initializeLocalEnv(resolveOutputPath(parsed.localenv));
  },
};
