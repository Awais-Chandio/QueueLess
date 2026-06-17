import { useCallback, useEffect, useState } from 'react';

import {
  getLatestQueueUpdate,
  subscribeToQueueUpdates,
  unsubscribeQueue,
} from '../api/queueService';

import type { QueueUpdate } from '../../../types/queue';

export const useRealtimeQueue = (
  appointmentId: string,
) => {
  const [queueData, setQueueData] =
    useState<QueueUpdate | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);

      const data =
        await getLatestQueueUpdate(
          appointmentId,
        );

      setQueueData(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load queue status',
      );
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadInitialData();

    subscribeToQueueUpdates(
      appointmentId,
      queueUpdate => {
        setQueueData(queueUpdate);
        setError(null);
      },
    );

    return () => {
      unsubscribeQueue();
    };
  }, [appointmentId, loadInitialData]);

  return {
    queueData,
    loading,
    error,
  };
};
