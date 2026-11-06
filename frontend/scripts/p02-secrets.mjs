import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Stack credentials for integration scripts: P02_SECRETS_FILE (JSON), P02_ENV_FILE,
 * then the repository .env. CI explicitly selects .env.local for isolated databases.
 * Values are never printed by this module.
 */
export function loadP02Secrets() {
  const explicit = process.env.P02_SECRETS_FILE;
  if (explicit) return JSON.parse(readFileSync(explicit, 'utf8'));
  const env = resolve(repo, process.env.P02_ENV_FILE ?? '.env');
  if (!existsSync(env)) throw new Error('No stack credentials: prepare the selected cloud or isolated local-test environment first');
  return Object.fromEntries(readFileSync(env, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const name = line.slice(0, line.indexOf('=')).trim();
      let value = line.slice(line.indexOf('=') + 1).trim();
      if (value.length >= 2 && value[0] === value[value.length - 1] && `'"`.includes(value[0])) value = value.slice(1, -1);
      return [name, value];
    }));
}
