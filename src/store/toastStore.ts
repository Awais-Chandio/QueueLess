import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>(set => ({
  visible: false,
  message: '',
  type: 'info',
  showToast: (message, type = 'info') => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }

    set({ visible: true, message, type });
    hideTimer = setTimeout(() => {
      set({ visible: false });
      hideTimer = null;
    }, 2500);
  },
  hideToast: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ visible: false });
  },
}));
