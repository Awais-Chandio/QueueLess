import { useToastStore } from '../store/toastStore';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

const show = (message: string, type: ToastType = 'info') => {
  useToastStore.getState().showToast(message, type);
};

export const toastService = {
  show,
  success: (message: string) => show(message, 'success'),
  error: (message: string) => show(message, 'error'),
  info: (message: string) => show(message, 'info'),
  warning: (message: string) => show(message, 'warning'),
};
