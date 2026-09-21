import { create } from 'zustand';

import {
  getNearbyCenters,
  type NearbyCenter,
} from '../services/centers/centerService';
import type { UserLocation } from '../services/location/locationService';
import { getCurrentAreaLabel } from '../services/location/reverseGeocodeService';

type CenterState = {
  centers: NearbyCenter[];
  loading: boolean;
  error: string | null;
  userLocation: UserLocation | null;
  /**
   * The user's actual current area (e.g. "Gulshan-e-Iqbal"), resolved via
   * reverse geocoding. Null until resolved or if the lookup failed/was
   * unavailable — callers should fall back to another label (e.g. the
   * nearest center's city) in that case, not show a blank area.
   */
  areaLabel: string | null;
  fetchNearbyCenters: () => Promise<void>;
  setUserLocation: (location: UserLocation) => void;
  fetchAreaLabel: () => Promise<void>;
  clearCenters: () => void;
};

let latestFetchId = 0;
let latestAreaFetchId = 0;

export const useCenterStore = create<CenterState>((set, get) => ({
  centers: [],
  loading: false,
  error: null,
  userLocation: null,
  areaLabel: null,

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

  fetchAreaLabel: async () => {
    const location = get().userLocation;
    if (!location) {
      return;
    }

    const fetchId = ++latestAreaFetchId;

    try {
      const result = await getCurrentAreaLabel(
        location.latitude,
        location.longitude,
      );

      if (fetchId === latestAreaFetchId && result) {
        set({ areaLabel: result.area });
      }
      // A null result (Photon unavailable, rate-limited, or no match) is
      // left as-is on purpose: the caller keeps showing its existing
      // fallback label instead of clearing it to blank.
    } catch {
      // Reverse geocoding is a display nicety, never a blocking failure.
    }
  },

  clearCenters: () => {
    latestFetchId += 1;
    set({
      centers: [],
      loading: false,
      error: null,
    });
  },
}));

