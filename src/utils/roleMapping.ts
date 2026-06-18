export type UserRole = 'client' | 'staff' | 'admin';
export type UserRoute = 'PatientNavigator' | 'StaffNavigator' | 'AdminNavigator';

const userRoles: UserRole[] = ['client', 'staff', 'admin'];

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

  return 'Patient';
};
