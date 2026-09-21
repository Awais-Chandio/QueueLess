import Toast from 'react-native-toast-message';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Longer for errors: a failure message needs more time to read than a receipt. */
const VISIBILITY: Record<ToastType, number> = {
  success: 2600,
  info: 2600,
  warning: 3400,
  error: 4200,
};

/**
 * The single way the app raises transient feedback.
 *
 * Rendering moved to `react-native-toast-message` (see `ToastMessage.tsx`),
 * which queues messages instead of letting a second one overwrite the first —
 * the previous store-backed toast held exactly one message, so a burst of
 * failures showed only the last.
 *
 * The signature is unchanged, so existing call sites do not need to move.
 * `detail` is optional: pass a short human explanation as `message` and keep
 * raw backend text out of it.
 */
const show = (message: string, type: ToastType = 'info', detail?: string) => {
  Toast.show({
    type,
    text1: message,
    text2: detail,
    position: 'top',
    visibilityTime: VISIBILITY[type],
    autoHide: true,
  });
};

const hide = () => Toast.hide();

export const toastService = {
  show,
  hide,
  success: (message: string, detail?: string) => show(message, 'success', detail),
  error: (message: string, detail?: string) => show(message, 'error', detail),
  info: (message: string, detail?: string) => show(message, 'info', detail),
  warning: (message: string, detail?: string) => show(message, 'warning', detail),
};
