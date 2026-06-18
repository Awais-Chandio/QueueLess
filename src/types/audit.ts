export type AuditAction =
  | 'confirm'
  | 'cancel'
  | 'start_service'
  | 'complete_service'
  | string;

export interface AuditLog {
  id: string;
  staff_user_id: string | null;
  appointment_id: string | null;
  action: AuditAction;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
}

export type CreateAuditLogPayload = {
  staff_user_id: string;
  appointment_id: string;
  action: AuditAction;
  old_status?: string | null;
  new_status?: string | null;
};
