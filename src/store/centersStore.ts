import { create } from 'zustand';

import {
  Center,
  CenterService,
} from '../types/center';

import { centersService } from '../services/centers/centersService';

interface CentersState {
  centers: Center[];
  selectedCenter: Center | null;
  centerServices: CenterService[];

  loading: boolean;
  error: string | null;

  fetchCenters: () => Promise<void>;

  fetchCenterById: (
    centerId: string,
  ) => Promise<void>;

  fetchCenterServices: (
    centerId: string,
  ) => Promise<void>;

  reset: () => void;
}

export const useCentersStore =
  create<CentersState>(set => ({
    centers: [],
    selectedCenter: null,
    centerServices: [],

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

    fetchCenterById: async (
      centerId: string,
    ) => {
      try {
        set({
          loading: true,
          error: null,
        });

        const center =
          await centersService.getCenterById(
            centerId,
          );

        set({
          selectedCenter: center,
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch center',
        });
      }
    },

    fetchCenterServices: async (
      centerId: string,
    ) => {
      try {
        set({
          loading: true,
          error: null,
        });

        const services =
          await centersService.getCenterServices(
            centerId,
          );

        set({
          centerServices: services,
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch services',
        });
      }
    },

    reset: () => {
      set({
        centers: [],
        selectedCenter: null,
        centerServices: [],
        loading: false,
        error: null,
      });
    },
  }));