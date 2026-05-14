import { create } from 'zustand';

import { Center } from '../types/center';
import { centersService } from '../services/centers/centersService';

interface CentersState {
  centers: Center[];

  loading: boolean;
  error: string | null;

  fetchCenters: () => Promise<void>;

  reset: () => void;
}

export const useCentersStore = create<CentersState>(
  set => ({
    centers: [],

    loading: false,
    error: null,

    fetchCenters: async () => {
      try {
        set({
          loading: true,
          error: null,
        });

        const centers =
          await centersService.getCenters();

        set({
          centers,
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch centers',
        });
      }
    },

    reset: () => {
      set({
        centers: [],
        loading: false,
        error: null,
      });
    },
  }),
);