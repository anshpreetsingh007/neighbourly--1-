import { useEffect, useState } from 'react';
import type { LatLng } from '../lib/distance';

const CACHE_KEY = 'neighbourly-last-position';

/**
 * The viewer's position, for working out how far away jobs are.
 *
 * Deliberately never triggers a permission prompt. Home is the first screen
 * people land on, and asking for location there - before they have seen a
 * single job - is the kind of unexplained prompt most people decline, which
 * then blocks it everywhere. The Map asks in a context where the reason is
 * obvious; this hook reuses that answer.
 *
 * So it only reads a position when the permission has ALREADY been granted, and
 * otherwise returns null and lets the caller fall back to showing an area name.
 */
export function useUserLocation(): LatLng | null {
  const [position, setPosition] = useState<LatLng | null>(() => {
    // A cached fix avoids a blank distance on every navigation back to Home.
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length === 2 ? (parsed as LatLng) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    if (!navigator.geolocation) return;

    const read = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const here: LatLng = [pos.coords.latitude, pos.coords.longitude];
          setPosition(here);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(here));
          } catch {
            // Storage unavailable; the in-memory value still works this session.
          }
        },
        () => {
          // Silent: this is opportunistic, and the caller has a fallback.
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    };

    // Permissions API tells us whether reading would prompt. Where it is not
    // supported we skip rather than risk an unexplained prompt on Home.
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'granted') read();
      })
      .catch(() => {
        // Some browsers reject the query for geolocation; stay quiet.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return position;
}
