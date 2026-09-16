// GPS fix validation and reverse-geocoding thresholds.
//
// Values are carried over from NaviGo (MyPlacesTracker), a sibling project's
// audited location implementation (`src/config/locationConfig.ts`), except
// where noted — QueueLess is a clinic finder, not a turn-by-turn navigation
// app, so a couple of values are relaxed to match that use case.

export const LOCATION_CONFIG = {
  /**
   * Maximum usable GPS accuracy radius, in meters. A fix reported with a
   * worse (larger) accuracy value is rejected rather than used to compute
   * distance-to-clinic. Matches NaviGo's GPS_ACCURACY_MAX_THRESHOLD_METERS.
   */
  GPS_ACCURACY_MAX_THRESHOLD_METERS: 100,

  /**
   * Maximum plausible ground speed, in meters/second, used to reject
   * implausible GPS jumps between consecutive watched fixes (~216 km/h).
   * Matches NaviGo's GPS_MAX_PLAUSIBLE_SPEED_MPS.
   */
  GPS_MAX_PLAUSIBLE_SPEED_MPS: 60,

  /** Min distance change in meters required for native watch updates. */
  GPS_DISTANCE_FILTER_METERS: 10,

  /** Location watch interval in ms. */
  GPS_WATCH_INTERVAL_MS: 5000,

  /** Location watch fastest interval in ms. */
  GPS_WATCH_FASTEST_INTERVAL_MS: 2500,

  /** How long a cached native fix may be reused before it's considered stale. */
  CACHED_FIX_MAX_AGE_MS: 10000,

  /** How long to wait for an initial one-shot fix before giving up. */
  INITIAL_FIX_TIMEOUT_MS: 15000,

  /**
   * Distance a user must move, in meters, before a new reverse-geocode call
   * is made. Matches NaviGo's ADDRESS_GEOCODE_THRESHOLD_METERS, which is the
   * threshold that specific project uses to gate reverse geocoding on
   * movement (its separate 150m NEARBY_REQUERY_THRESHOLD_METERS governs
   * re-querying nearby places, a different concern QueueLess doesn't use
   * Photon for).
   */
  REVERSE_GEOCODE_MOVE_THRESHOLD_METERS: 50,

  /** How long a reverse-geocode result is cached for a given coordinate. */
  REVERSE_GEOCODE_CACHE_TTL_MS: 5 * 60 * 1000,
} as const;
