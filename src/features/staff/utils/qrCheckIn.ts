import { appointmentService } from '../../../services/appointmentService';
import { getStaffCenterIds } from '../../../services/queueService';
import type { AppointmentFull } from '../../../types/appointment';
import { parseAppointmentQrValue } from '../../appointments/utils/appointmentQr';

export type QrScanResult =
  | { ok: true; appointment: AppointmentFull }
  | { ok: false; message: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// fetchAppointmentById uses .single(), which errors when no row is visible
// (missing id or hidden by RLS). Both cases mean "not found" to the staff member.
const isNoRowError = (error: unknown) =>
  error instanceof Error && /0 rows|coerce|no rows/i.test(error.message);

const formatStatus = (status: string) => status.replace(/_/g, ' ');

// Never trusts the scanned payload: the id is only a lookup key, and every
// decision is made from the appointment fetched from the backend.
export const validateScannedAppointment = async (
  rawValue: string,
  staffProfileId: string,
): Promise<QrScanResult> => {
  const payload = parseAppointmentQrValue(rawValue);
  if (!payload) {
    return { ok: false, message: 'Not a MediQ QR code' };
  }

  if (!UUID_PATTERN.test(payload.id)) {
    return { ok: false, message: 'Appointment not found.' };
  }

  let appointment: AppointmentFull | null;
  try {
    appointment = await appointmentService.fetchAppointmentById(payload.id);
  } catch (error) {
    if (isNoRowError(error)) {
      return { ok: false, message: 'Appointment not found.' };
    }
    throw error;
  }

  if (!appointment) {
    return { ok: false, message: 'Appointment not found.' };
  }

  const centerIds = await getStaffCenterIds(staffProfileId);
  if (!centerIds.includes(appointment.center_id)) {
    return {
      ok: false,
      message: "This appointment isn't at your assigned center.",
    };
  }

  if (appointment.status !== 'confirmed') {
    return {
      ok: false,
      message: `This appointment can't be checked in. Current status: ${formatStatus(
        appointment.status,
      )}.`,
    };
  }

  return { ok: true, appointment };
};
