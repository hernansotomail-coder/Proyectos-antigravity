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

const loadPersistedEmpresaExterna = () => {
  try {
    const saved = localStorage.getItem('keylogistics_staff_empresa_externa');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const persistEmpresaExterna = (map) => {
  try {
    localStorage.setItem('keylogistics_staff_empresa_externa', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting empresa externa:', e);
  }
};

const loadPersistedStaffPhones = () => {
  try {
    const saved = localStorage.getItem('keylogistics_staff_phones');
    const legacy = localStorage.getItem('keylogistics_conductor_phones');
    const legacyMap = legacy ? JSON.parse(legacy) : {};
    const staffMap = saved ? JSON.parse(saved) : {};
    return { ...legacyMap, ...staffMap };
  } catch (e) {
    return {};
  }
};

const persistStaffPhones = (map) => {
  try {
    localStorage.setItem('keylogistics_staff_phones', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting staff phones:', e);
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
      const phoneMap = loadPersistedStaffPhones();
      const empresaMap = loadPersistedEmpresaExterna();

      const enriched = (data || []).map(s => {
        const staffPhone = s.phone || 
          phoneMap[s.id] || 
          (s.rut ? phoneMap[s.rut] : null) || 
          (s.name ? phoneMap[s.name.trim().toLowerCase()] : null) || 
          (s.name ? phoneMap[s.name.trim()] : null) || 
          '';

        const tipo = s.tipo_dotacion || tipoMap[s.id] || (s.rut ? tipoMap[s.rut] : null) || 'Propia';
        const empresa = s.empresa_externa || empresaMap[s.id] || (s.rut ? empresaMap[s.rut] : null) || (s.name ? empresaMap[s.name.trim().toLowerCase()] : null) || '';

        return {
          ...s,
          phone: staffPhone,
          tipo_dotacion: tipo,
          empresa_externa: empresa
        };
      });

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
    const phone = staffData.phone || '';
    const empresa = staffData.empresa_externa || '';
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
        // Fallback si las columnas adicionales no existen en Supabase todavía
        const { tipo_dotacion, phone: _, empresa_externa: __, ...rest } = staffData;
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

      // Persistir empresa_externa en mapping local
      const empresaMap = loadPersistedEmpresaExterna();
      if (insertedRow.id) empresaMap[insertedRow.id] = empresa;
      if (insertedRow.rut) empresaMap[insertedRow.rut] = empresa;
      if (insertedRow.name) {
        empresaMap[insertedRow.name.trim().toLowerCase()] = empresa;
        empresaMap[insertedRow.name.trim()] = empresa;
      }
      persistEmpresaExterna(empresaMap);

      // Persistir teléfono en mapping local
      const phoneMap = loadPersistedStaffPhones();
      if (insertedRow.id) phoneMap[insertedRow.id] = phone;
      if (insertedRow.rut) phoneMap[insertedRow.rut] = phone;
      if (insertedRow.name) {
        phoneMap[insertedRow.name.trim().toLowerCase()] = phone;
        phoneMap[insertedRow.name.trim()] = phone;
      }
      persistStaffPhones(phoneMap);

      const finalRow = { ...insertedRow, tipo_dotacion: tipo, phone, empresa_externa: empresa };

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
      const phoneMap = loadPersistedStaffPhones();
      const empresaMap = loadPersistedEmpresaExterna();

      staffArray.forEach(s => {
        const t = s.tipo_dotacion || 'Propia';
        if (s.rut) tipoMap[s.rut] = t;
        if (s.empresa_externa) {
          if (s.rut) empresaMap[s.rut] = s.empresa_externa;
          if (s.name) {
            empresaMap[s.name.trim().toLowerCase()] = s.empresa_externa;
            empresaMap[s.name.trim()] = s.empresa_externa;
          }
        }
        if (s.phone) {
          if (s.rut) phoneMap[s.rut] = s.phone;
          if (s.name) {
            phoneMap[s.name.trim().toLowerCase()] = s.phone;
            phoneMap[s.name.trim()] = s.phone;
          }
        }
      });
      persistTipoDotacion(tipoMap);
      persistStaffPhones(phoneMap);
      persistEmpresaExterna(empresaMap);

      try {
        const { error } = await supabase
          .from('staff')
          .upsert(staffArray, { onConflict: 'rut' })
          .select();
        if (error) throw error;
      } catch (upsertErr) {
        // Fallback sin tipo_dotacion, phone ni empresa_externa si las columnas no existen en la BD
        const sanitized = staffArray.map(({ tipo_dotacion, phone, empresa_externa, ...rest }) => rest);
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

  updateStaffTipoDotacion: async (staffId, tipo, empresa = '') => {
    const tipoMap = loadPersistedTipoDotacion();
    tipoMap[staffId] = tipo;
    persistTipoDotacion(tipoMap);

    const empresaMap = loadPersistedEmpresaExterna();
    empresaMap[staffId] = empresa;
    persistEmpresaExterna(empresaMap);

    set((state) => ({
      staffList: state.staffList.map(s => s.id === staffId ? { ...s, tipo_dotacion: tipo, empresa_externa: empresa } : s)
    }));

    try {
      await supabase.from('staff').update({ tipo_dotacion: tipo, empresa_externa: empresa }).eq('id', staffId);
    } catch (e) {
      // Ignorar si la columna no existe en Supabase, el local storage ya lo respalda
    }
  },

  updateStaffEmpresaExterna: async (staffId, empresa, rut = null, name = null) => {
    const empresaMap = loadPersistedEmpresaExterna();
    if (staffId) empresaMap[staffId] = empresa;
    if (rut) empresaMap[rut] = empresa;
    if (name) {
      empresaMap[name.trim().toLowerCase()] = empresa;
      empresaMap[name.trim()] = empresa;
    }
    persistEmpresaExterna(empresaMap);

    set((state) => ({
      staffList: state.staffList.map(s => {
        const matchesId = staffId && s.id === staffId;
        const matchesRut = rut && s.rut === rut;
        const matchesName = name && s.name && s.name.trim().toLowerCase() === name.trim().toLowerCase();
        if (matchesId || matchesRut || matchesName) {
          return { ...s, empresa_externa: empresa };
        }
        return s;
      })
    }));

    if (staffId) {
      try {
        await supabase.from('staff').update({ empresa_externa: empresa }).eq('id', staffId);
      } catch (e) {}
    }
  },

  updateStaffPhone: async (staffId, phone, rut = null, name = null) => {
    const phoneMap = loadPersistedStaffPhones();
    if (staffId) phoneMap[staffId] = phone;
    if (rut) phoneMap[rut] = phone;
    if (name) {
      phoneMap[name.trim().toLowerCase()] = phone;
      phoneMap[name.trim()] = phone;
    }
    persistStaffPhones(phoneMap);

    // Compatibilidad con legacy keylogistics_conductor_phones
    if (name) {
      try {
        const legacy = localStorage.getItem('keylogistics_conductor_phones');
        const legacyMap = legacy ? JSON.parse(legacy) : {};
        legacyMap[name.trim()] = phone;
        localStorage.setItem('keylogistics_conductor_phones', JSON.stringify(legacyMap));
      } catch (e) {}
    }

    set((state) => ({
      staffList: state.staffList.map(s => {
        const matchesId = staffId && s.id === staffId;
        const matchesRut = rut && s.rut === rut;
        const matchesName = name && s.name && s.name.trim().toLowerCase() === name.trim().toLowerCase();
        if (matchesId || matchesRut || matchesName) {
          return { ...s, phone };
        }
        return s;
      })
    }));

    if (staffId) {
      try {
        await supabase.from('staff').update({ phone }).eq('id', staffId);
      } catch (e) {
        // Fallback silencioso si no existe la columna en Supabase
      }
    }
  },

  updateStaffPhonesBulk: async (updates) => {
    // updates: Array of { id, phone, rut, name }
    const phoneMap = loadPersistedStaffPhones();
    updates.forEach(u => {
      if (u.id) phoneMap[u.id] = u.phone;
      if (u.rut) phoneMap[u.rut] = u.phone;
      if (u.name) {
        phoneMap[u.name.trim().toLowerCase()] = u.phone;
        phoneMap[u.name.trim()] = u.phone;
      }
    });
    persistStaffPhones(phoneMap);

    set((state) => {
      const updateLookup = new Map();
      updates.forEach(u => {
        if (u.id) updateLookup.set(u.id, u.phone);
        if (u.rut) updateLookup.set(u.rut, u.phone);
        if (u.name) updateLookup.set(u.name.trim().toLowerCase(), u.phone);
      });

      return {
        staffList: state.staffList.map(s => {
          const newPhone = updateLookup.get(s.id) || (s.rut && updateLookup.get(s.rut)) || (s.name && updateLookup.get(s.name.trim().toLowerCase()));
          return newPhone !== undefined ? { ...s, phone: newPhone } : s;
        })
      };
    });
  },

  getStaffPhone: (identifier) => {
    if (!identifier) return '';
    const norm = String(identifier).trim().toLowerCase();
    const state = get();
    const found = state.staffList.find(s => 
      s.id === identifier || 
      (s.rut && s.rut === identifier) || 
      (s.name && s.name.trim().toLowerCase() === norm)
    );
    if (found && found.phone) return found.phone;

    const phoneMap = loadPersistedStaffPhones();
    return phoneMap[identifier] || phoneMap[norm] || '';
  }
}));
