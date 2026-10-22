import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiClient, IdentityClient, browserTokenStore, type AuthTokens } from '../../shared/api';

export interface UserProfile {
  id: string;
  email: string;
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

const tokenStore = browserTokenStore();
const apiClient = new ApiClient({ tokenStore });
const identityClient = new IdentityClient(apiClient, tokenStore);

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => tokenStore.get());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchCurrentUser() {
    const curTokens = tokenStore.get();
    if (!curTokens) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const profile = await apiClient.request<UserProfile>('identity', '/api/v1/me');
      setUser(profile);
    } catch {
      // In case session has expired, attempt refresh
      try {
        await identityClient.refresh();
        const profile = await apiClient.request<UserProfile>('identity', '/api/v1/me');
        setUser(profile);
      } catch {
        tokenStore.set(null);
        setTokens(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchCurrentUser();
  }, [tokens?.access_token]);

  async function handleLogin(email: string, pass: string) {
    setIsLoading(true);
    try {
      const pair = await identityClient.login(email, pass);
      setTokens(pair);
      await fetchCurrentUser();
      return pair;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
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
