import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Local stack credentials for integration scripts. Order: P02_SECRETS_FILE (JSON), then the
 * repository .env read by `docker compose` (written by backend/platform/init_env.py).
 * Values are never printed by this module.
 */
export function loadP02Secrets() {
  const explicit = process.env.P02_SECRETS_FILE;
  if (explicit) return JSON.parse(readFileSync(explicit, 'utf8'));
  const env = `${repo}.env`;
  if (!existsSync(env)) throw new Error('No local stack credentials: run `python backend/platform/init_env.py` and `docker compose up -d --build --wait`');
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
