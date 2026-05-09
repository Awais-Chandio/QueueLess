import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'info';

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
};

export const useToastStore = create<ToastState>(set => ({
  visible: false,
  message: '',
  type: 'info',
  showToast: (message, type = 'info') => {
    set({ visible: true, message, type });
    setTimeout(() => {
      set({ visible: false });
    }, 2500);
  },
  hideToast: () => set({ visible: false }),
}));
