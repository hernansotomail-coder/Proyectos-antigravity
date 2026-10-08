import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const useFleetStore = create((set, get) => ({
  fleetList: [],
  isLoading: false,

  fetchFleet: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('fleet')
        .select('*')
        .order('plate');
      
      if (error) throw error;
      set({ fleetList: data });
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la flota');
    } finally {
      set({ isLoading: false });
    }
  },

  addFleet: async (fleetData) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('fleet')
        .insert([fleetData])
        .select();

      if (error) {
        if (error.code === '23505') {
          toast.error('Esta patente ya está registrada');
        } else {
          throw error;
        }
        return false;
      }
      
      toast.success('Vehículo agregado exitosamente');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar el vehículo');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  addFleetBulk: async (fleetArray) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('fleet')
        .upsert(fleetArray, { onConflict: 'plate' })
        .select();

      if (error) throw error;
      
      await get().fetchFleet();
      toast.success(`${fleetArray.length} vehículos procesados correctamente`);
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
