import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Local P02 credentials for integration scripts. Order: P02_SECRETS_FILE (JSON), the
 * p02.py secrets.json, then the repository .env used by `docker compose up`.
 * Values are never printed by this module.
 */
export function loadP02Secrets() {
  const explicit = process.env.P02_SECRETS_FILE;
  if (explicit) return JSON.parse(readFileSync(explicit, 'utf8'));
  const secrets = `${repo}backend/infra/.local/p02/secrets.json`;
  if (existsSync(secrets)) return JSON.parse(readFileSync(secrets, 'utf8'));
  const env = `${repo}.env`;
  if (!existsSync(env)) throw new Error('No P02 credentials: run `py -3 backend/infra/p02.py env` or create .env from .env.example');
  return Object.fromEntries(readFileSync(env, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
}
