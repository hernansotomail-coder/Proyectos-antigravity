import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const STORAGE_KEY = 'keylogistics_pago_dotacion';

export const usePagoDotacionStore = create((set, get) => ({
  paymentsList: [],
  isLoading: false,

  // Cargar pagos desde Supabase DB (con fallback a localStorage)
  fetchPayments: async () => {
    set({ isLoading: true });
    try {
      // 1. Intentar cargar desde Supabase tabla planning_assignments con clave __pago_dotacion__
      const { data, error } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__pago_dotacion__')
        .maybeSingle();

      if (!error && data && Array.isArray(data.assignments)) {
        set({ paymentsList: data.assignments, isLoading: false });
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.assignments));
        }
        return data.assignments;
      }

      // 2. Fallback a localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          set({ paymentsList: parsed, isLoading: false });
          return parsed;
        }
      }

      set({ paymentsList: [], isLoading: false });
      return [];
    } catch (err) {
      console.warn('[PagoDotacion] Error cargando pagos:', err);
      // Fallback a localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            set({ paymentsList: parsed, isLoading: false });
            return parsed;
          } catch (e) {}
        }
      }
      set({ paymentsList: [], isLoading: false });
      return [];
    }
  },

  // Guardar lista completa de pagos en Supabase y localStorage
  savePaymentsToDb: async (newPayments) => {
    set({ isLoading: true });
    try {
      // Persistir en localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPayments));
      }

      // Persistir en Supabase
      const { error } = await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__pago_dotacion__',
          assignments: newPayments,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      if (error) {
        console.warn('[PagoDotacion] Advertencia guardando en Supabase:', error);
      }

      set({ paymentsList: newPayments, isLoading: false });
      return true;
    } catch (err) {
      console.error('[PagoDotacion] Error persistiendo pagos:', err);
      set({ paymentsList: newPayments, isLoading: false });
      return false;
    }
  },

  // Agregar registros masivos (desde Excel)
  addBatchPayments: async (records) => {
    if (!records || records.length === 0) return false;
    const current = get().paymentsList || [];
    const updated = [...records, ...current];
    const success = await get().savePaymentsToDb(updated);
    if (success) {
      toast.success(`${records.length} registro(s) de pago guardados exitosamente`);
    }
    return success;
  },

  // Agregar un registro manual
  addManualPayment: async (record) => {
    if (!record) return false;
    const current = get().paymentsList || [];
    const newEntry = {
      ...record,
      id: record.id || `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
      origen: 'Manual'
    };
    const updated = [newEntry, ...current];
    const success = await get().savePaymentsToDb(updated);
    if (success) {
      toast.success('Viaje y pago manual registrado exitosamente');
    }
    return success;
  },

  // Actualizar un pago existente (ej. cambio de monto)
  updatePayment: async (id, updates) => {
    const current = get().paymentsList || [];
    const updated = current.map(item => item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item);
    const success = await get().savePaymentsToDb(updated);
    if (success) {
      toast.success('Registro de pago actualizado exitosamente');
    }
    return success;
  },

  // Eliminar un pago
  deletePayment: async (id) => {
    const current = get().paymentsList || [];
    const updated = current.filter(item => item.id !== id);
    const success = await get().savePaymentsToDb(updated);
    if (success) {
      toast.success('Registro de pago eliminado');
    }
    return success;
  },

  // Limpiar todos los registros
  clearAllPayments: async () => {
    const success = await get().savePaymentsToDb([]);
    if (success) {
      toast.info('Se han limpiado todos los registros de pago');
    }
    return success;
  }
}));
