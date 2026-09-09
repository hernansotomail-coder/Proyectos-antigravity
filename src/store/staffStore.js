import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const useStaffStore = create((set, get) => ({
  staffList: [],
  isLoading: false,
  error: null,

  fetchStaff: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ staffList: data, error: null });
    } catch (err) {
      console.error(err);
      set({ error: err.message });
      toast.error('Error al cargar la dotación');
    } finally {
      set({ isLoading: false });
    }
  },

  addStaff: async (staffData) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('staff')
        .insert([staffData])
        .select();

      if (error) throw error;
      
      set((state) => ({ staffList: [data[0], ...state.staffList], error: null }));
      toast.success('Registro guardado correctamente');
      return true;
    } catch (err) {
      console.error(err);
      // Custom message if RUT already exists
      if (err.code === '23505') {
        toast.error('El RUT ingresado ya existe en la base de datos');
      } else {
        toast.error('Error al guardar el registro');
      }
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  addStaffBulk: async (staffArray) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('staff')
        .upsert(staffArray, { onConflict: 'rut' }) // Update if exists, insert if new
        .select();

      if (error) throw error;
      
      // Reload full list to ensure consistency
      await get().fetchStaff();
      toast.success(`${staffArray.length} registros procesados correctamente`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error en la carga masiva');
      return false;
    } finally {
      set({ isLoading: false });
    }
  }
}));
