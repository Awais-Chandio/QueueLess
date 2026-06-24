import { useCallback, useEffect, useState } from 'react';

import {
  getQueueSnapshot,
  subscribeToQueueChanges,
  unsubscribeQueue,
} from '../api/queueService';

import type { QueueScope } from '../api/queueService';
import type { QueueSnapshot } from '../../../types/queue';

const getQueueErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Failed to load queue status';
};

export const useRealtimeQueue = (
  myToken: number | null,
  onAppointmentChange?: () => void,
  scope?: QueueScope,
) => {
  const [queueData, setQueueData] =
    useState<QueueSnapshot | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (myToken == null) {
      setQueueData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const data = await getQueueSnapshot(myToken, scope);

      setQueueData(data);
      setError(null);
    } catch (err) {
      setError(getQueueErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [myToken, scope?.centerId, scope?.scheduledAt]);

  useEffect(() => {
    loadInitialData();

    const queueChannel = subscribeToQueueChanges(() => {
      loadInitialData();
      onAppointmentChange?.();
    });
    const fallbackInterval = setInterval(() => {
      loadInitialData();
      onAppointmentChange?.();
    }, 5000);

    return () => {
      clearInterval(fallbackInterval);
      unsubscribeQueue(queueChannel);
    };
  }, [loadInitialData, onAppointmentChange]);

  return {
    queueData,
    loading,
    error,
    refresh: loadInitialData,
  };
};
