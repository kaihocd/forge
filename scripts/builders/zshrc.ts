import { readFile } from "node:fs/promises";
import { z } from "zod";

import { resolveRepoPath } from "../lib/paths.js";
import { GENERATED_MARKER, writeGeneratedFile, type Builder } from "./shared.js";

const optsSchema = z.object({
  aliases: z.record(z.string().min(1), z.string().min(1)).default({}),
});

// zsh single-quote escaping: ' becomes ''' (close quote, escaped quote, reopen).
function quoteForZsh(input: string) {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function renderAliases(aliases: Record<string, string>) {
  const entries = Object.entries(aliases);

  if (entries.length === 0) {
    return "# (no forge aliases configured)";
  }

  return [
    "# >>> forge aliases (generated) >>>",
    ...entries.map(([name, command]) => `alias ${name}=${quoteForZsh(command)}`),
    "# <<< forge aliases <<<",
  ].join("\n");
}

function renderTemplate(
  template: string,
  tokens: Record<string, string>,
  label: string,
) {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, token: string) => {
    const value = tokens[token];

    if (value === undefined) {
      throw new Error(`[unknown] ${label}: unknown token {{ ${token} }}`);
    }

    return value;
  });
}

export const zshrcBuilder: Builder = {
  async build({ source, output, opts }) {
    const parsed = optsSchema.parse(opts);
    const sourcePath = resolveRepoPath(source);
    let template: string;

    try {
      template = await readFile(sourcePath, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(
          `[missing] zshrc: source does not exist: ${sourcePath}`,
        );
      }

      throw error;
    }

    const body = renderTemplate(
      template,
      { aliases: renderAliases(parsed.aliases) },
      "zshrc",
    );
    const content = `# ${GENERATED_MARKER}. Edit the template in the repo and run \`pnpm build\`.\n\n${body.trimStart()}`;

    await writeGeneratedFile("zshrc", output, content);
  },
};
