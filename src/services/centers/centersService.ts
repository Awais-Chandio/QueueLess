import { supabase } from '../supabase/client';
import { Center, CenterService } from '../../types/center';

export const centersService = {
  async getCenters(): Promise<Center[]> {
    const { data, error } = await supabase
      .from('centers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data as Center[];
  },

  async getCenterById(centerId: string): Promise<Center> {
    const { data, error } = await supabase
      .from('centers')
      .select('*')
      .eq('id', centerId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as Center;
  },

  async getCenterServices(
    centerId: string,
  ): Promise<CenterService[]> {
    const { data, error } = await supabase
      .from('center_services')
      .select('*')
      .eq('center_id', centerId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data as CenterService[];
  },
};