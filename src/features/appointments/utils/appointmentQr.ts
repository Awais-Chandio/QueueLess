export const APPOINTMENT_QR_TYPE = 'mediq_appointment';

export interface AppointmentQrPayload {
  type: typeof APPOINTMENT_QR_TYPE;
  id: string;
}

export const buildAppointmentQrValue = (appointmentId: string): string =>
  JSON.stringify({ type: APPOINTMENT_QR_TYPE, id: appointmentId });

// Returns null for anything that isn't a MediQ appointment QR. The id is still
// untrusted here; callers must look it up before acting on it.
export const parseAppointmentQrValue = (
  raw: string,
): AppointmentQrPayload | null => {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === APPOINTMENT_QR_TYPE &&
      typeof parsed.id === 'string' &&
      parsed.id.length > 0
    ) {
      return { type: APPOINTMENT_QR_TYPE, id: parsed.id };
    }
  } catch {
    // Not JSON: fall through.
  }
  return null;
};
