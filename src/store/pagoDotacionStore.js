import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { normalizeDate } from './planningStore';

const STORAGE_KEY_MASTER = 'keylogistics_pago_dotacion';
const STORAGE_KEY_TRANSMITTED = 'keylogistics_pago_dotacion_transmitted';

export const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
export const cleanStr = (s) => String(s || '').trim();

// Regla de periodos: Cada periodo va del 21 al 20 del mes siguiente.
// Por ejemplo: 21 de octubre a 20 de noviembre se considera como periodo de "Noviembre 2026".
export const getPeriodFromDate = (rawDate) => {
  if (!rawDate) return { key: '', label: 'Sin periodo', shortLabel: 'S/P', year: 0, month: 0 };
  const norm = normalizeDate(rawDate);
  if (!norm) return { key: '', label: 'Sin periodo', shortLabel: 'S/P', year: 0, month: 0 };

  const parts = norm.split('-');
  if (parts.length !== 3) return { key: '', label: 'Sin periodo', shortLabel: 'S/P', year: 0, month: 0 };

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return { key: '', label: 'Sin periodo', shortLabel: 'S/P', year: 0, month: 0 };
  }

  // Si el día es 21 o mayor, pertenece al periodo del mes siguiente
  if (day >= 21) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const mStr = String(month).padStart(2, '0');
  const label = `${monthNames[month - 1]} ${year}`;
  const shortLabel = `${monthNames[month - 1].slice(0, 3)} ${year}`;

  return {
    key: `${year}-${mStr}`, // '2026-11'
    label,                  // 'Noviembre 2026'
    shortLabel,             // 'Nov 2026'
    year,
    month
  };
};

