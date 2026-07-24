import { create } from 'zustand';

import {
  getNearbyCenters,
  type NearbyCenter,
} from '../services/centers/centerService';
import type { UserLocation } from '../services/location/locationService';

type CenterState = {
  centers: NearbyCenter[];
  loading: boolean;
  error: string | null;
  userLocation: UserLocation | null;
  fetchNearbyCenters: () => Promise<void>;
  setUserLocation: (location: UserLocation) => void;
  clearCenters: () => void;
};

let latestFetchId = 0;

export const useCenterStore = create<CenterState>((set, get) => ({
  centers: [],
  loading: false,
  error: null,
  userLocation: null,

  fetchNearbyCenters: async () => {
    const location = get().userLocation;

    if (!location) {
      set({
        error: 'Your location is required before nearby centers can be loaded.',
      });
      return;
    }

    const fetchId = ++latestFetchId;
    set({ loading: true, error: null });

    try {
      const centers = await getNearbyCenters(
        location.latitude,
        location.longitude,
        10,
      );

      if (fetchId === latestFetchId) {
        set({ centers, loading: false });
      }
    } catch (error) {
      if (fetchId === latestFetchId) {
        set({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load nearby centers.',
        });
      }
    }
  },

  setUserLocation: location =>
    set(state => {
      const current = state.userLocation;
      if (
        current?.latitude === location.latitude &&
        current.longitude === location.longitude &&
        current.accuracy === location.accuracy &&
        current.heading === location.heading
      ) {
        return state;
      }

      return { userLocation: location };
    }),

  clearCenters: () => {
    latestFetchId += 1;
    set({
      centers: [],
      loading: false,
      error: null,
    });
  },
}));

