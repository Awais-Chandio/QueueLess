jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../src/lib/supabase';
import { reviewService } from '../src/services/reviewService';
import { getDoctorMockData } from '../src/utils/doctorMockHelper';

const fromMock = supabase.from as jest.Mock;

const payload = {
  appointmentId: 'appt-1',
  doctorId: 'doc-1',
  patientId: 'patient-1',
  rating: 4,
  comment: '  Very thorough.  ',
};

const mockInsert = (result: { data: unknown; error: unknown }) => {
  const single = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  fromMock.mockReturnValue({ insert });
  return insert;
};

describe('reviewService.submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts into doctor_reviews with a trimmed comment', async () => {
    const row = { id: 'r1', appointment_id: 'appt-1', rating: 4 };
    const insert = mockInsert({ data: row, error: null });

    await expect(reviewService.submit(payload)).resolves.toEqual(row);

    expect(fromMock).toHaveBeenCalledWith('doctor_reviews');
    expect(insert).toHaveBeenCalledWith({
      appointment_id: 'appt-1',
      doctor_id: 'doc-1',
      patient_id: 'patient-1',
      rating: 4,
      comment: 'Very thorough.',
    });
  });

  it('stores a blank comment as null', async () => {
    const insert = mockInsert({ data: { id: 'r1' }, error: null });

    await reviewService.submit({ ...payload, comment: '   ' });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
  });

  it.each([0, 6, -1])('rejects a rating of %s before calling the database', async rating => {
    await expect(reviewService.submit({ ...payload, rating })).rejects.toThrow(
      'Please choose a rating from 1 to 5 stars.',
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects an over-long comment before calling the database', async () => {
    await expect(
      reviewService.submit({ ...payload, comment: 'x'.repeat(501) }),
    ).rejects.toThrow('at most 500 characters');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('explains a duplicate review (unique appointment_id)', async () => {
    mockInsert({ data: null, error: { code: '23505', message: 'duplicate key' } });

    await expect(reviewService.submit(payload)).rejects.toThrow(
      'You have already reviewed this visit.',
    );
  });

  it('explains a row level security rejection', async () => {
    mockInsert({ data: null, error: { code: '42501', message: 'new row violates RLS' } });

    await expect(reviewService.submit(payload)).rejects.toThrow(
      'This visit cannot be reviewed yet.',
    );
  });

  it('passes any other database error through', async () => {
    mockInsert({ data: null, error: { code: 'XX000', message: 'boom' } });

    await expect(reviewService.submit(payload)).rejects.toThrow('boom');
  });
});

describe('reviewService.getForAppointment', () => {
  it('returns null when the appointment has no review', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    await expect(reviewService.getForAppointment('appt-1')).resolves.toBeNull();
    expect(eq).toHaveBeenCalledWith('appointment_id', 'appt-1');
  });
});

describe('doctorMockHelper', () => {
  it('no longer fabricates ratings or reviews', () => {
    expect(Object.keys(getDoctorMockData('doc-1'))).toEqual(['nextSlot']);
  });
});
