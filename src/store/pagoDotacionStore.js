import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { normalizeDate } from './planningStore';

const STORAGE_KEY_MASTER = 'keylogistics_pago_dotacion';
const STORAGE_KEY_TRANSMITTED = 'keylogistics_pago_dotacion_transmitted';
const STORAGE_KEY_CONTRACT_DATES = 'keylogistics_pago_contract_dates';
const STORAGE_KEY_HISTORY = 'keylogistics_pago_dotacion_history';

export const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
export const cleanStr = (s) => String(s || '').trim();

// Formato chileno de fecha y hora: DD-MM-YYYY HH:mm
export const formatChileanDateTime = (date = new Date()) => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  } catch (e) {
    return null;
  }
};

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
  contractUploadDates: {        // Última fecha de carga por contrato (DD-MM-YYYY HH:mm)
    colectivo: null,
    contrato8: null,
    contrato9: null,
    contrato13: null
  },
  changeHistory: [],            // Histórico de cambios (eliminaciones, ediciones, ajustes RM, etc.)
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

      // 3. Cargar fechas de última carga por contrato
      const { data: datesData, error: datesErr } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__pago_dotacion_contract_dates__')
        .maybeSingle();

      let loadedDates = {
        colectivo: null,
        contrato8: null,
        contrato9: null,
        contrato13: null
      };

      if (!datesErr && datesData && datesData.assignments && typeof datesData.assignments === 'object') {
        loadedDates = { ...loadedDates, ...datesData.assignments };
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const savedDates = localStorage.getItem(STORAGE_KEY_CONTRACT_DATES);
        if (savedDates) {
          try { loadedDates = { ...loadedDates, ...JSON.parse(savedDates) }; } catch (e) {}
        }
      }

      // 4. Cargar histórico de cambios con clave __pago_dotacion_history__
      const { data: histData, error: histErr } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__pago_dotacion_history__')
        .maybeSingle();

      let loadedHistory = [];
      if (!histErr && histData && Array.isArray(histData.assignments)) {
        loadedHistory = histData.assignments;
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const savedHist = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (savedHist) {
          try { loadedHistory = JSON.parse(savedHist); } catch (e) {}
        }
      }

      // Inferencia inicial si hay viajes existentes pero no se registraron fechas aún
      if (Array.isArray(loadedTrans) && loadedTrans.length > 0) {
        const findDateFor = (keyword) => {
          const found = loadedTrans.find(t => String(t.contratoOrigen || t.origen || '').toLowerCase().includes(keyword));
          if (found && (found.transmittedAt || found.createdAt)) {
            return formatChileanDateTime(found.transmittedAt || found.createdAt);
          }
          return null;
        };
        if (!loadedDates.colectivo) loadedDates.colectivo = findDateFor('colectivo');
        if (!loadedDates.contrato8) loadedDates.contrato8 = findDateFor('8');
        if (!loadedDates.contrato9) loadedDates.contrato9 = findDateFor('9');
        if (!loadedDates.contrato13) loadedDates.contrato13 = findDateFor('13');
      }

      set({
        paymentsList: loadedMaster,
        transmittedTripsList: loadedTrans,
        contractUploadDates: loadedDates,
        changeHistory: loadedHistory,
        isLoading: false
      });

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(loadedMaster));
        localStorage.setItem(STORAGE_KEY_TRANSMITTED, JSON.stringify(loadedTrans));
        localStorage.setItem(STORAGE_KEY_CONTRACT_DATES, JSON.stringify(loadedDates));
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(loadedHistory));
      }

      return { master: loadedMaster, transmitted: loadedTrans, dates: loadedDates, history: loadedHistory };
    } catch (err) {
      console.warn('[PagoDotacion] Error cargando pagos:', err);
      set({ isLoading: false });
      return { master: [], transmitted: [], dates: {}, history: [] };
    }
  },

  // Guardar histórico de cambios en Supabase y localStorage
  saveHistoryToDb: async (newHistory) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
      }
      const { error } = await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__pago_dotacion_history__',
          assignments: newHistory,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      if (error) {
        console.warn('[PagoDotacion] Advertencia guardando histórico en Supabase:', error);
      }
      set({ changeHistory: newHistory });
      return true;
    } catch (err) {
      console.error('[PagoDotacion] Error persistiendo histórico:', err);
      set({ changeHistory: newHistory });
      return false;
    }
  },

  // Registrar un cambio en el histórico (permanente incluso tras eliminación de registros)
  logChange: async ({ action, details, record, user = '' }) => {
    try {
      const current = get().changeHistory || [];
      const newEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: formatChileanDateTime(new Date()) || new Date().toLocaleString('es-CL'),
        isoDate: new Date().toISOString(),
        action: action || 'MODIFICACION',
        details: details || '',
        user: user || 'Sistema',
        recordSnapshot: record ? JSON.parse(JSON.stringify(record)) : null
      };
      // Conservar hasta 1000 eventos de histórico
      const updated = [newEntry, ...current].slice(0, 1000);
      await get().saveHistoryToDb(updated);
      return newEntry;
    } catch (err) {
      console.error('[PagoDotacion] Error registrando cambio:', err);
      return null;
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

  // Guardar fechas de última carga por contrato
  saveContractUploadDates: async (dates) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_CONTRACT_DATES, JSON.stringify(dates));
      }
      const { error } = await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__pago_dotacion_contract_dates__',
          assignments: dates,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      if (error) {
        console.warn('[PagoDotacion] Advertencia guardando fechas de carga en Supabase:', error);
      }

      set({ contractUploadDates: dates });
      return true;
    } catch (err) {
      console.error('[PagoDotacion] Error persistiendo fechas de carga:', err);
      set({ contractUploadDates: dates });
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
  // Regla de reemplazo: Cada vez que se sube un contrato nuevo, este pisa (sobrescribe)
  // al anterior para los viajes provenientes de los Excel de ese contrato.
  // TODOS los viajes asignados por la plataforma con glosa "Eventualidad_Key" SE MANTIENEN SIEMPRE.
  transmitRecords: async ({ records, transmittedAssignments, staffList }) => {
    if (!records || records.length === 0) {
      toast.error('No hay registros cargados para transmitir.');
      return { totalLoaded: 0, totalTransmitted: 0, filteredOut: 0 };
    }

    set({ isLoading: true });

    // 1. Detectar qué tipos de contratos están presentes en este nuevo lote de subida
    const incomingContractTypes = new Set();
    records.forEach(r => {
      const cName = cleanStr(r.contratoOrigen || r.origen);
      if (cName && cName !== 'Eventualidad_Key' && cName !== 'Manual' && cName !== 'Asignación Manual') {
        incomingContractTypes.add(cName);
      }
    });

    const matchedTransmitted = [];
    const nowIso = new Date().toISOString();

    records.forEach((item, rIdx) => {
      const fecha = normalizeDate(item.fechaDespacho || item.fecha);
      const rut = cleanRut(item.rutCond1 || item.rut);
      const nombre = cleanStr(item.nomCond1 || item.nombre);

      // Descartar únicamente filas vacías o inválidas sin RUT ni Nombre
      if (!rut && !nombre) return;

      // Buscar si en esa fecha ese RUT o Nombre fue disponibilizado
      const dayAssignments = transmittedAssignments?.[fecha] || [];
      const hasMatchInDisp = dayAssignments.some(a => {
        const condRut = cleanRut(a.conductor_rut);
        const auxRut = cleanRut(a.auxiliar_rut);
        const condName = cleanStr(a.conductor_name).toUpperCase();
        const auxName = cleanStr(a.auxiliar_name).toUpperCase();

        const matchRut = rut && (condRut === rut || auxRut === rut);
        const matchName = nombre && (condName.includes(nombre.toUpperCase()) || auxName.includes(nombre.toUpperCase()) || nombre.toUpperCase().includes(condName) || nombre.toUpperCase().includes(auxName));
        return matchRut || matchName;
      });

      // Se conserva el viaje en la vista transmitida con todos sus datos y montos intactos
      matchedTransmitted.push({
        ...item,
        id: item.id || `trans-${cleanStr(item.contratoOrigen || item.origen || 'c').toLowerCase()}-${Date.now()}-${rIdx}-${Math.random().toString(36).substr(2, 4)}`,
        fechaDespacho: fecha,
        rutCond1: rut || item.rutCond1 || item.rut,
        nomCond1: item.nomCond1 || item.nombre,
        transmittedAt: nowIso,
        hasMatchInDisp,
        isTransmittedMatch: true
      });
    });

    // Función auxiliar para determinar si un registro antiguo debe ser pisado por el nuevo archivo
    const isRecordFromIncomingContract = (item) => {
      const origin = cleanStr(item.contratoOrigen || item.origen);
      const glosa = cleanStr(item.glosa);
      // Los registros manuales de la plataforma ("Eventualidad_Key") SIEMPRE se conservan intactos
      if (
        item.isManuallyAssigned ||
        origin === 'Eventualidad_Key' ||
        glosa === 'Eventualidad_Key' ||
        origin === 'Manual' ||
        origin === 'Asignación Manual'
      ) {
        return false;
      }

      for (const inc of incomingContractTypes) {
        const oLower = origin.toLowerCase();
        const incLower = inc.toLowerCase();
        if (oLower === incLower) return true;
        if (incLower.includes('colectivo') && oLower.includes('colectivo')) return true;
        if (incLower.includes('8') && oLower.includes('8')) return true;
        if (incLower.includes('9') && oLower.includes('9')) return true;
        if (incLower.includes('13') && oLower.includes('13')) return true;
      }
      return false;
    };

    // 1. Actualizar lista de viajes transmitidos:
    // Pisar los registros anteriores del contrato subido, conservando otros contratos y TODOS los de Eventualidad_Key
    const currentTrans = get().transmittedTripsList || [];
    const preservedTrans = currentTrans.filter(t => !isRecordFromIncomingContract(t));
    const updatedTrans = [...matchedTransmitted, ...preservedTrans];

    // 2. Actualizar lista maestra (conserva totales generales pero actualiza el contrato cargado)
    const currentMaster = get().paymentsList || [];
    const preservedMaster = currentMaster.filter(m => !isRecordFromIncomingContract(m));
    const updatedMaster = [...records, ...preservedMaster];

    // 3. Actualizar fechas de última carga por contrato
    const nowFormatted = formatChileanDateTime(new Date());
    const updatedDates = { ...(get().contractUploadDates || {}) };

    for (const inc of incomingContractTypes) {
      const incLower = inc.toLowerCase();
      if (incLower.includes('colectivo')) {
        updatedDates.colectivo = nowFormatted;
      } else if (incLower.includes('8')) {
        updatedDates.contrato8 = nowFormatted;
      } else if (incLower.includes('9')) {
        updatedDates.contrato9 = nowFormatted;
      } else if (incLower.includes('13')) {
        updatedDates.contrato13 = nowFormatted;
      }
    }

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);
    await get().saveContractUploadDates(updatedDates);

    await get().logChange({
      action: 'TRANSMISION',
      details: `Transmitidos y conciliados ${matchedTransmitted.length} viajes a la plataforma (${records.length} registros cargados). Contratos actualizados: ${Array.from(incomingContractTypes).join(', ') || 'General'}`
    });

    set({ isLoading: false });

    return {
      totalLoaded: records.length,
      totalTransmitted: matchedTransmitted.length,
      filteredOut: records.length - matchedTransmitted.length
    };
  },

  // Asignar nuevo viaje manual en la vista Excel transmitida
  // Registra glosa "Eventualidad_Key", se ordena por fecha cronológicamente y se destaca en amarillo pastel
  addTransmittedTrip: async (newTrip, user = '') => {
    if (!newTrip) return false;
    const currentTrans = get().transmittedTripsList || [];
    const currentMaster = get().paymentsList || [];

    const tripEntry = {
      ...newTrip,
      id: newTrip.id || `trans-manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      contratoOrigen: 'Eventualidad_Key',
      glosa: 'Eventualidad_Key',
      origen: 'Manual',
      isManuallyAssigned: true, // Activa el resaltado amarillo pastel
      createdAt: new Date().toISOString()
    };

    const updatedTrans = [tripEntry, ...currentTrans];
    const updatedMaster = [tripEntry, ...currentMaster];

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);

    await get().logChange({
      action: 'CREACION',
      details: `Asignado nuevo viaje manual (Eventualidad_Key) a ${tripEntry.nomCond1 || tripEntry.nombre || 'Personal'} (${tripEntry.rutCond1 || tripEntry.rut || 'S/R'}), Fecha: ${tripEntry.fechaDespacho || tripEntry.fecha || 'S/F'}, Ruta: ${tripEntry.rutas || tripEntry.ruta || 'S/R'}, Monto: $${Number(tripEntry.total || 0).toLocaleString('es-CL')}`,
      record: tripEntry,
      user
    });

    return tripEntry;
  },

  // Actualizar un viaje transmitido (sincronizado en ambas listas y registrado en histórico)
  updateTransmittedTrip: async (id, updates, user = '') => {
    const currentTrans = get().transmittedTripsList || [];
    const currentMaster = get().paymentsList || [];
    const prevItem = currentTrans.find(item => item.id === id) || currentMaster.find(item => item.id === id);

    const updatedTrans = currentTrans.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );
    const updatedMaster = currentMaster.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    );

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);

    if (prevItem) {
      await get().logChange({
        action: 'EDICION',
        details: `Actualizado viaje de ${prevItem.nomCond1 || prevItem.nombre || 'Personal'} (${prevItem.rutCond1 || prevItem.rut || 'S/R'}): Monto anterior $${Number(prevItem.total || 0).toLocaleString('es-CL')} ➔ Nuevo monto $${Number(updates.total !== undefined ? updates.total : prevItem.total).toLocaleString('es-CL')}`,
        record: { ...prevItem, ...updates },
        user
      });
    }

    toast.success('Viaje actualizado correctamente en todas las vistas');
    return true;
  },

  // Eliminar un viaje: SE ELIMINA DE TODAS LAS VISTAS (operacional y maestra) y se registra en histórico
  deleteTransmittedTrip: async (id, user = '') => {
    const currentTrans = get().transmittedTripsList || [];
    const currentMaster = get().paymentsList || [];
    const targetItem = currentTrans.find(item => item.id === id) || currentMaster.find(item => item.id === id);

    const updatedTrans = currentTrans.filter(item => item.id !== id);
    const updatedMaster = currentMaster.filter(item => item.id !== id);

    await get().saveTransmittedTripsToDb(updatedTrans);
    await get().savePaymentsToDb(updatedMaster);

    if (targetItem) {
      await get().logChange({
        action: 'ELIMINACION',
        details: `Eliminado viaje de ${targetItem.nomCond1 || targetItem.nombre || 'Personal'} (${targetItem.rutCond1 || targetItem.rut || 'S/R'}), Fecha: ${targetItem.fechaDespacho || targetItem.fecha || 'S/F'}, Ruta: ${targetItem.rutas || targetItem.ruta || 'S/R'}, Monto: $${Number(targetItem.total || 0).toLocaleString('es-CL')}, Contrato: ${targetItem.glosa || targetItem.contratoOrigen || targetItem.origen || 'S/C'}`,
        record: targetItem,
        user
      });
    }

    toast.success('Viaje eliminado de todas las vistas y respaldado en el histórico');
    return true;
  },

  // Actualizar un pago existente en la lista maestra (sincronizado)
  updatePayment: async (id, updates, user = '') => {
    return get().updateTransmittedTrip(id, updates, user);
  },

  // Eliminar un pago de la lista maestra: SE ELIMINA DE TODAS LAS VISTAS
  deletePayment: async (id, user = '') => {
    return get().deleteTransmittedTrip(id, user);
  },

  // Limpiar histórico de cambios (solo por acción explícita)
  clearChangeHistory: async () => {
    await get().saveHistoryToDb([]);
    toast.info('Histórico de cambios vaciado.');
    return true;
  },

  // Limpiar todos los registros
  clearAllPayments: async () => {
    await get().savePaymentsToDb([]);
    await get().saveTransmittedTripsToDb([]);
    toast.info('Se han limpiado todos los registros de pago y transmisión');
    return true;
  }
}));
