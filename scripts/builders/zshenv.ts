import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { errTag, red } from "../lib/colors.js";
import { expandHome, repoRoot, resolveRepoPath } from "../lib/paths.js";
import { GENERATED_MARKER, writeGeneratedFile, type Builder } from "./shared.js";

const optsSchema = z.object({
  zdotdir: z.string().min(1),
});

function resolveZdotdir(input: string) {
  const expanded = expandHome(input);
  if (path.isAbsolute(expanded)) return expanded;

  return path.resolve(repoRoot, expanded);
}

function renderTemplate(
  template: string,
  tokens: Record<string, string>,
  label: string,
) {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, token: string) => {
    const value = tokens[token];

    if (value === undefined) {
      throw new Error(
        `${errTag()} ${red(`unknown ${label}: unknown token {{ ${token} }`)}`,
      );
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
      template = await readFile(sourcePath, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(
          `${errTag()} ${red(`missing zshenv: source does not exist: ${sourcePath}`)}`,
        );
      }

      throw error;
    }

    const body = renderTemplate(
      template,
      { zdotdir: resolveZdotdir(parsed.zdotdir) },
      "zshenv",
    );
    const content = `# ${GENERATED_MARKER}. Edit the template in the repo and run \`pnpm build\`.\n\n${body.trimStart()}`;

    await writeGeneratedFile("zshenv", output, content);
  },
};
