import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  getQueueSnapshot,
  subscribeToAppointments,
  unsubscribeAppointments,
} from '../services/queueService';

import type { QueueScope } from '../services/queueService';
import type { QueueSnapshot } from '../types/queue';

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

const POLL_MS = 30_000;

export const useQueue = (
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
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const onChangeRef = useRef(onAppointmentChange);
  onChangeRef.current = onAppointmentChange;

  const loadInitialData = useCallback(async () => {
    if (myToken == null) {
      setQueueData(null);
      setLoading(false);
      return;
    }
    // Realtime, polling and app-resume can all fire together. Run one request
    // at a time and fold anything that arrives meanwhile into one follow-up.
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }
    inFlightRef.current = true;

    try {
      // Only the first load shows a loading state. Background refreshes used
      // to flip it on every realtime event and poll, making the screen flicker.
      if (!hasLoadedRef.current) setLoading(true);

      const data = await getQueueSnapshot(myToken, {
        appointmentId: scopeAppointmentId,
        centerId: scopeCenterId,
        scheduledAt: scopeScheduledAt,
      });

      hasLoadedRef.current = true;
      setQueueData(data);
      setError(null);
    } catch (err) {
      setError(getQueueErrorMessage(err));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      if (rerunRef.current) {
        rerunRef.current = false;
        loadRef.current();
      }
    }
  }, [myToken, scopeAppointmentId, scopeCenterId, scopeScheduledAt]);

  const loadRef = useRef(loadInitialData);
  loadRef.current = loadInitialData;

  useEffect(() => {
    if (!isActive) return;

    loadInitialData();

    const queueChannel = subscribeToAppointments({
      channelName: `queue-live-${myToken ?? 'unknown'}-${Date.now()}`,
      centerId: scopeCenterId,
      appointmentId: scopeAppointmentId,
      onChange: () => {
        loadInitialData();
        onChangeRef.current?.();
      },
    });

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        loadInitialData();
        onChangeRef.current?.();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // Fallback in case a realtime event is missed; skipped while backgrounded.
    const refreshTimer = setInterval(() => {
      if (AppState.currentState === 'active') loadInitialData();
    }, POLL_MS);

    return () => {
      clearInterval(refreshTimer);
      unsubscribeAppointments(queueChannel);
      appStateSub.remove();
    };
  }, [loadInitialData, isActive, myToken, scopeCenterId, scopeAppointmentId]);

  return {
    queueData,
    loading,
    error,
    refresh: loadInitialData,
  };
};

// Alias for compatibility
export const useRealtimeQueue = useQueue;
