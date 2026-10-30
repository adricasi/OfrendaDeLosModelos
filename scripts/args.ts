/** Command-line arguments of `npm run record-voices`. */
export interface Args {
  readonly configPath: string | undefined;
  readonly allowUnverified: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  let configPath: string | undefined;
  let allowUnverified = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-unverified") {
      allowUnverified = true;
    } else if (arg === "--config") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--config needs a path");
      configPath = value;
      i++;
    } else {
      throw new Error(
        `Unknown argument "${String(arg)}". Use --config <path> and --allow-unverified.`,
      );
    }
  }
  return { configPath, allowUnverified };
}
