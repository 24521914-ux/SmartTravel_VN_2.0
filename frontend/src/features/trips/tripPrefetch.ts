import type { Page, TravelClient } from '../../shared/api';

interface TripPrefetchState {
  inflight: Promise<Page> | null;
  subscribed: boolean;
}

const stores = new WeakMap<TravelClient, TripPrefetchState>();

function stateFor(travel: TravelClient): TripPrefetchState {
  let state = stores.get(travel);
  if (!state) {
    state = { inflight: null, subscribed: false };
    if (typeof (travel as { onMutate?: unknown }).onMutate === 'function') {
      state.subscribed = true;
      travel.onMutate(service => {
        if (service === 'trip') {
          const curr = stores.get(travel);
          if (curr) curr.inflight = null;
        }
      });
    }
    stores.set(travel, state);
  }
  return state;
}

/**
 * Starts fetching `/me/trips` once in flight so initial chunk loading and
 * auth verification overlap with backend trip loading instead of queuing behind them.
 */
export function prefetchMyTrips(travel: TravelClient): Promise<Page> {
  const state = stateFor(travel);
  if (!state.inflight) {
    state.inflight = travel.readAll('trip', '/me/trips').catch(err => {
      if (state.inflight) state.inflight = null;
      throw err;
    });
  }
  return state.inflight;
}

export function consumeMyTripsPrefetch(travel: TravelClient): Promise<Page> {
  const state = stateFor(travel);
  const existing = state.inflight;
  state.inflight = null;
  return existing ?? travel.readAll('trip', '/me/trips');
}
