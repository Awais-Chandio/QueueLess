import { supabase } from '../../../lib/supabase';
import type { Notification } from '../../../types/notification';

export const notificationsService = {
  async fetchNotifications(userId: string): Promise<Notification[]> {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (__DEV__) {
      console.log('[NOTIFICATIONS] auth session:', {
        sessionExists: !!sessionData.session,
        sessionUserId: sessionData.session?.user.id,
        hasAccessToken: !!sessionData.session?.access_token,
        error: sessionError?.message,
      });
      console.log('AUTH USER:', userData.user);
    }

    if (sessionError || userError || !sessionData.session || !userData.user) {
      console.error('[NOTIFICATIONS] auth context missing:', {
        sessionError: sessionError?.message,
        userError: userError?.message,
        sessionExists: !!sessionData.session,
        userExists: !!userData.user,
      });
      throw new Error('Please login again to view notifications.');
    }

    const authenticatedUserId = userData.user.id;
    if (authenticatedUserId !== userId) {
      console.warn('[NOTIFICATIONS] auth user mismatch:', {
        requestedUserId: userId,
        authenticatedUserId,
      });
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, title, message, is_read, created_at, appointment_id, type')
      .eq('user_id', authenticatedUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[NOTIFICATIONS] fetch error:', {
        userId: authenticatedUserId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw new Error(error.message);
    }

    console.log('[NOTIFICATIONS] fetched count:', data?.length ?? 0);
    return (data ?? []).map(n => ({
      id: n.id,
      user_id: n.user_id,
      title: n.title,
      message: n.message,
      type: n.type ?? 'general',
      is_read: n.is_read,
      created_at: n.created_at,
      appointment_id: n.appointment_id ?? null,
    })) as Notification[];
  },

  async markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('[NOTIFICATIONS] markAsRead error:', {
        notificationId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw new Error(error.message);
    }
  },

  async markAllAsRead(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[NOTIFICATIONS] markAllAsRead error:', {
        userId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw new Error(error.message);
    }
  },
};
