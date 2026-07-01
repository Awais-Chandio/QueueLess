import { useCallback, useEffect, useState } from 'react';

import {
  getQueueSnapshot,
  subscribeToAppointments,
  unsubscribeAppointments,
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
  isActive: boolean = true,
) => {
  const scopeCenterId = scope?.centerId;
  const scopeScheduledAt = scope?.scheduledAt;
  const scopeAppointmentId = scope?.appointmentId;
  const [queueData, setQueueData] = useState<QueueSnapshot | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (myToken == null) {
      setQueueData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const data = await getQueueSnapshot(myToken, {
        appointmentId: scopeAppointmentId,
        centerId: scopeCenterId,
        scheduledAt: scopeScheduledAt,
      });

      setQueueData(data);
      setError(null);
    } catch (err) {
      setError(getQueueErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [myToken, scopeAppointmentId, scopeCenterId, scopeScheduledAt]);

  useEffect(() => {
    if (!isActive) return;

    loadInitialData();

    const queueChannel = subscribeToAppointments({
      channelName: `queue-live-${myToken ?? 'unknown'}-${Date.now()}`,
      onChange: () => {
        loadInitialData();
        onAppointmentChange?.();
      },
    });

    const refreshTimer = setInterval(() => {
      loadInitialData();
    }, 20000);

    return () => {
      clearInterval(refreshTimer);
      unsubscribeAppointments(queueChannel);
    };
  }, [loadInitialData, onAppointmentChange, isActive, myToken]);

  return {
    queueData,
    loading,
    error,
    refresh: loadInitialData,
  };
};