export const usePagoDotacionStore = create((set, get) => ({
  paymentsList: [],             // Lista maestra total (para gráficos y totales generales)
  transmittedTripsList: [],     // Lista operacional de viajes transmitidos y conciliados
  isLoading: false,

  // Cargar pagos desde Supabase DB (con fallback a localStorage)
  fetchPayments: async () => {
    set({ isLoading: true });
    try {
      // 1. Cargar lista maestra desde tabla planning_assignments con clave __pago_dotacion__
      const { data: masterData, error: masterErr } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__pago_dotacion__')
        .maybeSingle();

      let loadedMaster = [];
      if (!masterErr && masterData && Array.isArray(masterData.assignments)) {
        loadedMaster = masterData.assignments;
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(STORAGE_KEY_MASTER);
        if (saved) {
          try { loadedMaster = JSON.parse(saved); } catch (e) {}
        }
      }

      // 2. Cargar lista de viajes transmitidos con clave __pago_dotacion_transmitted__
      const { data: transData, error: transErr } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__pago_dotacion_transmitted__')
        .maybeSingle();

      let loadedTrans = [];
      if (!transErr && transData && Array.isArray(transData.assignments)) {
        loadedTrans = transData.assignments;
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const savedTrans = localStorage.getItem(STORAGE_KEY_TRANSMITTED);
        if (savedTrans) {
          try { loadedTrans = JSON.parse(savedTrans); } catch (e) {}
        }
      }

      set({
        paymentsList: loadedMaster,
        transmittedTripsList: loadedTrans,
        isLoading: false
      });

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(loadedMaster));
        localStorage.setItem(STORAGE_KEY_TRANSMITTED, JSON.stringify(loadedTrans));
      }

      return { master: loadedMaster, transmitted: loadedTrans };
    } catch (err) {
      console.warn('[PagoDotacion] Error cargando pagos:', err);
      set({ isLoading: false });
      return { master: [], transmitted: [] };
    }
  },

  // Guardar lista maestra de pagos en Supabase y localStorage
  savePaymentsToDb: async (newPayments) => {
    set({ isLoading: true });
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(newPayments));
      }

      const { error } = await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__pago_dotacion__',
          assignments: newPayments,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      if (error) {
        console.warn('[PagoDotacion] Advertencia guardando pagos en Supabase:', error);
      }

      set({ paymentsList: newPayments, isLoading: false });
      return true;
    } catch (err) {
      console.error('[PagoDotacion] Error persistiendo pagos:', err);
      set({ paymentsList: newPayments, isLoading: false });
      return false;
    }
  },

  // Guardar lista de viajes transmitidos en Supabase y localStorage
  saveTransmittedTripsToDb: async (newTrips) => {
    set({ isLoading: true });
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_TRANSMITTED, JSON.stringify(newTrips));
      }

      const { error } = await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__pago_dotacion_transmitted__',
          assignments: newTrips,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      if (error) {
        console.warn('[PagoDotacion] Advertencia guardando viajes transmitidos:', error);
      }

      set({ transmittedTripsList: newTrips, isLoading: false });
      return true;
    } catch (err) {
      console.error('[PagoDotacion] Error persistiendo viajes transmitidos:', err);
      set({ transmittedTripsList: newTrips, isLoading: false });
      return false;
    }
  },

  // Agregar registros masivos a la lista maestra
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

  // Transmitir y conciliar con Disponibilización:
  // Cruza por Fecha y RUT contra lo disponibilizado en la plataforma.
  // Elimina los que no corresponden de la vista de transmisión, pero conserva todo en la lista maestra.
  transmitRecords: async ({ records, transmittedAssignments, staffList }) => {
    if (!records || records.length === 0) {
      toast.error('No hay registros cargados para transmitir.');
      return { totalLoaded: 0, totalTransmitted: 0, filteredOut: 0 };
    }

    set({ isLoading: true });

    const matchedTransmitted = [];
    const allMasterToMerge = [...records];

    records.forEach(item => {
      const fecha = normalizeDate(item.fechaDespacho || item.fecha);
      const rut = cleanRut(item.rutCond1 || item.rut);
      const nombre = cleanStr(item.nomCond1 || item.nombre).toUpperCase();

      // Buscar si en esa fecha ese RUT o Nombre fue disponibilizado
      const dayAssignments = transmittedAssignments?.[fecha] || [];
      const hasMatchInDisp = dayAssignments.some(a => {
        const condRut = cleanRut(a.conductor_rut);
        const auxRut = cleanRut(a.auxiliar_rut);
        const condName = cleanStr(a.conductor_name).toUpperCase();
        const auxName = cleanStr(a.auxiliar_name).toUpperCase();

        const matchRut = rut && (condRut === rut || auxRut === rut);
        const matchName = nombre && (condName.includes(nombre) || auxName.includes(nombre) || nombre.includes(condName) || nombre.includes(auxName));
        return matchRut || matchName;
      });

      // Si coincide con la Disponibilización, se conserva en la vista transmitida
      if (hasMatchInDisp) {
        matchedTransmitted.push({
          ...item,
          fechaDespacho: fecha,
          rutCond1: rut || item.rutCond1 || item.rut,
          nomCond1: item.nomCond1 || item.nombre,
          transmittedAt: new Date().toISOString(),
          isTransmittedMatch: true
        });
      }
    });

    // 1. Actualizar lista de viajes transmitidos
    const currentTrans = get().transmittedTripsList || [];
    // Evitar duplicados por id o combinación (fecha + rut + ruta)
    const existingTransKeys = new Set(currentTrans.map(t => `${t.fechaDespacho}_${cleanRut(t.rutCond1)}_${t.rutas}`));
    const newTransFiltered = matchedTransmitted.filter(t => !existingTransKeys.has(`${t.fechaDespacho}_${cleanRut(t.rutCond1)}_${t.rutas}`));
    const updatedTrans = [...newTransFiltered, ...currentTrans];

    // 2. Actualizar lista maestra (conserva todos los registros)
    const currentMaster = get().paymentsList || [];
    const existingMasterKeys = new Set(currentMaster.map(m => `${m.fechaDespacho}_${cleanRut(m.rutCond1)}_${m.rutas}`));
    const newMasterFiltered = allMasterToMerge.filter(m => !existingMasterKeys.has(`${m.fechaDespacho}_${cleanRut(m.rutCond1 || m.rut)}_${m.rutas || m.ruta}`));
    const updatedMaster = [...newMasterFiltered, ...currentMaster];

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);

    set({ isLoading: false });

    return {
      totalLoaded: records.length,
      totalTransmitted: matchedTransmitted.length,
      filteredOut: records.length - matchedTransmitted.length
    };
  },

  // Asignar nuevo viaje manual en la vista Excel transmitida
  // (se ordenará por fecha y se destacará en amarillo pastel)
  addTransmittedTrip: async (newTrip) => {
    if (!newTrip) return false;
    const currentTrans = get().transmittedTripsList || [];
    const currentMaster = get().paymentsList || [];

    const tripEntry = {
      ...newTrip,
      id: newTrip.id || `trans-manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
      origen: 'Manual',
      isManuallyAssigned: true // Activa el resaltado amarillo pastel
    };

    const updatedTrans = [tripEntry, ...currentTrans];
    const updatedMaster = [tripEntry, ...currentMaster];

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);

    toast.success(`Viaje asignado exitosamente al ${tripEntry.fechaDespacho}`);
    return tripEntry;
  },

  // Actualizar un viaje transmitido
  updateTransmittedTrip: async (id, updates) => {
    const currentTrans = get().transmittedTripsList || [];
    const currentMaster = get().paymentsList || [];

    const updatedTrans = currentTrans.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );
    const updatedMaster = currentMaster.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);
    toast.success('Viaje actualizado correctamente');
    return true;
  },

  // Eliminar un viaje transmitido
  deleteTransmittedTrip: async (id) => {
    const currentTrans = get().transmittedTripsList || [];
    const updatedTrans = currentTrans.filter(item => item.id !== id);
    await get().saveTransmittedTripsToDb(updatedTrans);
    toast.success('Viaje eliminado de la vista de transmisión');
    return true;
  },

  // Actualizar un pago existente en la lista maestra
  updatePayment: async (id, updates) => {
    const current = get().paymentsList || [];
    const updated = current.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );
    const success = await get().savePaymentsToDb(updated);
    if (success) {
      toast.success('Registro de pago actualizado exitosamente');
    }
    return success;
  },

  // Eliminar un pago de la lista maestra
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
    await get().savePaymentsToDb([]);
    await get().saveTransmittedTripsToDb([]);
    toast.info('Se han limpiado todos los registros de pago y transmisión');
    return true;
  }
}));
