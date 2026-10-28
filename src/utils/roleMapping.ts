export type UserRole = 'client' | 'staff' | 'admin' | 'doctor';
export type UserRoute = 'PatientNavigator' | 'StaffNavigator' | 'AdminNavigator' | 'DoctorNavigator';

const userRoles: UserRole[] = ['client', 'staff', 'admin', 'doctor'];

export const normalizeUserRole = (role: unknown): UserRole => {
  if (typeof role === 'string' && userRoles.includes(role as UserRole)) {
    return role as UserRole;
  }

  return 'client';
};

export const getUserRoute = (role: unknown): UserRoute => {
  const normalizedRole = normalizeUserRole(role);

  if (normalizedRole === 'admin') {
    return 'AdminNavigator';
  }

  if (normalizedRole === 'staff') {
    return 'StaffNavigator';
  }

  if (normalizedRole === 'doctor') {
    return 'DoctorNavigator';
  }

  return 'PatientNavigator';
};

export const getRoleUiName = (role: unknown) => {
  const normalizedRole = normalizeUserRole(role);

  if (normalizedRole === 'admin') {
    return 'Admin';
  }

  if (normalizedRole === 'staff') {
    return 'Receptionist';
  }

  if (normalizedRole === 'doctor') {
    return 'Doctor';
  }

  return 'Patient';
};

type WorkspaceRoles = { roles?: string[] | null };

/**
 * Which app a signed-in user gets. Clinic roles come from org_members (the web
 * app invites receptionists and creates owners without touching
 * profiles.role), so they win over the legacy profile role:
 *   platform admin (profiles.role)           -> admin
 *   doctor member with a linked doctor record -> doctor (owner-doctors too)
 *   owner / receptionist member               -> staff (reception)
 *   legacy profile role doctor / staff        -> as before
 *   anyone else                                -> client
 */
export const resolveAppRole = ({
  profileRole,
  workspaces,
  doctorId,
}: {
  profileRole: unknown;
  workspaces: WorkspaceRoles[];
  doctorId: string | null;
}): UserRole => {
  const role = normalizeUserRole(profileRole);
  if (role === 'admin') return 'admin';

  const orgRoles = new Set(workspaces.flatMap(workspace => workspace.roles ?? []));
  if (doctorId && (orgRoles.has('doctor') || role === 'doctor')) return 'doctor';
  if (orgRoles.has('owner') || orgRoles.has('receptionist')) return 'staff';
  if (role === 'doctor' || role === 'staff') return role;
  return 'client';
};

/** Owners and receptionists run the desk; a doctor who also owns the clinic gets both. */
export const canRunReception = (workspaces: WorkspaceRoles[]) =>
  workspaces.some(workspace => (workspace.roles ?? []).some(role => role === 'owner' || role === 'receptionist'));

export type AppMode = 'clinic' | 'doctor';

/**
 * An owner (or receptionist) who is also a doctor switches between "Clinic"
 * (the reception desk) and "Meri queue" (their own queue), as on the web.
 * Everyone else has one app.
 */
export const hasModeSwitch = (role: UserRole | null, workspaces: WorkspaceRoles[]) =>
  role === 'doctor' && canRunReception(workspaces);

export const doctorSideNavigator = (role: UserRole | null, workspaces: WorkspaceRoles[], mode: AppMode) =>
  hasModeSwitch(role, workspaces) && mode === 'clinic' ? 'StaffNavigator' : 'DoctorNavigator';
