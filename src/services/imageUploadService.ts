import { supabase } from '../lib/supabase';
import type { UploadAvatarPayload } from '../types/profile';

const AVATAR_BUCKET = 'avatars';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const DEFAULT_MIME_TYPE = 'image/jpeg';

export type ImageValidationResult = {
  valid: boolean;
  error?: string;
};

export type ImageUploadResult = {
  success: boolean;
  avatarUrl?: string;
  error?: string;
};

const log = (message: string, data?: unknown) => {
  if (__DEV__) {
    if (data !== undefined) {
      console.log(`[imageUpload] ${message}`, data);
    } else {
      console.log(`[imageUpload] ${message}`);
    }
  }
};

const base64ToArrayBuffer = (base64: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const cleaned = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const bytes: number[] = [];

  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned.charAt(i);

    if (char === '=') {
      break;
    }

    const value = chars.indexOf(char);

    if (value < 0) {
      continue;
    }

    buffer = (buffer << 6) | value;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return new Uint8Array(bytes).buffer;
};

const estimateBase64Size = (base64?: string | null) => {
  if (!base64) {
    return 0;
  }

  const cleaned = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
};

const getAvatarExtension = (payload: UploadAvatarPayload) => {
  if (payload.fileName?.includes('.')) {
    return payload.fileName.split('.').pop()?.toLowerCase() || 'jpg';
  }

  if (payload.type?.includes('/')) {
    return payload.type.split('/').pop()?.toLowerCase() || 'jpg';
  }

  return 'jpg';
};

const getSafeAvatarExtension = (payload: UploadAvatarPayload) => {
  const extension = getAvatarExtension(payload);

  if (extension === 'jpeg') {
    return 'jpg';
  }

  if (['jpg', 'png', 'webp'].includes(extension)) {
    return extension;
  }

  return 'jpg';
};

const normalizeMimeType = (payload: UploadAvatarPayload, extension: string) => {
  const mimeType = payload.type?.toLowerCase();

  if (mimeType && ALLOWED_MIME_TYPES.has(mimeType)) {
    return mimeType === 'image/jpg' ? DEFAULT_MIME_TYPE : mimeType;
  }

  if (extension === 'png') {
    return 'image/png';
  }

  return DEFAULT_MIME_TYPE;
};

export const imageUploadService = {
  validateImage(payload: UploadAvatarPayload): ImageValidationResult {
    if (!payload.uri) {
      return { valid: false, error: 'No image selected.' };
    }

    if (!payload.base64) {
      return { valid: false, error: 'Unable to read selected image data.' };
    }

    const mimeType = normalizeMimeType(payload, getSafeAvatarExtension(payload));
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { valid: false, error: 'Only JPG and PNG images are supported.' };
    }

    const estimatedSize = estimateBase64Size(payload.base64);
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: 'Image must be smaller than 5MB.' };
    }

    return { valid: true };
  },

  async uploadAvatar(userId: string, payload: UploadAvatarPayload): Promise<ImageUploadResult> {
    log(`Starting upload for user: ${userId}`);

    const validation = this.validateImage(payload);
    if (!validation.valid) {
      log('Validation failed', validation.error);
      return { success: false, error: validation.error };
    }

    log('Validation passed');

    const extension = getSafeAvatarExtension(payload);
    const contentType = normalizeMimeType(payload, extension);
    const path = `${userId}/avatar.${extension}`;

    try {
      const fileBody = base64ToArrayBuffer(payload.base64!);
      const uploadResult = await supabase.storage.from(AVATAR_BUCKET).upload(path, fileBody, {
        cacheControl: '3600',
        contentType,
        upsert: true,
      });

      if (uploadResult.error) {
        log('Upload failed', uploadResult.error.message);
        return { success: false, error: uploadResult.error.message };
      }

      log('Upload successful');

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
      log('Public URL', publicUrl);

      const updateResult = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (updateResult.error) {
        log('Profile update failed', updateResult.error.message);
        return { success: false, error: updateResult.error.message };
      }

      log('Profile updated successfully');
      return { success: true, avatarUrl: publicUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload image';
      log('Unexpected upload error', message);
      return { success: false, error: message };
    }
  },
};
