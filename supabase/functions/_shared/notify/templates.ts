// Patient messages, Urdu and English. Used as plain SMS text, and as the
// parameter list of the matching WhatsApp template (Meta needs approved
// templates for business-initiated messages; see tasks/phase-1d/README.md).

export type NotifyEvent = 'token_issued' | 'three_ahead' | 'your_turn' | 'doctor_late' | 'doctor_break';
export type Language = 'ur' | 'en';

/** What the outbox trigger stores (private.enqueue_notification). */
export interface NotifyPayload {
  token_number: number;
  public_code: string | null;
  clinic_name: string | null;
  organization_name?: string | null;
  doctor_name: string | null;
  room: string | null;
  timezone?: string | null;
  people_ahead?: number | null;
  late_until?: string | null;
}

export interface RenderedMessage {
  /** Plain text (SMS). */
  text: string;
  /** WhatsApp template body parameters, in {{1}}, {{2}}, ... order. */
  params: string[];
}

export const EVENTS: NotifyEvent[] = ['token_issued', 'three_ahead', 'your_turn', 'doctor_late', 'doctor_break'];

export const statusLink = (siteUrl: string, code: string | null) =>
  code ? `${siteUrl.replace(/\/+$/, '')}/t/${code}` : siteUrl.replace(/\/+$/, '');

/** "2:45 PM" in the clinic's time zone (Latin digits in both languages). */
export const clinicTime = (iso: string, timeZone = 'Asia/Karachi') =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

const aheadText = (n: number, language: Language) => {
  if (language === 'ur') {
    if (n <= 0) return 'آپ اگلے ہیں۔';
    if (n === 1) return 'آپ سے پہلے 1 مریض ہے۔';
    return `آپ سے پہلے ${n} مریض ہیں۔`;
  }
  if (n <= 0) return "You're next.";
  if (n === 1) return '1 person is ahead of you.';
  return `${n} people are ahead of you.`;
};

/** Builds the message for one outbox row. Missing names fall back to neutral words, never "null". */
export const renderMessage = (event: NotifyEvent, language: Language, payload: NotifyPayload, siteUrl: string): RenderedMessage => {
  const ur = language === 'ur';
  const clinic = payload.clinic_name || payload.organization_name || (ur ? 'کلینک' : 'Clinic');
  const token = String(payload.token_number);
  const doctor = payload.doctor_name || (ur ? 'ڈاکٹر' : 'the doctor');
  const room = payload.room || (ur ? 'ڈاکٹر کا کمرہ' : "the doctor's room");
  const link = statusLink(siteUrl, payload.public_code);
  const ahead = Math.max(0, payload.people_ahead ?? 0);

  switch (event) {
    case 'token_issued':
      return {
        text: ur
          ? `${clinic}: آپ کا ٹوکن نمبر ${token} ہے (${doctor})۔ ${aheadText(ahead, language)} اپنی باری یہاں دیکھیں: ${link}`
          : `${clinic}: Your token is ${token} for ${doctor}. ${aheadText(ahead, language)} Track your turn: ${link}`,
        params: [clinic, token, doctor, String(ahead), link],
      };
    case 'three_ahead':
      return {
        text: ur
          ? `${clinic}: ٹوکن ${token} — آپ سے پہلے صرف 3 مریض ہیں۔ براہ کرم ${room} کے قریب آ جائیں۔`
          : `${clinic}: Token ${token} — only 3 people are ahead of you. Please come near ${room}.`,
        params: [clinic, token, room],
      };
    case 'your_turn':
      return {
        text: ur
          ? `${clinic}: آپ کی باری آ گئی ہے! ٹوکن ${token}، براہ کرم ابھی ${doctor} (${room}) کے پاس جائیں۔`
          : `${clinic}: It's your turn! Token ${token}, please go to ${doctor} (${room}) now.`,
        params: [clinic, token, doctor, room],
      };
    case 'doctor_late': {
      const time = payload.late_until ? clinicTime(payload.late_until, payload.timezone || undefined) : ur ? 'کچھ دیر' : 'soon';
      return {
        text: ur
          ? `${clinic}: ${doctor} کو دیر ہو رہی ہے، تقریباً ${time} تک آئیں گے۔ آپ کی جگہ (ٹوکن ${token}) محفوظ ہے۔ ${link}`
          : `${clinic}: ${doctor} is running late and is expected around ${time}. Your place (token ${token}) is kept. ${link}`,
        params: [clinic, doctor, time, token, link],
      };
    }
    case 'doctor_break':
      return {
        text: ur
          ? `${clinic}: ${doctor} مختصر وقفے پر ہیں۔ آپ کی جگہ (ٹوکن ${token}) محفوظ ہے۔ ${link}`
          : `${clinic}: ${doctor} is on a short break. Your place (token ${token}) is kept. ${link}`,
        params: [clinic, doctor, token, link],
      };
  }
};
