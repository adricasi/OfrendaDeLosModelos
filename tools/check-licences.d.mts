export const PRODUCTION_LICENCES: Set<string>;
export const DEV_ONLY_LICENCES: Set<string>;
export function expressionAllowed(expression: string, allowed: ReadonlySet<string>): boolean;
export function versionInRange(version: string, range: string): boolean;
