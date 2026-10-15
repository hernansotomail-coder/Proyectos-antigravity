import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const loadPersistedTipoDotacion = () => {
  try {
    const saved = localStorage.getItem('keylogistics_staff_tipo_dotacion');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const persistTipoDotacion = (map) => {
  try {
    localStorage.setItem('keylogistics_staff_tipo_dotacion', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting tipo dotacion:', e);
  }
};

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
        .order('name', { ascending: true });

      if (error) throw error;
      
      const tipoMap = loadPersistedTipoDotacion();
      const enriched = (data || []).map(s => ({
        ...s,
        tipo_dotacion: s.tipo_dotacion || tipoMap[s.id] || (s.rut ? tipoMap[s.rut] : null) || 'Propia'
      }));

      set({ staffList: enriched, error: null });
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
    const tipo = staffData.tipo_dotacion || 'Propia';
    try {
      let insertedRow = null;
      try {
        const { data, error } = await supabase
          .from('staff')
          .insert([staffData])
          .select();
        if (error) throw error;
        insertedRow = data[0];
      } catch (insertErr) {
        // Fallback si la columna no existe en Supabase todavía
        const { tipo_dotacion, ...rest } = staffData;
        const { data, error } = await supabase
          .from('staff')
          .insert([rest])
          .select();
        if (error) throw error;
        insertedRow = data[0];
      }

      // Persistir tipo_dotacion en mapping local
      const tipoMap = loadPersistedTipoDotacion();
      if (insertedRow.id) tipoMap[insertedRow.id] = tipo;
      if (insertedRow.rut) tipoMap[insertedRow.rut] = tipo;
      persistTipoDotacion(tipoMap);

      const finalRow = { ...insertedRow, tipo_dotacion: tipo };

      set((state) => {
        const newList = [finalRow, ...state.staffList];
        return { staffList: newList.sort((a, b) => a.name.localeCompare(b.name)), error: null };
      });
      toast.success('Registro guardado correctamente');
      return true;
    } catch (err) {
      console.error(err);
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
      const tipoMap = loadPersistedTipoDotacion();
      staffArray.forEach(s => {
        const t = s.tipo_dotacion || 'Propia';
        if (s.rut) tipoMap[s.rut] = t;
      });
      persistTipoDotacion(tipoMap);

      try {
        const { error } = await supabase
          .from('staff')
          .upsert(staffArray, { onConflict: 'rut' })
          .select();
        if (error) throw error;
      } catch (upsertErr) {
        // Fallback sin tipo_dotacion si la columna no existe en la BD
        const sanitized = staffArray.map(({ tipo_dotacion, ...rest }) => rest);
        const { error } = await supabase
          .from('staff')
          .upsert(sanitized, { onConflict: 'rut' })
          .select();
        if (error) throw error;
      }

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
  },

  updateStaffTipoDotacion: async (staffId, tipo) => {
    const tipoMap = loadPersistedTipoDotacion();
    tipoMap[staffId] = tipo;
    persistTipoDotacion(tipoMap);

    set((state) => ({
      staffList: state.staffList.map(s => s.id === staffId ? { ...s, tipo_dotacion: tipo } : s)
    }));

    try {
      await supabase.from('staff').update({ tipo_dotacion: tipo }).eq('id', staffId);
    } catch (e) {
      // Ignorar si la columna no existe en Supabase, el local storage ya lo respalda
    }
  }
}));
