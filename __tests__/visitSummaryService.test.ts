jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from '../src/lib/supabase';
import { isBlankMedicine, visitSummaryService } from '../src/services/visitSummaryService';

const fromMock = supabase.from as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;

const medicine = {
  medicine_name: '  Cetirizine ',
  dosage: '10 mg',
  frequency: 'Once daily',
  duration: '7 days',
  instructions: '  ',
};

const payload = {
  appointmentId: 'appt-1',
  diagnosis: '  Allergic rhinitis ',
  notes: '',
  followUpDate: '2026-10-01',
  items: [medicine],
};

describe('visitSummaryService.save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends trimmed values to save_visit_summary and returns the summary id', async () => {
    rpcMock.mockResolvedValue({ data: 'summary-1', error: null });

    await expect(visitSummaryService.save(payload)).resolves.toBe('summary-1');

    expect(rpcMock).toHaveBeenCalledWith('save_visit_summary', {
      p_appointment_id: 'appt-1',
      p_diagnosis: 'Allergic rhinitis',
      p_notes: '',
      p_follow_up_date: '2026-10-01',
      p_items: [
        {
          medicine_name: 'Cetirizine',
          dosage: '10 mg',
          frequency: 'Once daily',
          duration: '7 days',
          instructions: null,
        },
      ],
    });
  });

  it('drops untouched medicine rows instead of failing on them', async () => {
    rpcMock.mockResolvedValue({ data: 'summary-1', error: null });
    const blank = { medicine_name: '', dosage: ' ', frequency: '', duration: '', instructions: '' };

    await visitSummaryService.save({ ...payload, items: [blank, medicine] });

    expect(rpcMock.mock.calls[0][1].p_items).toHaveLength(1);
  });

  it('rejects a half-filled medicine before calling the database', async () => {
    await expect(
      visitSummaryService.save({
        ...payload,
        items: [{ ...medicine }, { medicine_name: 'Ibuprofen', dosage: '', frequency: '', duration: '' }],
      }),
    ).rejects.toThrow('Medicine 2 needs a name, dosage, frequency and duration.');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects a completely empty summary', async () => {
    await expect(
      visitSummaryService.save({ ...payload, diagnosis: ' ', followUpDate: null, items: [] }),
    ).rejects.toThrow('Add a diagnosis');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects an over-long diagnosis', async () => {
    await expect(
      visitSummaryService.save({ ...payload, diagnosis: 'x'.repeat(1001) }),
    ).rejects.toThrow('at most 1000 characters');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('turns a row-level-security rejection into a readable message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'rls' } });

    await expect(visitSummaryService.save(payload)).rejects.toThrow(
      'Only the assigned doctor can write a summary for a completed visit.',
    );
  });
});

describe('visitSummaryService.getForAppointment', () => {
  const mockSelect = (result: { data: unknown; error: unknown }) => {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    return { eq };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no summary exists', async () => {
    const { eq } = mockSelect({ data: null, error: null });

    await expect(visitSummaryService.getForAppointment('appt-1')).resolves.toBeNull();
    expect(fromMock).toHaveBeenCalledWith('visit_summaries');
    expect(eq).toHaveBeenCalledWith('appointment_id', 'appt-1');
  });

  it('returns medicines ordered by sort_order', async () => {
    mockSelect({
      data: {
        id: 's1',
        prescription_items: [
          { id: 'b', sort_order: 1 },
          { id: 'a', sort_order: 0 },
        ],
      },
      error: null,
    });

    const summary = await visitSummaryService.getForAppointment('appt-1');

    expect(summary?.prescription_items.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('throws the database error message', async () => {
    mockSelect({ data: null, error: { message: 'boom' } });

    await expect(visitSummaryService.getForAppointment('appt-1')).rejects.toThrow('boom');
  });
});

describe('isBlankMedicine', () => {
  it('is true only when every field is empty or whitespace', () => {
    expect(isBlankMedicine({ medicine_name: ' ', dosage: '', frequency: '', duration: '' })).toBe(true);
    expect(isBlankMedicine({ medicine_name: '', dosage: '', frequency: '', duration: '', instructions: 'x' })).toBe(false);
  });
});
