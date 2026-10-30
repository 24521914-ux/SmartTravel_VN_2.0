import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiClient, IdentityClient, type AuthTokens } from '../../shared/api';
import { apiClient, identityClient, tokenStore } from '../../api/session';

export interface UserProfile {
  user_id: string;
  id?: string;
  email?: string;
  version: number;
  display_name?: string;
  roles?: string[];
  status?: string;
  avatar_url?: string;
  created_at?: string;
}

interface AuthContextType {
  tokens: AuthTokens | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isBusiness: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthTokens>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  apiClient: ApiClient;
  identityClient: IdentityClient;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => tokenStore.get());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileRequest = useRef(0);

  async function fetchCurrentUser(throwOnError = false) {
    const request = ++profileRequest.current;
    const curTokens = tokenStore.get();
    if (!curTokens) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const profile = await apiClient.request<UserProfile>('identity', '/api/v1/me');
      if (request === profileRequest.current && tokenStore.get()) setUser(profile);
    } catch (error) {
      // The shared API client already refreshes once on 401. An outage must
      // not revoke a valid session or consume a second refresh token.
      if (request === profileRequest.current) setUser(null);
      if (throwOnError) throw error;
    } finally {
      if (request === profileRequest.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchCurrentUser();
  }, [tokens?.access_token]);

  useEffect(() => {
    const sync = () => setTokens(tokenStore.get());
    window.addEventListener('smarttravel:session-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('smarttravel:session-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  async function handleLogin(email: string, pass: string) {
    setIsLoading(true);
    try {
      const pair = await identityClient.login(email, pass);
      setTokens(pair);
      await fetchCurrentUser(true);
      return pair;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    ++profileRequest.current;
    setIsLoading(true);
    try {
      await identityClient.logout();
    } finally {
      tokenStore.set(null);
      setTokens(null);
      setUser(null);
      setIsLoading(false);
    }
  }

  const isAuthenticated = Boolean(tokens && user);
  const roles = user?.roles ?? [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('admin');
  const isBusiness = roles.includes('BUSINESS') || roles.includes('business');

  return (
    <AuthContext.Provider
      value={{
        tokens,
        user,
        isAuthenticated,
        isAdmin,
        isBusiness,
        isLoading,
        login: handleLogin,
        logout: handleLogout,
        reloadUser: fetchCurrentUser,
        apiClient,
        identityClient
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
