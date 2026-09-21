import { supabase } from '../lib/supabase';
import { Center, CenterService } from '../types/center';

export const centerService = {
  async getCenters(): Promise<Center[]> {
    const { data, error } = await supabase
      .from('service_centers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  },

  async getCenterById(centerId: string): Promise<Center> {
    const { data, error } = await supabase
      .from('service_centers')
      .select('*')
      .eq('id', centerId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  async getCenterServices(centerId: string): Promise<CenterService[]> {
    const { data, error } = await supabase
      .from('services')
      .select('id, center_id, name, description, duration_minutes, price, on_duty_note, created_at')
      .eq('center_id', centerId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  },

  async createCenter(payload: any): Promise<Center> {
    const { data, error } = await supabase
      .from('service_centers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  async updateCenter(centerId: string, payload: any): Promise<Center> {
    const { data, error } = await supabase
      .from('service_centers')
      .update(payload)
      .eq('id', centerId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  async deleteCenter(centerId: string): Promise<void> {
    const { error } = await supabase
      .from('service_centers')
      .delete()
      .eq('id', centerId);

    if (error) {
      throw new Error(error.message);
    }
  },

  async getPopularCenters(limit = 6): Promise<(Center & { bookingCount: number })[]> {
    const [{ data: centers, error: centersError }, { data: appointments, error: appointmentsError }] =
      await Promise.all([
        supabase.from('service_centers').select('*'),
        supabase.from('appointments').select('center_id'),
      ]);

    if (centersError) {
      throw new Error(centersError.message);
    }
    if (appointmentsError) {
      throw new Error(appointmentsError.message);
    }

    const bookingCounts = new Map<string, number>();
    (appointments ?? []).forEach(appointment => {
      if (!appointment.center_id) {
        return;
      }
      bookingCounts.set(
        appointment.center_id,
        (bookingCounts.get(appointment.center_id) ?? 0) + 1,
      );
    });

    return (centers ?? [])
      .map(center => ({
        ...center,
        bookingCount: bookingCounts.get(center.id) ?? 0,
      }))
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, limit);
  },
};
