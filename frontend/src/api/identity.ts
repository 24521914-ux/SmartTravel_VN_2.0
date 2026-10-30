import { ApiClient } from './client';
import type { TokenStore } from './auth';
import type { AuthTokens } from './types';
import { ApiError } from './types';

/** Refresh calls share one flight because each refresh token is single-use. */
export class IdentityClient {
  private refreshFlight?: Promise<AuthTokens>;
  private refreshFlightToken?: string;
  private generation = 0;
  constructor(private readonly api: ApiClient, private readonly tokens: TokenStore) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const generation = ++this.generation;
    const pair = await this.api.request<AuthTokens>('identity', '/api/v1/auth/login', { body: { email, password }, authenticated: false });
    if (generation === this.generation) this.tokens.set(pair);
    return pair;
  }

  refresh(): Promise<AuthTokens> {
    const current = this.tokens.get();
    if (!current) return Promise.reject(new Error('No session to refresh'));
    if (this.refreshFlight && this.refreshFlightToken === current.refresh_token) return this.refreshFlight;
    const generation = this.generation;
    const flight = this.api.request<AuthTokens>('identity', '/api/v1/auth/refresh', {
      body: { refresh_token: current.refresh_token }, authenticated: false
    }).then(pair => {
      if (generation === this.generation) this.tokens.set(pair);
      return pair;
    }).catch(error => {
      if (generation === this.generation) this.tokens.set(null);
      throw error;
    }).finally(() => {
      if (this.refreshFlight === flight) { this.refreshFlight = undefined; this.refreshFlightToken = undefined; }
    });
    this.refreshFlight = flight;
    this.refreshFlightToken = current.refresh_token;
    return flight;
  }

  async logout(): Promise<void> {
    let current = this.tokens.get();
    const pending = current && this.refreshFlightToken === current.refresh_token ? this.refreshFlight : undefined;
    const generation = ++this.generation;
    // Own the departing session before waiting; a later login owns a different generation.
    if (pending) current = await pending.catch(() => null);
    try {
      if (current) await this.api.request<void>('identity', '/api/v1/auth/logout', {
        body: { refresh_token: current.refresh_token }, authenticated: false,
        headers: { Authorization: `Bearer ${current.access_token}` }
      });
    } catch (error) {
      // Password changes and session revocation may already have invalidated
      // the departing session. Its server-side logout is then complete.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    } finally { if (generation === this.generation) this.tokens.set(null); }
  }
}
