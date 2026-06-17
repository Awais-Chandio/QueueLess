import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useTheme } from '../../../hooks/useTheme';
import { notificationsService } from '../api/notificationsService';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../lib/supabase';
import { Bell, CheckCheck } from 'lucide-react-native';
import { scaleFont } from '../../../utils/responsive';

const NotificationsScreen = () => {
  const { colors, spacing, typography } = useTheme();
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => notificationsService.fetchNotifications(user!.id),
    enabled: !!user?.id,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsService.markAllAsRead(user!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        refetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch, user?.id]);

  const renderItem = ({ item }: { item: any }) => (
    <Pressable onPress={() => { if (!item.is_read) markAsReadMutation.mutate(item.id); }}>
      <Card style={{ marginBottom: spacing.md, backgroundColor: item.is_read ? colors.surface : colors.primary + '10' }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ marginTop: spacing.xs }}>
            <Bell size={scaleFont(20)} color={item.is_read ? colors.textSecondary : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: item.is_read ? '500' : '700' }}>
              {item.title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.xs }}>
              {item.message}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing.sm }}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
          {!item.is_read && (
            <View style={{ width: scaleFont(8), height: scaleFont(8), borderRadius: scaleFont(4), backgroundColor: colors.primary, marginTop: spacing.sm }} />
          )}
        </View>
      </Card>
    </Pressable>
  );

  return (
    <ScreenWrapper>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl }]}>
          Notifications
        </Text>
        {notifications.some((n: any) => !n.is_read) && (
          <Pressable onPress={() => markAllAsReadMutation.mutate()} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <CheckCheck size={scaleFont(16)} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: typography.sizes.sm, marginLeft: spacing.xs, fontWeight: '600' }}>
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <EmptyState Icon={Bell} title="No Notifications" subtitle="You're all caught up!" />
          }
        />
      )}
    </ScreenWrapper>
  );
};

export default NotificationsScreen;

const styles = StyleSheet.create({
  title: {
    fontWeight: 'bold',
  }
});
