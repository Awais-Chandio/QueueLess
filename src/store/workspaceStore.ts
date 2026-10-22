import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WorkspaceState = {
  /** The center the desk is working at on this phone. Access is still checked by every RPC. */
  centerId: string | null;
  setCenterId: (centerId: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    set => ({
      centerId: null,
      setCenterId: centerId => set({ centerId }),
    }),
    { name: 'workspace-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
