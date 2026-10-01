import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getNearbyCenters } from '../services/centers/centerService';
import { locationService } from '../services/location/locationService';

export interface NearbyCenter {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  city: string;
  address: string;
  open_time: string | null;
  close_time: string | null;
  image_url: string | null;
  latitude: number;
  longitude: number;
  distance_km: string;
  doctorCount: number;
  currentToken: number;
  hasActiveToken: boolean;
  waitingCount: number;
  estimatedWait: number;
}

const enrichCentersWithLiveStats = async (
  centers: Awaited<ReturnType<typeof getNearbyCenters>>,
): Promise<NearbyCenter[]> => {
  if (centers.length === 0) {
    return [];
  }

  const centerIds = centers.map(center => center.id);
  const today = new Date().toISOString().split('T')[0];
  const [doctorsResult, appointmentsResult] = await Promise.all([
    supabase
      .from('doctors')
      .select('center_id')
      .in('center_id', centerIds)
      .eq('is_active', true),
    supabase
      .from('appointments')
      .select('center_id, status, token_number')
      .in('center_id', centerIds)
      .eq('appointment_date', today),
  ]);

  if (doctorsResult.error) {
    console.warn('Unable to load nearby clinic doctor counts', doctorsResult.error);
  }
  if (appointmentsResult.error) {
    console.warn('Unable to load nearby clinic queue stats', appointmentsResult.error);
  }

  const doctorCounts = new Map<string, number>();
  (doctorsResult.data ?? []).forEach(doctor => {
    if (doctor.center_id) {
      doctorCounts.set(
        doctor.center_id,
        (doctorCounts.get(doctor.center_id) ?? 0) + 1,
      );
    }
  });

  const appointmentsByCenter = new Map<
    string,
    Array<{ status: string; token_number: number | null }>
  >();
  (appointmentsResult.data ?? []).forEach(appointment => {
    if (!appointment.center_id) {
      return;
    }
    const current = appointmentsByCenter.get(appointment.center_id) ?? [];
    current.push({
      status: appointment.status,
      token_number: appointment.token_number,
    });
    appointmentsByCenter.set(appointment.center_id, current);
  });

  return centers.map(center => {
    const appointments = appointmentsByCenter.get(center.id) ?? [];
    const servingTokens = appointments
      .filter(item => ['called', 'in_progress'].includes(item.status))
      .map(item => item.token_number)
      .filter((token): token is number => typeof token === 'number');
    const completedTokens = appointments
      .filter(item => item.status === 'completed')
      .map(item => item.token_number)
      .filter((token): token is number => typeof token === 'number');
    const activeTokens =
      servingTokens.length > 0 ? servingTokens : completedTokens;
    const waitingCount = appointments.filter(item =>
      ['confirmed', 'checked_in'].includes(item.status),
    ).length;

    return {
      ...center,
      distance_km: center.distance.toFixed(2),
      doctorCount: doctorCounts.get(center.id) ?? 0,
      currentToken:
        activeTokens.length > 0 ? Math.max(...activeTokens) : 0,
      hasActiveToken: activeTokens.length > 0,
      waitingCount,
      estimatedWait: waitingCount * 5,
    };
  });
};

export const useNearbyClinics = () => {
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<NearbyCenter[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [radiusSearched, setRadiusSearched] = useState<number>(10);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkPermissionAndFetch = useCallback(async (isRefreshCall = false) => {
    if (isRefreshCall) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);
    setPermissionDenied(false);

    try {
      const location = await locationService.getCurrentUserLocation();
      const { latitude, longitude } = location;
      setCoords({ latitude, longitude });

      const results = await getNearbyCenters(latitude, longitude, 10);
      const radius = results.some(center => center.distance > 10) ? 15 : 10;
      const banner =
        radius === 15 && results.length > 0
          ? 'No clinics found within 10 km. Showing nearest clinics within 15 km.'
          : null;

      // Two batched requests replace the previous two-requests-per-clinic
      // pattern, which was the main source of latency on this screen.
      const enriched = await enrichCentersWithLiveStats(results);

      setCenters(enriched);
      setRadiusSearched(radius);
      setBannerMessage(banner);
    } catch (err) {
      console.warn('[useNearbyClinics] Permission request error:', err);
      const message =
        err instanceof Error ? err.message : 'Unable to load nearby clinics.';
      if (message.toLowerCase().includes('permission')) {
        setPermissionDenied(true);
      } else {
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkPermissionAndFetch();
  }, [checkPermissionAndFetch]);

  return {
    loading,
    centers,
    errorMsg,
    permissionDenied,
    radiusSearched,
    bannerMessage,
    isRefreshing,
    coords,
    refresh: () => checkPermissionAndFetch(true),
    requestPermission: () => checkPermissionAndFetch(false),
  };
};
