jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from '../src/lib/supabase';
import { staffService } from '../src/features/admin/api/staffService';

const fromMock = supabase.from as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;

describe('staffService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only staff profiles with every assigned center from staff_centers', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'staff-1',
          full_name: 'Front Desk',
          email: 'frontdesk@example.com',
          phone: '03001234567',
          avatar_url: null,
          center_id: 'center-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: null,
          staff_centers: [
            { center_id: 'center-2', service_centers: { id: 'center-2', name: 'North Clinic', city: 'Lahore' } },
            { center_id: 'center-1', service_centers: [{ id: 'center-1', name: 'Main Clinic', city: 'Lahore' }] },
          ],
        },
      ],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const result = await staffService.getAll();

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(eq).toHaveBeenCalledWith('role', 'staff');
    expect(result[0].centers.map(center => center.name)).toEqual(['Main Clinic', 'North Clinic']);
  });

  it('updates a staff profile, then diffs staff_centers assignments', async () => {
    const payload = {
      full_name: 'Updated Staff',
      email: 'updated@example.com',
      phone: '03001234567',
      center_ids: ['center-2', 'center-3'],
    };

    // profiles.update(...).eq('id').eq('role').select('id').single()
    const updateSingle = jest.fn().mockResolvedValue({ data: { id: 'staff-1' }, error: null });
    const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
    const updateEq = jest.fn();
    updateEq.mockReturnValueOnce({ eq: updateEq }).mockReturnValueOnce({ select: updateSelect });
    const update = jest.fn().mockReturnValue({ eq: updateEq });

    // staff_centers.select('center_id').eq('profile_id')
    const assignmentsEq = jest.fn().mockResolvedValue({
      data: [{ center_id: 'center-1' }, { center_id: 'center-2' }],
      error: null,
    });
    const insert = jest.fn().mockResolvedValue({ error: null });
    const deleteIn = jest.fn().mockResolvedValue({ error: null });
    const deleteEq = jest.fn().mockReturnValue({ in: deleteIn });
    const del = jest.fn().mockReturnValue({ eq: deleteEq });

    // profiles.select(...).eq('id').eq('role').single() for the re-read
    const readSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'staff-1',
        full_name: 'Updated Staff',
        email: 'updated@example.com',
        phone: '03001234567',
        avatar_url: null,
        center_id: 'center-2',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        staff_centers: [],
      },
      error: null,
    });
    const readEq = jest.fn();
    readEq.mockReturnValueOnce({ eq: readEq }).mockReturnValueOnce({ single: readSingle });

    fromMock.mockImplementation((table: string) => {
      if (table === 'staff_centers') {
        return {
          select: jest.fn().mockReturnValue({ eq: assignmentsEq }),
          insert,
          delete: del,
        };
      }
      return { update, select: jest.fn().mockReturnValue({ eq: readEq }) };
    });

    const result = await staffService.update('staff-1', payload);

    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({ center_id: expect.anything() }),
    );
    expect(updateEq).toHaveBeenNthCalledWith(2, 'role', 'staff');
    expect(insert).toHaveBeenCalledWith([{ profile_id: 'staff-1', center_id: 'center-3' }]);
    expect(deleteIn).toHaveBeenCalledWith('center_id', ['center-1']);
    expect(result.full_name).toBe('Updated Staff');
  });

  it('does not touch staff_centers when the profile is not staff', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn();
    eq.mockReturnValueOnce({ eq }).mockReturnValueOnce({ select });
    fromMock.mockReturnValue({ update: jest.fn().mockReturnValue({ eq }) });

    await expect(
      staffService.update('doctor-1', {
        full_name: 'X',
        email: 'x@example.com',
        phone: '03001234567',
        center_ids: ['center-1'],
      }),
    ).rejects.toThrow('no rows');
    expect(fromMock).not.toHaveBeenCalledWith('staff_centers');
  });

  it('deletes through the admin account RPC and surfaces backend errors', async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    await expect(staffService.deleteAccount('staff-1')).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('admin_delete_staff_account', {
      staff_profile_id: 'staff-1',
    });

    rpcMock.mockResolvedValueOnce({ error: { message: 'Target profile is not staff' } });
    await expect(staffService.deleteAccount('doctor-1')).rejects.toThrow(
      'Target profile is not staff',
    );
  });
});
