import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { matchVehicleByCode, normalizeVehicleCode } from '../lib/vehicleMatcher';

export const isValidVehicleKey = (k) => {
  if (!k) return false;
  const s = String(k).trim();
  if (s.length < 3) return false;
  const upper = s.toUpperCase();
  if (upper === 'S/N' || upper === 'N/A' || upper === 'SIN PATENTE' || upper === 'NULL' || upper === 'UNDEFINED' || upper === '---' || upper === '...') return false;
  return true;
};

// Helper de timeout estricto para evitar bloqueos por latencia de red
export const withTimeout = (promise, ms = 15000) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout de conexión (${ms}ms)`)), ms);
  });
  return Promise.race([
    Promise.resolve(promise),
    timeoutPromise
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

// Persistencia local para el listado completo de flota (Fallback offline y carga instantánea)
const loadPersistedFleetList = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_cache_v1');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const persistFleetList = (list) => {
  try {
    if (Array.isArray(list) && list.length > 0) {
      localStorage.setItem('keylogistics_fleet_cache_v1', JSON.stringify(list));
    }
  } catch (e) {
    console.error('Error persisting fleet cache:', e);
  }
};

// Persistencia local para Lavados y Certificaciones de Flota
const loadPersistedFleetWashes = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_washes');
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    const cleaned = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidVehicleKey(k) || (k && k.length > 20)) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch (e) {
    return {};
  }
};

const persistFleetWashes = (map) => {
  try {
    localStorage.setItem('keylogistics_fleet_washes', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting fleet washes:', e);
  }
};

// Persistencia local para actualizaciones de columnas de flota
const loadPersistedFleetOverrides = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_overrides');
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    const cleaned = {};
    let needsResave = false;
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidVehicleKey(k) || (k && k.length > 20)) {
        const item = { ...v };
        // Si empresa_externa es un estado operativo (ej. Baja, En Taller, Por documentación), limpiarlo
        if (item.empresa_externa && isOperationalFleetStatus(item.empresa_externa)) {
          item.empresa_externa = '';
          if (item.tipo_flota === 'Externa') {
            item.tipo_flota = 'Propia';
          }
          needsResave = true;
        }
        cleaned[k] = item;
      }
    }
    if (needsResave) {
      persistFleetOverrides(cleaned);
    }
    return cleaned;
  } catch (e) {
    return {};
  }
};

const persistFleetOverrides = (map) => {
  try {
    localStorage.setItem('keylogistics_fleet_overrides', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting fleet overrides:', e);
  }
};

// Estados estándar de operación de flota (Flota Propia)
export const STANDARD_FLEET_STATUSES = [
  'activo', 'inactivo', 'disponible', 'taller', 'en taller', 
  'mantención', 'mantencion', 'baja', 'de baja', 'dado de baja', 
  'desactivado', 'por documentación', 'por documentacion', 
  'en pana', 'siniestro', 'reserva'
];

// Columnas reales existentes en la tabla 'fleet' de Supabase
export const VALID_FLEET_DB_COLUMNS = [
  'type', 'plate', 'internal_number', 'brand', 'model', 'year', 'status',
  'frio', 'engine_number', 'chassis_number', 'cc', 'tank_capacity', 'payload',
  'state2', 'rt_date', 'gases_date', 'pc_date', 'soap_date', 'carnes_date',
  'resolution', 'type2', 'side_doors', 'gps', 'operation', 'insurer', 'region',
  'tct', 'tct_copy', 'neo_tac', 'pallet_capacity', 'ultima_certificacion',
  'fecha_ultimo_lavado', 'tipo_flota', 'empresa_externa'
];

const FLEET_DATE_DB_COLUMNS = new Set(['rt_date', 'gases_date', 'pc_date', 'soap_date', 'carnes_date']);

export const pickValidFleetDbColumns = (obj) => {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  VALID_FLEET_DB_COLUMNS.forEach(col => {
    if (Object.prototype.hasOwnProperty.call(obj, col) && obj[col] !== undefined) {
      let val = obj[col];
      if (typeof val === 'string') {
        val = val.trim();
        if (val === '' || val === 'NaN' || val === 'null' || val === 'undefined' || val === '-') {
          val = null;
        }
      }
      if (FLEET_DATE_DB_COLUMNS.has(col) && val) {
        const str = String(val).trim();
        const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) {
          val = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
      }
      result[col] = val;
    }
  });
  return result;
};

// Persistencia en nube (Supabase planning_assignments) para metadatos extendidos de flota (ej: taller, deshielo)
const FLEET_EXTENDED_META_KEY = '__fleet_extended_meta__';

const loadLocalExtendedMeta = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_extended_meta');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const saveLocalExtendedMeta = (map) => {
  try {
    localStorage.setItem('keylogistics_fleet_extended_meta', JSON.stringify(map || {}));
  } catch (e) {}
};

export const fetchFleetExtendedMetaFromDb = async () => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('planning_assignments')
        .select('assignments')
        .eq('fecha', FLEET_EXTENDED_META_KEY)
        .maybeSingle(),
      3500
    );
    if (error || !data || !data.assignments || typeof data.assignments !== 'object') {
      return loadLocalExtendedMeta();
    }
    const merged = { ...loadLocalExtendedMeta(), ...data.assignments };
    saveLocalExtendedMeta(merged);
    return merged;
  } catch (e) {
    return loadLocalExtendedMeta();
  }
};

export const persistFleetExtendedMetaToDb = async (metaMap) => {
  saveLocalExtendedMeta(metaMap);
  try {
    await withTimeout(
      supabase
        .from('planning_assignments')
        .upsert({
          fecha: FLEET_EXTENDED_META_KEY,
          assignments: metaMap,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' }),
      4000
    );
  } catch (e) {
    console.warn('Error sincronizando metadatos extendidos de flota:', e);
  }
};

export const isOperationalFleetStatus = (val) => {
  if (!val) return false;
  const lower = String(val).trim().toLowerCase();
  return STANDARD_FLEET_STATUSES.includes(lower);
};

export const isVehicleBaja = (f) => {
  if (!f) return false;
  const st = String(f.status || '').trim().toLowerCase();
  const st2 = String(f.state2 || '').trim().toLowerCase();
  return st === 'baja' || st === 'de baja' || st === 'dado de baja' || st.includes('baja') ||
         st2 === 'baja' || st2 === 'de baja' || st2.includes('baja');
};

export const isVehicleEnTaller = (f) => {
  if (!f) return false;
  const st = String(f.status || '').trim().toLowerCase();
  return st === 'en taller' || st === 'taller';
};

export const computeEntryDateFromDays = (days) => {
  const num = Math.max(0, Math.floor(Number(days) || 0));
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - num);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getVehicleTallerDays = (f) => {
  if (!isVehicleEnTaller(f)) return null;
  if (f.fecha_ingreso_taller) {
    const cleanStr = String(f.fecha_ingreso_taller).trim().split(' ')[0].split('T')[0];
    const parts = cleanStr.split(/[-/]/);
    let entryDate = null;
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        entryDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        entryDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
    } else {
      entryDate = new Date(cleanStr);
    }
    if (entryDate && !isNaN(entryDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      entryDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - entryDate) / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    }
  }
  if (f.dias_taller !== undefined && f.dias_taller !== null && f.dias_taller !== '') {
    const num = Number(f.dias_taller);
    if (!isNaN(num) && num >= 0) return Math.floor(num);
  }
  return 0;
};

// Semáforo de taller:
// 0 a 4 días: green (Verde)
// 5 a 11 días: yellow (Amarillo)
// >= 12 días: red (Rojo)
export const getVehicleTallerStatus = (days) => {
  if (days === null || days === undefined) return 'N/A';
  if (days >= 12) return 'red';
  if (days >= 5) return 'yellow';
  return 'green';
};

export const inferTipoFlota = (f, overrideInfo = {}) => {
  // Prioridad 1: Override local explícito
  if (overrideInfo?.tipo_flota === 'Externa') return 'Externa';
  if (overrideInfo?.tipo_flota === 'Propia') return 'Propia';

  // Prioridad 2: Valor en registro / Supabase
  if (f?.tipo_flota === 'Externa') return 'Externa';
  if (f?.tipo_flota === 'Propia') return 'Propia';

  // Si empresa_externa es válida y no es un estado operativo (ej. Baja, En Taller), es Externa
  const overrideEmpresa = (overrideInfo?.empresa_externa || '').trim();
  const fEmpresa = (f?.empresa_externa || '').trim();
  if (overrideEmpresa && !isOperationalFleetStatus(overrideEmpresa)) return 'Externa';
  if (fEmpresa && !isOperationalFleetStatus(fEmpresa)) return 'Externa';
  
  const st = (f?.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_') || stLower.includes('externo') || stLower.startsWith('transportes')) {
    return 'Externa';
  }

  // Si el estado es un estado operativo estándar de flota propia, es Propia
  if (isOperationalFleetStatus(st)) {
    return 'Propia';
  }

  if (st && !STANDARD_FLEET_STATUSES.includes(stLower)) {
    return 'Externa';
  }
  return 'Propia';
};

export const inferEmpresaExterna = (f, overrideInfo = {}) => {
  if (overrideInfo?.tipo_flota === 'Propia' || (f?.tipo_flota === 'Propia' && !overrideInfo?.tipo_flota)) {
    return '';
  }

  const overrideEmpresa = (overrideInfo?.empresa_externa || '').trim();
  if (overrideEmpresa && !isOperationalFleetStatus(overrideEmpresa)) {
    return overrideEmpresa;
  }
  
  const fEmpresa = (f?.empresa_externa || '').trim();
  if (fEmpresa && !isOperationalFleetStatus(fEmpresa)) {
    return fEmpresa;
  }
  
  const st = (f?.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_')) {
    return st.replace(/^externo_/i, '').trim();
  }
  if (st && !isOperationalFleetStatus(st) && !STANDARD_FLEET_STATUSES.includes(stLower)) {
    return st;
  }
  return '';
};

export const isVehicleExternal = (f) => {
  if (!f) return false;
  if (f.tipo_flota === 'Externa') return true;
  if (f.tipo_flota === 'Propia') return false;

  const emp = (f.empresa_externa || '').trim();
  if (emp && !isOperationalFleetStatus(emp)) return true;

  const st = (f.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_') || stLower.includes('externo') || stLower.startsWith('transportes')) {
    return true;
  }

  // Si es un estado operativo (Baja, En Taller, Por documentación, etc.), no es externo
  if (isOperationalFleetStatus(st)) {
    return false;
  }

  if (st && !STANDARD_FLEET_STATUSES.includes(stLower)) {
    return true;
  }
  return false;
};

export const useFleetStore = create((set, get) => ({
  fleetList: loadPersistedFleetList(),
  isLoading: false,

  fetchFleet: async (retryCount = 0) => {
    // Si no hay datos previos, marcar carga inicial
    if (get().fleetList.length === 0) {
      set({ isLoading: true });
    }
    try {
      const [fleetRes, extendedMetaMap] = await Promise.all([
        withTimeout(
          supabase
            .from('fleet')
            .select('*')
            .order('plate'),
          4000
        ),
        fetchFleetExtendedMetaFromDb()
      ]);

      const { data, error } = fleetRes;
      
      if (error) throw error;
      if (!data || data.length === 0) {
        if (get().fleetList.length > 0) return get().fleetList;
      }

      const washesMap = loadPersistedFleetWashes();
      const overridesMap = loadPersistedFleetOverrides();
      const isAlreadyHealed = localStorage.getItem('keylogistics_fleet_overrides_healed_v2') === 'true';
      const pendingHealDbUpdates = [];
      let metaNeedsSave = false;

      const enriched = (data || []).map(f => {
        const intKey = f.internal_number ? String(f.internal_number).trim() : null;
        const normIntKey = f.internal_number ? normalizeVehicleCode(f.internal_number) : null;
        const plateKey = f.plate ? String(f.plate).trim().toUpperCase() : null;
        const normPlateKey = f.plate ? normalizeVehicleCode(f.plate) : null;
        const idKey = f.id ? String(f.id) : null;

        const washInfo = (isValidVehicleKey(intKey) && washesMap[intKey]) || 
                         (isValidVehicleKey(normIntKey) && washesMap[normIntKey]) ||
                         (isValidVehicleKey(plateKey) && washesMap[plateKey]) || 
                         (isValidVehicleKey(normPlateKey) && washesMap[normPlateKey]) ||
                         (idKey && washesMap[idKey]) || {};

        const rawOverride = (idKey && overridesMap[idKey]) || 
                            (isValidVehicleKey(intKey) && overridesMap[intKey]) || 
                            (isValidVehicleKey(normIntKey) && overridesMap[normIntKey]) || 
                            (isValidVehicleKey(plateKey) && overridesMap[plateKey]) || 
                            (isValidVehicleKey(normPlateKey) && overridesMap[normPlateKey]) || {};

        const extMeta = (idKey && extendedMetaMap[idKey]) ||
                        (isValidVehicleKey(intKey) && extendedMetaMap[intKey]) ||
                        (isValidVehicleKey(normIntKey) && extendedMetaMap[normIntKey]) ||
                        (isValidVehicleKey(plateKey) && extendedMetaMap[plateKey]) ||
                        (isValidVehicleKey(normPlateKey) && extendedMetaMap[normPlateKey]) || {};

        // Si este computador tenía cambios de fechas documentales en overridesMap que fallaron al subir a Supabase
        // por la columna 'fecha_deshielo' (ej. modificación de RT en C250), sincronizarlos una única vez hacia Supabase.
        let healedFields = {};
        if (!isAlreadyHealed && rawOverride && Object.prototype.hasOwnProperty.call(rawOverride, 'fecha_deshielo') && f.id) {
          const docColsToHeal = ['rt_date', 'gases_date', 'pc_date', 'soap_date', 'carnes_date', 'resolution'];
          const candidateDb = pickValidFleetDbColumns(rawOverride);
          const diffPayload = {};
          docColsToHeal.forEach((col) => {
            const val = candidateDb[col];
            if (val !== null && val !== undefined && val !== f[col]) {
              diffPayload[col] = val;
            }
          });
          if (Object.keys(diffPayload).length > 0) {
            healedFields = diffPayload;
            pendingHealDbUpdates.push({ id: f.id, payload: diffPayload });
          }
        }

        const mergedDbRow = { ...f, ...healedFields };

        const tipo = inferTipoFlota(mergedDbRow, rawOverride);
        const empresa = inferEmpresaExterna(mergedDbRow, rawOverride);

        const resolvedDeshielo = extMeta.fecha_deshielo || washInfo.fecha_deshielo || rawOverride.fecha_deshielo || null;
        let resolvedFechaTaller = extMeta.fecha_ingreso_taller || rawOverride.fecha_ingreso_taller || null;
        let resolvedDiasTaller = extMeta.dias_taller !== undefined ? extMeta.dias_taller : (rawOverride.dias_taller !== undefined ? rawOverride.dias_taller : null);

        if (isVehicleEnTaller(mergedDbRow)) {
          if (!resolvedFechaTaller && resolvedDiasTaller !== null && resolvedDiasTaller !== '') {
            resolvedFechaTaller = computeEntryDateFromDays(resolvedDiasTaller);
          }
        } else {
          resolvedFechaTaller = null;
          resolvedDiasTaller = null;
        }

        const vehicleObj = {
          ...mergedDbRow,
          id: f.id,
          type: mergedDbRow.type || rawOverride.type || 'Camión',
          internal_number: mergedDbRow.internal_number || rawOverride.internal_number || '',
          plate: mergedDbRow.plate || rawOverride.plate || '',
          brand: mergedDbRow.brand || rawOverride.brand || '',
          tipo_flota: tipo,
          empresa_externa: empresa,
          ultima_certificacion: mergedDbRow.ultima_certificacion || washInfo.ultima_certificacion || null,
          fecha_ultimo_lavado: mergedDbRow.fecha_ultimo_lavado || washInfo.fecha_ultimo_lavado || null,
          fecha_deshielo: resolvedDeshielo,
          fecha_ingreso_taller: resolvedFechaTaller,
          dias_taller: resolvedDiasTaller
        };
        vehicleObj.dias_taller = getVehicleTallerDays(vehicleObj);
        vehicleObj.tallerStatus = getVehicleTallerStatus(vehicleObj.dias_taller);

        if (resolvedDeshielo && !extMeta.fecha_deshielo && idKey) {
          extendedMetaMap[idKey] = { ...(extendedMetaMap[idKey] || {}), fecha_deshielo: resolvedDeshielo };
          metaNeedsSave = true;
        }

        return vehicleObj;
      });

      // Si había actualizaciones locales pendientes de sincronizar por el bug anterior, subirlas a Supabase
      if (!isAlreadyHealed) {
        if (pendingHealDbUpdates.length > 0) {
          for (const item of pendingHealDbUpdates) {
            try {
              await supabase.from('fleet').update(item.payload).eq('id', item.id);
            } catch (e) {
              console.warn('Error sincronizando cambio local pendiente a Supabase:', e);
            }
          }
        }
        // Limpiar columnas de BD de overridesMap para que Supabase sea siempre la fuente de verdad en todos los computadores
        const cleanedOverrides = {};
        Object.entries(overridesMap).forEach(([k, v]) => {
          if (v && typeof v === 'object') {
            cleanedOverrides[k] = {
              ...(v.tipo_flota ? { tipo_flota: v.tipo_flota } : {}),
              ...(v.empresa_externa ? { empresa_externa: v.empresa_externa } : {}),
              ...(v.fecha_deshielo ? { fecha_deshielo: v.fecha_deshielo } : {}),
              ...(v.fecha_ingreso_taller ? { fecha_ingreso_taller: v.fecha_ingreso_taller } : {}),
              ...(v.dias_taller !== undefined ? { dias_taller: v.dias_taller } : {})
            };
          }
        });
        persistFleetOverrides(cleanedOverrides);
        try {
          localStorage.setItem('keylogistics_fleet_overrides_healed_v2', 'true');
        } catch (e) {}
      }

      if (metaNeedsSave) {
        persistFleetExtendedMetaToDb(extendedMetaMap);
      }

      // Auto-sincronizar hacia Supabase si en este equipo hay datos locales de lavados/certificaciones
      const missingWashesInDb = (data || []).filter(f => {
        const intKey = f.internal_number ? String(f.internal_number).trim() : null;
        const normIntKey = f.internal_number ? normalizeVehicleCode(f.internal_number) : null;
        const plateKey = f.plate ? String(f.plate).trim().toUpperCase() : null;
        const normPlateKey = f.plate ? normalizeVehicleCode(f.plate) : null;
        const idKey = f.id ? String(f.id) : null;

        const washInfo = (intKey && washesMap[intKey]) || 
                         (normIntKey && washesMap[normIntKey]) ||
                         (plateKey && washesMap[plateKey]) || 
                         (normPlateKey && washesMap[normPlateKey]) ||
                         (idKey && washesMap[idKey]) || {};

        const hasLocalCert = washInfo.ultima_certificacion && !f.ultima_certificacion;
        const hasLocalWash = washInfo.fecha_ultimo_lavado && !f.fecha_ultimo_lavado;
        return hasLocalCert || hasLocalWash;
      });

      if (missingWashesInDb.length > 0) {
        setTimeout(async () => {
          for (const item of missingWashesInDb) {
            const intKey = item.internal_number ? String(item.internal_number).trim() : null;
            const normIntKey = item.internal_number ? normalizeVehicleCode(item.internal_number) : null;
            const plateKey = item.plate ? String(item.plate).trim().toUpperCase() : null;
            const normPlateKey = item.plate ? normalizeVehicleCode(item.plate) : null;
            const idKey = item.id ? String(item.id) : null;

            const washInfo = (intKey && washesMap[intKey]) || 
                             (normIntKey && washesMap[normIntKey]) ||
                             (plateKey && washesMap[plateKey]) || 
                             (normPlateKey && washesMap[normPlateKey]) ||
                             (idKey && washesMap[idKey]) || {};

            const payload = {};
            if (washInfo.ultima_certificacion && !item.ultima_certificacion) {
              payload.ultima_certificacion = washInfo.ultima_certificacion;
            }
            if (washInfo.fecha_ultimo_lavado && !item.fecha_ultimo_lavado) {
              payload.fecha_ultimo_lavado = washInfo.fecha_ultimo_lavado;
            }

            if (Object.keys(payload).length > 0) {
              try {
                await supabase.from('fleet').update(payload).eq('id', item.id);
              } catch (e) {
                break;
              }
            }
          }
        }, 1000);
      }

      // Persistir cache para acceso instantáneo
      persistFleetList(enriched);
      set({ fleetList: enriched, isLoading: false });
      return enriched;
    } catch (err) {
      console.warn(`[FleetStore] Sincronización en segundo plano de flota (intento ${retryCount + 1}):`, err?.message || err);
      // Reintentar silenciosamente en segundo plano con backoff gradual sin mostrar alertas invasivas al usuario
      if (retryCount < 8) {
        const delays = [2000, 4000, 6000, 10000, 15000, 20000, 30000, 60000];
        const delay = delays[retryCount] || 15000;
        setTimeout(() => {
          get().fetchFleet(retryCount + 1);
        }, delay);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  addFleet: async (fleetData) => {
    set({ isLoading: true });
    const tipoFlota = fleetData.tipo_flota || (fleetData.empresa_externa ? 'Externa' : 'Propia');
    const empresaExterna = fleetData.empresa_externa || '';
    let statusVal = fleetData.status || 'Activo';
    if (tipoFlota === 'Externa' && (!statusVal || statusVal === 'Activo')) {
      statusVal = empresaExterna ? `Externo_${empresaExterna.trim()}` : 'Externo';
    }
    const finalPayload = {
      ...fleetData,
      status: statusVal,
      tipo_flota: tipoFlota,
      empresa_externa: empresaExterna
    };
    try {
      let insertedRow = null;
      try {
        const { data, error } = await supabase
          .from('fleet')
          .insert([finalPayload])
          .select();

        if (error) {
          if (error.code === '23505') {
            toast.error('Esta patente ya está registrada');
            return false;
          }
          throw error;
        }
        insertedRow = data ? data[0] : null;
      } catch (insertErr) {
        // Fallback si tipo_flota o empresa_externa no existen como columnas en Supabase
        const { tipo_flota, empresa_externa, ...rest } = finalPayload;
        const { data, error } = await supabase
          .from('fleet')
          .insert([rest])
          .select();

        if (error) {
          if (error.code === '23505') {
            toast.error('Esta patente ya está registrada');
            return false;
          }
          throw error;
        }
        insertedRow = data ? data[0] : null;
      }

      // Persistir en overridesMap
      const overridesMap = loadPersistedFleetOverrides();
      const keysToMap = [
        fleetData.plate ? String(fleetData.plate).trim().toUpperCase() : null,
        fleetData.internal_number ? String(fleetData.internal_number).trim() : null,
        insertedRow?.id ? String(insertedRow.id) : null,
        insertedRow?.plate ? String(insertedRow.plate).trim().toUpperCase() : null,
        insertedRow?.internal_number ? String(insertedRow.internal_number).trim() : null
      ].filter(k => k && (k.length > 20 || isValidVehicleKey(k)));

      keysToMap.forEach(k => {
        overridesMap[k] = {
          ...(overridesMap[k] || {}),
          tipo_flota: tipoFlota,
          empresa_externa: empresaExterna
        };
        const normK = normalizeVehicleCode(k);
        if (isValidVehicleKey(normK)) {
          overridesMap[normK] = {
            ...(overridesMap[normK] || {}),
            tipo_flota: tipoFlota,
            empresa_externa: empresaExterna
          };
        }
      });
      persistFleetOverrides(overridesMap);
      
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
      const overridesMap = loadPersistedFleetOverrides();

      // Función para validar y corregir fechas (ej. 31 de junio -> 30 de junio)
      const sanitizeDate = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
          const trimmed = val.trim();
          const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
          if (m) {
            const y = parseInt(m[1], 10);
            const mon = parseInt(m[2], 10);
            const d = parseInt(m[3], 10);
            if (mon >= 1 && mon <= 12) {
              const maxD = new Date(y, mon, 0).getDate();
              const validD = Math.min(d, maxD);
              return `${y}-${String(mon).padStart(2, '0')}-${String(validD).padStart(2, '0')}`;
            }
          }
        }
        return val;
      };

      // Deduplicar por Patente (manteniendo la última fila del archivo si se repite)
      const uniqueMap = new Map();
      fleetArray.forEach(f => {
        if (!f || !f.plate) return;
        const plateKey = String(f.plate).trim().toUpperCase();
        uniqueMap.set(plateKey, { ...f, plate: plateKey });

        let tipoFlota = f.tipo_flota || (f.empresa_externa ? 'Externa' : 'Propia');
        let empresa = f.empresa_externa || '';

        // Si el estado viene como "Externo_Valencia", inferir tipo Externa y empresa Valencia
        if (f.status && String(f.status).toLowerCase().startsWith('externo_')) {
          tipoFlota = 'Externa';
          if (!empresa) {
            empresa = String(f.status).replace(/^externo_/i, '').trim();
          }
        } else if (f.status && String(f.status).toLowerCase().startsWith('transportes')) {
          tipoFlota = 'Externa';
          if (!empresa) empresa = String(f.status).trim();
        } else if (tipoFlota === 'Externa' && empresa && (!f.status || f.status === 'Activo')) {
          f.status = `Externo_${empresa.trim()}`;
        }

        const keys = [
          isValidVehicleKey(plateKey) ? plateKey : null,
          isValidVehicleKey(f.internal_number) ? String(f.internal_number).trim() : null
        ].filter(Boolean);

        keys.forEach(k => {
          overridesMap[k] = {
            ...(overridesMap[k] || {}),
            tipo_flota: tipoFlota,
            empresa_externa: empresa
          };
          const normK = normalizeVehicleCode(k);
          if (isValidVehicleKey(normK)) {
            overridesMap[normK] = {
              ...(overridesMap[normK] || {}),
              tipo_flota: tipoFlota,
              empresa_externa: empresa
            };
          }
        });
      });
      persistFleetOverrides(overridesMap);

      const uniqueList = Array.from(uniqueMap.values());
      if (uniqueList.length === 0) {
        toast.error('No se encontraron vehículos válidos para procesar');
        return false;
      }

      // Sanitizar columnas reconocidas en Supabase y validar fechas
      const sanitized = uniqueList.map(f => {
        let statusVal = f.status || 'Activo';
        const tipoFlota = f.tipo_flota || (f.empresa_externa ? 'Externa' : 'Propia');
        const empresa = f.empresa_externa || '';
        if (tipoFlota === 'Externa' && (!statusVal || statusVal === 'Activo' || statusVal === 'Disponible')) {
          statusVal = empresa ? `Externo_${empresa}` : 'Externo';
        }

        return {
          type: String(f.type || 'Camión').trim(),
          plate: String(f.plate).trim().toUpperCase(),
          internal_number: f.internal_number != null ? String(f.internal_number).trim() : 'S/N',
          brand: f.brand ? String(f.brand).trim() : null,
          model: f.model ? String(f.model).trim() : null,
          year: f.year ? String(f.year).trim() : null,
          status: String(statusVal).trim(),
          tipo_flota: tipoFlota,
          empresa_externa: empresa || null,
          frio: f.frio ? String(f.frio).trim() : null,
          engine_number: f.engine_number ? String(f.engine_number).trim() : null,
          chassis_number: f.chassis_number ? String(f.chassis_number).trim() : null,
          cc: f.cc ? String(f.cc).trim() : null,
          tank_capacity: f.tank_capacity ? String(f.tank_capacity).trim() : null,
          payload: f.payload ? String(f.payload).trim() : null,
          state2: f.state2 ? String(f.state2).trim() : null,
          rt_date: sanitizeDate(f.rt_date),
          gases_date: sanitizeDate(f.gases_date),
          pc_date: sanitizeDate(f.pc_date),
          soap_date: sanitizeDate(f.soap_date),
          carnes_date: sanitizeDate(f.carnes_date),
          resolution: f.resolution ? String(f.resolution).trim() : null,
          type2: f.type2 ? String(f.type2).trim() : null,
          side_doors: f.side_doors ? String(f.side_doors).trim() : null,
          gps: f.gps ? String(f.gps).trim() : null,
          operation: f.operation ? String(f.operation).trim() : null,
          insurer: f.insurer ? String(f.insurer).trim() : null,
          region: f.region ? String(f.region).trim() : null,
          tct: f.tct ? String(f.tct).trim() : null,
          tct_copy: f.tct_copy ? String(f.tct_copy).trim() : null,
          neo_tac: f.neo_tac ? String(f.neo_tac).trim() : null,
          pallet_capacity: f.pallet_capacity ? String(f.pallet_capacity).trim() : null
        };
      });

      // Inserción por lotes (chunks) de 50 para máxima estabilidad
      const chunkSize = 50;
      let totalInserted = 0;
      for (let i = 0; i < sanitized.length; i += chunkSize) {
        const chunk = sanitized.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('fleet')
          .upsert(chunk, { onConflict: 'plate' });

        if (error) {
          console.warn('Fallo lote en Supabase, intentando inserción fila por fila...', error);
          for (const item of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from('fleet')
                .upsert([item], { onConflict: 'plate' });
              if (!singleErr) totalInserted++;
            } catch (e) {
              console.error('Error insertando vehículo:', item.plate, e);
            }
          }
        } else {
          totalInserted += chunk.length;
        }
      }
      
      await get().fetchFleet();
      toast.success(`${totalInserted} vehículo(s) procesados correctamente`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Error en la carga masiva');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  updateFleet: async (id, fleetData) => {
    try {
      const overridesMap = loadPersistedFleetOverrides();
      const extendedMetaMap = await fetchFleetExtendedMetaFromDb();
      const current = get().fleetList.find(f => f.id === id);
      const rawPlate = fleetData.plate ? String(fleetData.plate).trim().toUpperCase() : (current?.plate?.toUpperCase());
      const rawInt = fleetData.internal_number ? String(fleetData.internal_number).trim() : current?.internal_number;
      const keys = [
        id ? String(id) : null,
        isValidVehicleKey(rawPlate) ? rawPlate : null,
        isValidVehicleKey(rawInt) ? rawInt : null
      ].filter(Boolean);

      const sanitizedData = {};
      Object.entries(fleetData).forEach(([k, val]) => {
        if (k === 'id' || k === 'created_at' || k === 'updated_at' || k === 'dashboardCategory' || k === 'tallerStatus') return;
        
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed === '' || trimmed === 'NaN' || trimmed === 'null' || trimmed === 'undefined') {
            sanitizedData[k] = null;
          } else {
            sanitizedData[k] = trimmed;
          }
        } else if (val === undefined) {
          sanitizedData[k] = null;
        } else {
          sanitizedData[k] = val;
        }
      });

      // Gestión de fecha/días en taller cuando el estado es "En Taller"
      let nextFechaTaller = sanitizedData.fecha_ingreso_taller !== undefined ? sanitizedData.fecha_ingreso_taller : (current?.fecha_ingreso_taller || null);
      let nextDiasTaller = sanitizedData.dias_taller !== undefined ? sanitizedData.dias_taller : (current?.dias_taller ?? null);

      if (isVehicleEnTaller(sanitizedData)) {
        if (sanitizedData.dias_taller !== undefined && sanitizedData.dias_taller !== null && sanitizedData.dias_taller !== '') {
          nextDiasTaller = Math.max(0, Math.floor(Number(sanitizedData.dias_taller) || 0));
          // Si el usuario modificó días o no había fecha previa, recalcular fecha_ingreso_taller
          if (sanitizedData.fecha_ingreso_taller === current?.fecha_ingreso_taller || !sanitizedData.fecha_ingreso_taller) {
            nextFechaTaller = computeEntryDateFromDays(nextDiasTaller);
          }
        } else if (!nextFechaTaller) {
          nextFechaTaller = computeEntryDateFromDays(0);
          nextDiasTaller = 0;
        }
      } else {
        nextFechaTaller = null;
        nextDiasTaller = null;
      }

      // Ajuste para flota externa vs propia
      let dataToUpdate = { ...sanitizedData };
      if (dataToUpdate.tipo_flota === 'Propia') {
        dataToUpdate.empresa_externa = '';
      } else if (dataToUpdate.tipo_flota === 'Externa' && dataToUpdate.empresa_externa) {
        if (!dataToUpdate.status || dataToUpdate.status === 'Activo') {
          dataToUpdate.status = `Externo_${dataToUpdate.empresa_externa.trim()}`;
        }
      }

      // Guardar en overridesMap local únicamente metadatos no estructurales y tipo/empresa
      const overrideMeta = {
        tipo_flota: dataToUpdate.tipo_flota || current?.tipo_flota || 'Propia',
        empresa_externa: dataToUpdate.empresa_externa || '',
        fecha_ingreso_taller: nextFechaTaller,
        dias_taller: nextDiasTaller,
        ...(sanitizedData.fecha_deshielo !== undefined ? { fecha_deshielo: sanitizedData.fecha_deshielo } : (current?.fecha_deshielo ? { fecha_deshielo: current.fecha_deshielo } : {}))
      };

      keys.forEach(k => {
        overridesMap[k] = { ...overrideMeta };
        extendedMetaMap[k] = {
          ...(extendedMetaMap[k] || {}),
          fecha_ingreso_taller: nextFechaTaller,
          dias_taller: nextDiasTaller,
          ...(sanitizedData.fecha_deshielo !== undefined ? { fecha_deshielo: sanitizedData.fecha_deshielo } : {})
        };
        const normK = normalizeVehicleCode(k);
        if (isValidVehicleKey(normK)) {
          overridesMap[normK] = { ...overrideMeta };
          extendedMetaMap[normK] = {
            ...(extendedMetaMap[normK] || {}),
            fecha_ingreso_taller: nextFechaTaller,
            dias_taller: nextDiasTaller,
            ...(sanitizedData.fecha_deshielo !== undefined ? { fecha_deshielo: sanitizedData.fecha_deshielo } : {})
          };
        }
      });
      persistFleetOverrides(overridesMap);

      // Actualización optimista inmediata en memoria para reflejar el cambio al instante en Gestión Flota y Dashboard Flota
      const optimisticList = get().fleetList.map(f => {
        if (f.id !== id) return f;
        const updated = {
          ...f,
          ...dataToUpdate,
          fecha_ingreso_taller: nextFechaTaller,
          dias_taller: nextDiasTaller
        };
        updated.dias_taller = getVehicleTallerDays(updated);
        updated.tallerStatus = getVehicleTallerStatus(updated.dias_taller);
        return updated;
      });
      persistFleetList(optimisticList);
      set({ fleetList: optimisticList });

      // Filtrar estrictamente solo las columnas válidas de la tabla 'fleet' en Supabase
      // (Evita el error PGRST204 por 'fecha_deshielo' u otros campos calculados que impedían sincronizar entre PCs)
      const validDbPayload = pickValidFleetDbColumns(dataToUpdate);

      try {
        const { error } = await supabase
          .from('fleet')
          .update(validDbPayload)
          .eq('id', id);

        if (error) throw error;
      } catch (subErr) {
        console.warn('Fallo actualización directa en Supabase, intentando con fallback sanitizado...', subErr);
        const { tipo_flota, empresa_externa, ...rest } = validDbPayload;
        const { error } = await supabase
          .from('fleet')
          .update(rest)
          .eq('id', id);

        if (error) {
          console.error('Error en fallback Supabase:', error);
          throw error;
        }
      }

      await persistFleetExtendedMetaToDb(extendedMetaMap);
      
      toast.success('Vehículo actualizado y sincronizado exitosamente');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error('Error al actualizar el vehículo:', err);
      toast.error(err?.message || 'Error al actualizar el vehículo');
      return false;
    }
  },

  updateVehicleTallerInfo: async (id, { fecha_ingreso_taller, dias_taller }) => {
    try {
      const current = get().fleetList.find(f => f.id === id);
      if (!current) return false;

      let resolvedFecha = fecha_ingreso_taller || null;
      let resolvedDias = dias_taller !== undefined && dias_taller !== null && dias_taller !== '' ? Math.max(0, Math.floor(Number(dias_taller) || 0)) : null;

      if (resolvedDias !== null && !fecha_ingreso_taller) {
        resolvedFecha = computeEntryDateFromDays(resolvedDias);
      } else if (resolvedFecha) {
        resolvedDias = getVehicleTallerDays({ status: 'En Taller', fecha_ingreso_taller: resolvedFecha });
      } else {
        resolvedFecha = computeEntryDateFromDays(0);
        resolvedDias = 0;
      }

      const extendedMetaMap = await fetchFleetExtendedMetaFromDb();
      const overridesMap = loadPersistedFleetOverrides();
      const keys = [
        id ? String(id) : null,
        isValidVehicleKey(current.plate) ? String(current.plate).trim().toUpperCase() : null,
        isValidVehicleKey(current.internal_number) ? String(current.internal_number).trim() : null
      ].filter(Boolean);

      keys.forEach(k => {
        extendedMetaMap[k] = {
          ...(extendedMetaMap[k] || {}),
          fecha_ingreso_taller: resolvedFecha,
          dias_taller: resolvedDias
        };
        overridesMap[k] = {
          ...(overridesMap[k] || {}),
          fecha_ingreso_taller: resolvedFecha,
          dias_taller: resolvedDias
        };
        const normK = normalizeVehicleCode(k);
        if (isValidVehicleKey(normK)) {
          extendedMetaMap[normK] = {
            ...(extendedMetaMap[normK] || {}),
            fecha_ingreso_taller: resolvedFecha,
            dias_taller: resolvedDias
          };
          overridesMap[normK] = {
            ...(overridesMap[normK] || {}),
            fecha_ingreso_taller: resolvedFecha,
            dias_taller: resolvedDias
          };
        }
      });

      persistFleetOverrides(overridesMap);
      await persistFleetExtendedMetaToDb(extendedMetaMap);

      set(state => ({
        fleetList: state.fleetList.map(f => {
          if (f.id === id) {
            const updated = { ...f, fecha_ingreso_taller: resolvedFecha, dias_taller: resolvedDias };
            updated.dias_taller = getVehicleTallerDays(updated);
            updated.tallerStatus = getVehicleTallerStatus(updated.dias_taller);
            return updated;
          }
          return f;
        })
      }));

      toast.success('Días en taller actualizados');
      return true;
    } catch (err) {
      console.error('Error actualizando días en taller:', err);
      toast.error('Error al actualizar días en taller');
      return false;
    }
  },

  deleteFleet: async (id) => {
    try {
      const { error } = await supabase
        .from('fleet')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Vehículo eliminado');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar el vehículo');
      return false;
    }
  },

  // 1. CARGA MASIVA POR COLUMNAS (Requisito 1)
  // Actualiza masivamente columnas seleccionadas basándose en la relación con "N° Interno"
  updateFleetBulkColumns: async (updatesArray) => {
    set({ isLoading: true });
    try {
      const overridesMap = loadPersistedFleetOverrides();
      const extendedMetaMap = await fetchFleetExtendedMetaFromDb();
      const currentList = get().fleetList;

      let updatedCount = 0;
      let metaChanged = false;

      for (const updateItem of updatesArray) {
        const { internal_number, ...fieldsToUpdate } = updateItem;
        if (!internal_number) continue;

        const cleanInternal = String(internal_number).trim();
        const existingVehicle = matchVehicleByCode(cleanInternal, '', currentList);

        if (existingVehicle) {
          updatedCount++;
          const hasExtended = fieldsToUpdate.fecha_ingreso_taller !== undefined || 
                              fieldsToUpdate.dias_taller !== undefined || 
                              fieldsToUpdate.fecha_deshielo !== undefined;

          if (hasExtended) {
            metaChanged = true;
            let nextFechaTaller = fieldsToUpdate.fecha_ingreso_taller;
            let nextDiasTaller = fieldsToUpdate.dias_taller;
            if (nextDiasTaller !== undefined && nextDiasTaller !== '' && !nextFechaTaller) {
              nextFechaTaller = computeEntryDateFromDays(nextDiasTaller);
            }
            const extPayload = {
              ...(nextFechaTaller !== undefined ? { fecha_ingreso_taller: nextFechaTaller } : {}),
              ...(nextDiasTaller !== undefined ? { dias_taller: nextDiasTaller } : {}),
              ...(fieldsToUpdate.fecha_deshielo !== undefined ? { fecha_deshielo: fieldsToUpdate.fecha_deshielo } : {})
            };
            [cleanInternal, normalizeVehicleCode(cleanInternal), existingVehicle.internal_number, existingVehicle.id].filter(Boolean).forEach(k => {
              extendedMetaMap[k] = { ...(extendedMetaMap[k] || {}), ...extPayload };
              overridesMap[k] = { ...(overridesMap[k] || {}), ...extPayload };
            });
          }

          // Filtrar estrictamente columnas válidas de la tabla 'fleet' en Supabase
          const validDbFields = pickValidFleetDbColumns(fieldsToUpdate);
          if (Object.keys(validDbFields).length > 0) {
            try {
              const { error } = await supabase
                .from('fleet')
                .update(validDbFields)
                .eq('id', existingVehicle.id);
              if (error) throw error;
            } catch (subErr) {
              console.warn('Fallback al actualizar columna en Supabase:', subErr);
            }
          }
        }
      }

      persistFleetOverrides(overridesMap);
      if (metaChanged) {
        await persistFleetExtendedMetaToDb(extendedMetaMap);
      }
      await get().fetchFleet();
      toast.success(`Carga masiva completada: ${updatedCount} vehículo(s) actualizado(s)`);
      return true;
    } catch (err) {
      console.error('Error en updateFleetBulkColumns:', err);
      toast.error('Error al procesar la carga masiva por columnas');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // 2. ACTUALIZACIÓN DE LAVADOS Y CERTIFICACIONES (Requisito 2 y 3)
  updateFleetWashes: async (washesArray) => {
    set({ isLoading: true });
    try {
      const washesMap = loadPersistedFleetWashes();
      const extendedMetaMap = await fetchFleetExtendedMetaFromDb();
      const currentList = get().fleetList;
      let matchedCount = 0;
      let metaChanged = false;
      const dbUpdates = [];

      washesArray.forEach(w => {
        const key = w.internal_number ? String(w.internal_number).trim() : null;
        const plate = w.plate ? String(w.plate).trim().toUpperCase() : null;

        if (key || plate) {
          const found = matchVehicleByCode(key, plate, currentList);
          const existingKey = key || plate;
          const currentEntry = washesMap[existingKey] || 
                               (key && washesMap[normalizeVehicleCode(key)]) || 
                               (plate && washesMap[normalizeVehicleCode(plate)]) || {};
          
          const newEntry = {
            ...currentEntry,
            ...(w.ultima_certificacion !== undefined ? { ultima_certificacion: w.ultima_certificacion } : {}),
            ...(w.fecha_ultimo_lavado !== undefined ? { fecha_ultimo_lavado: w.fecha_ultimo_lavado } : {}),
            ...(w.fecha_deshielo !== undefined ? { fecha_deshielo: w.fecha_deshielo } : {})
          };

          if (key) {
            washesMap[key] = newEntry;
            washesMap[normalizeVehicleCode(key)] = newEntry;
          }
          if (plate) {
            washesMap[plate] = newEntry;
            washesMap[normalizeVehicleCode(plate)] = newEntry;
          }

          // Vincular también con el vehículo encontrado
          if (found && found.id) {
            washesMap[found.id] = newEntry;
            if (found.internal_number) {
              washesMap[found.internal_number] = newEntry;
              washesMap[normalizeVehicleCode(found.internal_number)] = newEntry;
            }
            if (found.plate) {
              washesMap[found.plate] = newEntry;
              washesMap[normalizeVehicleCode(found.plate)] = newEntry;
            }
            if (w.fecha_deshielo !== undefined) {
              metaChanged = true;
              [found.id, found.internal_number, found.plate].filter(Boolean).forEach(k => {
                extendedMetaMap[k] = { ...(extendedMetaMap[k] || {}), fecha_deshielo: w.fecha_deshielo };
              });
            }
            matchedCount++;

            // Enviar a la tabla 'fleet' solo las columnas que existen en el schema de Supabase
            const payload = {};
            if (w.ultima_certificacion !== undefined) payload.ultima_certificacion = w.ultima_certificacion;
            if (w.fecha_ultimo_lavado !== undefined) payload.fecha_ultimo_lavado = w.fecha_ultimo_lavado;
            if (Object.keys(payload).length > 0) {
              dbUpdates.push({ id: found.id, payload });
            }
          }
        }
      });

      persistFleetWashes(washesMap);
      if (metaChanged) {
        await persistFleetExtendedMetaToDb(extendedMetaMap);
      }

      // Sincronizar en Supabase para que cualquier computador pueda leerlo
      if (dbUpdates.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < dbUpdates.length; i += batchSize) {
          const batch = dbUpdates.slice(i, i + batchSize);
          await Promise.allSettled(batch.map(u => 
            supabase.from('fleet').update(u.payload).eq('id', u.id)
          ));
        }
      }

      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error('Error en updateFleetWashes:', err);
      toast.error('Error al guardar datos de lavados/certificaciones');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // 3. ACTUALIZAR UN SOLO VEHÍCULO MANUALMENTE
  updateSingleFleetWash: async (internalOrId, washData) => {
    try {
      const washesMap = loadPersistedFleetWashes();
      const key = String(internalOrId).trim();
      washesMap[key] = {
        ...(washesMap[key] || {}),
        ...washData
      };
      persistFleetWashes(washesMap);

      const currentList = get().fleetList;
      const found = matchVehicleByCode(key, '', currentList) || currentList.find(f => f.id === key);
      if (found && found.id) {
        if (washData.fecha_deshielo !== undefined) {
          const extendedMetaMap = await fetchFleetExtendedMetaFromDb();
          [found.id, found.internal_number, found.plate].filter(Boolean).forEach(k => {
            extendedMetaMap[k] = { ...(extendedMetaMap[k] || {}), fecha_deshielo: washData.fecha_deshielo };
          });
          await persistFleetExtendedMetaToDb(extendedMetaMap);
        }
        const dbWashPayload = pickValidFleetDbColumns(washData);
        if (Object.keys(dbWashPayload).length > 0) {
          try {
            await supabase
              .from('fleet')
              .update(dbWashPayload)
              .eq('id', found.id);
          } catch (subErr) {
            console.warn('Fallback al actualizar wash en Supabase:', subErr);
          }
        }
      }

      set(state => ({
        fleetList: state.fleetList.map(f => {
          if (String(f.internal_number).trim() === key || String(f.id) === key || (found && f.id === found.id)) {
            return { ...f, ...washData };
          }
          return f;
        })
      }));

      toast.success('Registro de lavado/certificación actualizado');
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar registro');
      return false;
    }
  }
}));
