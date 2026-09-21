import { supabase } from '../lib/supabase';

export const serviceService = {
  async getServices(): Promise<any[]> {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(error.message);
    }
    return data ?? [];
  },

  async createService(payload: any): Promise<any> {
    const { data, error } = await supabase
      .from('services')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  async updateService(serviceId: string, payload: any): Promise<any> {
    const { data, error } = await supabase
      .from('services')
      .update(payload)
      .eq('id', serviceId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  async deleteService(serviceId: string): Promise<void> {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);

    if (error) {
      throw new Error(error.message);
    }
  }
};
