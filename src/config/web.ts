import Config from 'react-native-config';

// The MediQ web app (mediq-web). The phone app does the daily work; detailed
// records live on the web. Google Play: the app may link to records, never to
// plan purchase or payment pages (src/features/plans/modules.ts).

export const WEB_APP_URL = (Config.WEB_APP_URL?.trim() || 'https://app.mediq.pk').replace(/\/+$/, '');

/**
 * Records (Hisaab) for one center, opened in the browser. `center` picks the
 * same clinic on the web; `from=app` hides the web's plan links on that visit.
 */
export const hisaabUrl = (centerId: string) =>
  `${WEB_APP_URL}/hisaab?center=${encodeURIComponent(centerId)}&from=app`;
