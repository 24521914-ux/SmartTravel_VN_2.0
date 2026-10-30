import { ApiClient } from './client';
import { IdentityClient } from './identity';
import { browserTokenStore } from './auth';
import { TravelClient } from './travel';

// One session and refresh flight for profile and all domain requests.
export const tokenStore = browserTokenStore();
export const apiClient: ApiClient = new ApiClient({ tokenStore, refreshSession: () => identityClient.refresh() });
export const identityClient: IdentityClient = new IdentityClient(apiClient, tokenStore);
export const travelClient = new TravelClient(apiClient);
