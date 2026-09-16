import { create } from 'zustand';
import { toastService, type ToastType } from '../services/toastService';

type ToastState = {
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
};

/**
 * Kept as a thin delegate so the screens that already pull `showToast` off this
 * store keep working. Rendering now belongs to `react-native-toast-message`, so
 * the store no longer holds visible/message/type state — two sources of truth
 * for the same toast is how a message ends up shown twice or not at all.
 *
 * New code should call `toastService` directly.
 */
export const useToastStore = create<ToastState>(() => ({
  showToast: (message, type = 'info') => toastService.show(message, type),
  hideToast: () => toastService.hide(),
}));
