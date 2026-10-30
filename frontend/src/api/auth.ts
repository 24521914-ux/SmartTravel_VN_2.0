import type { AuthTokens } from './types';

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): void;
}

export function memoryTokenStore(initial: AuthTokens | null = null): TokenStore {
  let tokens = initial;
  return { get: () => tokens, set: next => { tokens = next; } };
}

export function browserTokenStore(key = 'smarttravel.auth'): TokenStore {
  return {
    get() {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        const value = JSON.parse(raw) as Partial<AuthTokens>;
        return typeof value.access_token === 'string' && typeof value.refresh_token === 'string'
          && typeof value.expires_in === 'number' && typeof value.token_type === 'string' ? value as AuthTokens : null;
      } catch { return null; }
    },
    set(tokens) {
      if (typeof localStorage === 'undefined') return;
      if (tokens) localStorage.setItem(key, JSON.stringify(tokens));
      else localStorage.removeItem(key);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('smarttravel:session-changed'));
    }
  };
}

export function bearer(tokens: AuthTokens | null): string | undefined {
  return tokens?.access_token ? `Bearer ${tokens.access_token}` : undefined;
}
