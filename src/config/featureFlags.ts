// Compile-time feature flags. Flip a flag only together with the server-side
// work it depends on.

/**
 * Firebase phone (OTP) login, bridged into a Supabase session.
 *
 * Off: the bridge signs users in with a password derived on the client from
 * their Firebase UID and a salt shipped in the app, so anyone who knows a UID
 * can log in as that user. It needs a server-side token exchange (e.g. an Edge
 * Function verifying the Firebase ID token) before it can be turned back on.
 * Firebase Cloud Messaging is unaffected by this flag.
 */
export const PHONE_LOGIN_ENABLED = false;

export const PHONE_LOGIN_DISABLED_MESSAGE = 'Phone login is currently unavailable. Please sign in with email or Google.';

export const assertPhoneLoginEnabled = () => {
  if (!PHONE_LOGIN_ENABLED) {
    throw new Error(PHONE_LOGIN_DISABLED_MESSAGE);
  }
};

/**
 * Patient marketplace: the Home feed, Explore (clinic search), Map, Nearby
 * clinics, doctor search and profiles, slot booking, and reviews.
 *
 * Off for the pilot: the app is for doctors and clinic staff. Patients get a
 * token at the desk or by QR and follow it on the web status page (the SMS
 * link). A patient who signs in anyway sees their appointments and profile.
 */
export const PATIENT_MARKETPLACE_ENABLED = false;
