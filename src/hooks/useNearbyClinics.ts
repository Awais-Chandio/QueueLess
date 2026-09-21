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

export const useNearbyClinics = () => {
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<NearbyCenter[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [radiusSearched, setRadiusSearched] = useState<number>(10);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to enrich a single center with real, live queue stats. No fields
  // here are fabricated: everything defaults to a genuine zero/empty state
  // when there's no real data, rather than a fake "looks busy" placeholder.
  const enrichCenter = async (center: any): Promise<NearbyCenter> => {
    let doctorCount = 0;
    let currentToken = 0;
    let hasActiveToken = false;
    let waitingCount = 0;
    let estimatedWait = 0;

    try {
      const { count: docCount, error: docError } = await supabase
        .from('doctors')
        .select('id', { count: 'exact', head: true })
        .eq('center_id', center.id)
        .eq('is_active', true);

      if (!docError && typeof docCount === 'number') {
        doctorCount = docCount;
      }
    } catch (e) {
      console.warn('Error fetching doctor count for center', center.id, e);
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: appointments, error: apptError } = await supabase
        .from('appointments')
        .select('status, token_number')
        .eq('center_id', center.id)
        .eq('appointment_date', todayStr);

      if (!apptError && appointments) {
        const serving = appointments
          .filter(a => ['called', 'in_progress'].includes(a.status))
          .map(a => a.token_number)
          .filter((t): t is number => typeof t === 'number');

        if (serving.length > 0) {
          currentToken = Math.max(...serving);
          hasActiveToken = true;
        } else {
          const completed = appointments
            .filter(a => a.status === 'completed')
            .map(a => a.token_number)
            .filter((t): t is number => typeof t === 'number');
          if (completed.length > 0) {
            currentToken = Math.max(...completed);
            hasActiveToken = true;
          }
        }

        waitingCount = appointments.filter(a =>
          ['confirmed', 'checked_in'].includes(a.status),
        ).length;
        estimatedWait = waitingCount * 5; // 5 mins average consultation
      }
    } catch (e) {
      console.warn('Error fetching appointments for center', center.id, e);
    }

    return {
      ...center,
      doctorCount,
      currentToken,
      hasActiveToken,
      waitingCount,
      estimatedWait,
    };
  };

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

      const enriched = await Promise.all(
        results.map(center =>
          enrichCenter({
            ...center,
            distance_km: center.distance.toFixed(2),
          }),
        ),
      );

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
