// Defines the public CLI contract shared by runtime help and shell completions.

export const cliContract = {
  name: 'swatch',
  description: 'Read themes and manage the current selection from the built Swatch catalog.',
  helpFlags: ['-h', '--help'],
  output: {
    success: 'stdout',
    help: 'stderr',
    error: 'stderr',
    formats: {
      list: 'lines',
      listJson: 'json',
      get: 'json',
      current: 'lines',
      currentJson: 'json',
      currentPath: 'lines',
      use: 'lines',
    },
  },
  exitCodes: {
    success: 0,
    usageError: 1,
    catalogError: 1,
    stateError: 1,
  },
  runtime: {
    network: false,
    cache: false,
  },
  commands: [
    {
      name: 'list',
      usage: 'swatch list [--json]',
      description: 'List available theme IDs.',
      arguments: [],
      options: [
        {
          name: '--json',
          description: 'Write the catalog manifest as JSON.',
        },
      ],
    },
    {
      name: 'get',
      usage: 'swatch get <theme-id>',
      description: 'Read one normalized Base24 theme.',
      arguments: [
        {
          name: 'theme-id',
          required: true,
          description: 'Theme ID from the catalog manifest.',
        },
      ],
      options: [],
    },
    {
      name: 'current',
      usage: 'swatch current [--json | --path]',
      description: 'Read the current theme, initializing the catalog default when missing.',
      arguments: [],
      options: [
        {
          name: '--json',
          description: 'Write the current normalized Theme as JSON.',
        },
        {
          name: '--path',
          description: 'Write the current state file path without creating it.',
        },
      ],
    },
    {
      name: 'use',
      usage: 'swatch use <theme-id>',
      description: 'Select a theme from the built catalog.',
      arguments: [
        {
          name: 'theme-id',
          required: true,
          description: 'Theme ID from the catalog manifest.',
        },
      ],
      options: [],
    },
  ],
} as const;

export type CliCommand = (typeof cliContract.commands)[number];
export type CliCommandName = CliCommand['name'];
