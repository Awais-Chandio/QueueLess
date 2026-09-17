import { supabase } from '../../../lib/supabase';

export type StaffCenter = {
  id: string;
  name: string;
  city: string;
};

export type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
  centers: StaffCenter[];
};

export type UpdateStaffProfilePayload = {
  full_name: string;
  email: string;
  phone: string | null;
  center_ids: string[];
};

type StaffProfileQueryResult = Omit<StaffProfile, 'centers'> & {
  staff_centers:
    | {
        center_id: string;
        service_centers: StaffCenter | StaffCenter[] | null;
      }[]
    | null;
};

const normalizeStaffProfile = ({ staff_centers, ...profile }: StaffProfileQueryResult): StaffProfile => ({
  ...profile,
  centers: (staff_centers ?? [])
    .map(assignment => {
      const center = Array.isArray(assignment.service_centers)
        ? assignment.service_centers[0]
        : assignment.service_centers;
      return center ?? null;
    })
    .filter((center): center is StaffCenter => center !== null)
    .sort((a, b) => a.name.localeCompare(b.name)),
});

const staffProfileSelect = `
  id,
  full_name,
  email,
  phone,
  avatar_url,
  created_at,
  updated_at,
  staff_centers (
    center_id,
    service_centers (
      id,
      name,
      city
    )
  )
`;

const replaceCenterAssignments = async (staffId: string, centerIds: string[]) => {
  const uniqueCenterIds = [...new Set(centerIds)];
  const { data: existing, error: readError } = await supabase
    .from('staff_centers')
    .select('center_id')
    .eq('profile_id', staffId);

  if (readError) throw new Error(readError.message);

  const existingIds = new Set((existing ?? []).map(row => row.center_id));
  const toAdd = uniqueCenterIds.filter(centerId => !existingIds.has(centerId));
  const toRemove = [...existingIds].filter(centerId => !uniqueCenterIds.includes(centerId));

  if (toAdd.length > 0) {
    const { error } = await supabase.from('staff_centers').insert(
      toAdd.map(centerId => ({ profile_id: staffId, center_id: centerId })),
    );
    if (error) throw new Error(error.message);
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('staff_centers')
      .delete()
      .eq('profile_id', staffId)
      .in('center_id', toRemove);
    if (error) throw new Error(error.message);
  }
};

export const staffService = {
  async getAll(): Promise<StaffProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select(staffProfileSelect)
      .eq('role', 'staff')
      .order('full_name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as unknown as StaffProfileQueryResult[]).map(normalizeStaffProfile);
  },

  async getById(staffId: string): Promise<StaffProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .select(staffProfileSelect)
      .eq('id', staffId)
      .eq('role', 'staff')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return normalizeStaffProfile(data as unknown as StaffProfileQueryResult);
  },

  async update(staffId: string, payload: UpdateStaffProfilePayload): Promise<StaffProfile> {
    const { center_ids, ...profileFields } = payload;

    // The role filter guarantees center assignments are only written for staff.
    const { error } = await supabase
      .from('profiles')
      .update({
        ...profileFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staffId)
      .eq('role', 'staff')
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await replaceCenterAssignments(staffId, center_ids);

    return staffService.getById(staffId);
  },

  async deleteAccount(staffId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_staff_account', {
      staff_profile_id: staffId,
    });

    if (error) {
      throw new Error(error.message);
    }
  },
};
