import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import PRELOADED_EXCEL_ROUTES from '../data/preloadedExcelRoutes.json';
import { findOperationForRoute, getOperacionName } from '../data/operacionesMaster';

// Cache invalidation version for cross-computer synchronization
const CURRENT_STORAGE_VERSION = 'v2026_10_28_prod_sync_v9';
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const savedVer = localStorage.getItem('keylogistics_storage_version');
    if (savedVer !== CURRENT_STORAGE_VERSION) {
      console.warn(`[StorageSync] Storage version mismatch (${savedVer} vs ${CURRENT_STORAGE_VERSION}). Purging stale local cache.`);
      localStorage.removeItem('keylogistics_transmitted_assignments');
      localStorage.removeItem('keylogistics_saved_ruteo');
      localStorage.removeItem('keylogistics_saved_baseline');
      localStorage.removeItem('keylogistics_transformed_routes_v2');
      localStorage.setItem('keylogistics_storage_version', CURRENT_STORAGE_VERSION);
    }
  }
} catch (e) {
  console.warn('[StorageSync] Storage version check error:', e);
}

const PRELOADED_ROUTES_MAP = new Map();
(PRELOADED_EXCEL_ROUTES || []).forEach(r => {
  PRELOADED_ROUTES_MAP.set(String(r.ruta).trim(), r);
});

export const healParadasWithPreloaded = (routeNumber, currentParadas, fecha = '') => {
  // Si ya existen paradas reales (por ejemplo cargadas de Excel o guardadas en BD),
  // NUNCA deben sobrescribirse con las rutas de muestra predeterminadas.
  if (currentParadas && Array.isArray(currentParadas) && currentParadas.length > 0) {
    return currentParadas.map(p => ({
      ...p,
      ambiente: String(p.ambiente || 'S').trim().toUpperCase()
    }));
  }

  // Si no hay paradas pero la fecha no es la fecha demo '14-10-2026', devolver lista vacía o actual
  if (fecha && fecha !== '14-10-2026') {
    return currentParadas || [];
  }

  const cleanRuta = String(routeNumber || '').trim();
  const preloaded = PRELOADED_ROUTES_MAP.get(cleanRuta);

  if (preloaded && preloaded.paradas && preloaded.paradas.length > 0) {
    return JSON.parse(JSON.stringify(preloaded.paradas));
  }

  return (currentParadas || []).map(p => ({
    ...p,
    ambiente: String(p.ambiente || (cleanRuta === '1401' ? 'C' : 'S')).trim().toUpperCase()
  }));
};

// Helper to format/normalize date string to DD-MM-YYYY
export const normalizeDate = (rawDate) => {
  if (!rawDate) return '';
  const str = String(rawDate).trim();

  // Excel serial number as string or number (e.g. 46323 or "46323" -> 28-10-2026)
  if (/^\d{5}(\.\d+)?$/.test(str) || (typeof rawDate === 'number' && rawDate > 30000 && rawDate < 65000)) {
    const num = typeof rawDate === 'number' ? rawDate : parseFloat(str);
    if (!isNaN(num) && num > 30000 && num < 65000) {
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(dateObj.getUTCDate()).padStart(2, '0');
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const year = dateObj.getUTCFullYear();
      return `${day}-${month}-${year}`;
    }
  }

  if (typeof rawDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parts = str.split('T')[0].split(' ')[0].split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) {
      const parts = str.split(' ')[0].split(/[-/]/);
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
    return str;
  }

  if (rawDate instanceof Date) {
    const day = String(rawDate.getDate()).padStart(2, '0');
    const month = String(rawDate.getMonth() + 1).padStart(2, '0');
    const year = rawDate.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return str;
};

// Helper para convertir cualquier formato de fecha a timestamp numérico
export const parseDateStrToTimestamp = (s) => {
  if (!s) return 0;
  const clean = String(s).trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
    } else {
      // DD-MM-YYYY
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
    }
  }
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
};

// Helper para ordenar fechas cronológicamente de más reciente a más antigua
export const sortDatesDescending = (dates) => {
  if (!dates) return [];
  const valid = Array.from(new Set(dates)).filter(d => d && !String(d).startsWith('__') && d !== 'Sin Fecha' && d !== 'null' && d !== 'undefined');
  return valid.sort((a, b) => parseDateStrToTimestamp(b) - parseDateStrToTimestamp(a));
};

// Helper para obtener la fecha más reciente como predeterminada (Requisito: siempre la más reciente como predeterminada)
export const getMostRecentDate = (dates, fallback = '28-10-2026') => {
  const sorted = sortDatesDescending(dates);
  return sorted[0] || fallback;
};

// Paradas de muestra basadas en los datos reales del usuario (Consolidadas por Sec + Ambiente)
const SAMPLE_PARADAS_1401 = [
  { secuencia: 1, ambiente: 'C', destino: '2653 - SBARRO MALL FLORIDA CENTER', direccion: 'AV. DEPARTAMENTAL 555', comuna: 'LA FLORIDA', horaIni: '800', horaFin: '1100', volumen: 0.32, peso: 140, cantCJ: 11 },
  { secuencia: 1, ambiente: 'R', destino: '2653 - SBARRO MALL FLORIDA CENTER', direccion: 'AV. DEPARTAMENTAL 555', comuna: 'LA FLORIDA', horaIni: '800', horaFin: '1100', volumen: 0.025, peso: 5, cantCJ: 5 }
];

const SAMPLE_PARADAS_1611 = [
  { secuencia: 1, ambiente: 'C', destino: 'BRESLER PLAZA SUR 2', direccion: 'AV. PRESIDENTE JORGE ALESSANDR', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1100', volumen: 0.4397, peso: 257.328, cantCJ: 49 },
  { secuencia: 2, ambiente: 'C', destino: 'BRESLER 1 (PASEO SAN BERNARDO)', direccion: 'EYZAGUIRRE 650 LOCAL T 16', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1130', volumen: 0.4017, peso: 229.075, cantCJ: 45 },
  { secuencia: 2, ambiente: 'R', destino: 'BRESLER 2 (PASEO SAN BERNARDO)', direccion: 'EYZAGUIRRE 650 LOCAL P 8', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1130', volumen: 0.514, peso: 219.573, cantCJ: 44 },
  { secuencia: 3, ambiente: 'S', destino: 'SALA DE VENTAS SAN BERNARDO', direccion: 'AV LAS ACACIAS 1100', comuna: 'SAN BERNARDO', horaIni: '1000', horaFin: '1600', volumen: 0.2253, peso: 37.365, cantCJ: 24 },
  { secuencia: 4, ambiente: 'C', destino: 'BRESLER PLAZA TOBALABA', direccion: 'AV CAMILO HENRIQUEZ 3692', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '2000', volumen: 0.6263, peso: 358.275, cantCJ: 72 },
  { secuencia: 5, ambiente: 'C', destino: 'BRESLER PLAZA TOBALABA 2', direccion: 'AV. CAMILO HENRIQUEZ 3692 FC-2', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '1100', volumen: 0.3212, peso: 168.899, cantCJ: 33 },
  { secuencia: 5, ambiente: 'R', destino: 'SAN FRANCISCO PLAZA TOBALABA', direccion: 'AV. CAMILO HENRIQUEZ 3692 C-11', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '1100', volumen: 0.5119, peso: 256.747, cantCJ: 56 }
];

const SAMPLE_PARADAS_1612 = [
  { secuencia: 1, ambiente: 'C', destino: 'PAL MALL SPORT', direccion: 'LAS CONDES 13451 LOCAL AC11', comuna: 'LAS CONDES', horaIni: '800', horaFin: '1000', volumen: 0.2294, peso: 56.104, cantCJ: 36 },
  { secuencia: 2, ambiente: 'C', destino: 'SAN FRANCISCO PLAZA NORTE', direccion: 'AVENIDA AMÉRICA VESPUCIO N° 17', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1100', volumen: 0.6462, peso: 337.407, cantCJ: 74 },
  { secuencia: 2, ambiente: 'R', destino: 'SAN FRANCISCO PLAZA NORTE 2', direccion: 'AVENIDA AMÉRICA VESPUCIO N° 17', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1100', volumen: 0.9739, peso: 465.423, cantCJ: 94 },
  { secuencia: 3, ambiente: 'C', destino: 'BRESLER 1 (PLAZA NORTE)', direccion: 'AMERICO VESPUCIO 1737', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1200', volumen: 0.3253, peso: 191.808, cantCJ: 36 },
  { secuencia: 4, ambiente: 'S', destino: 'PAL PLAZA NORTE', direccion: 'VESPUCIO 1737 LOCAL MP1038', comuna: 'HUECHURABA', horaIni: '800', horaFin: '1330', volumen: 0.4236, peso: 121.462, cantCJ: 63 },
  { secuencia: 5, ambiente: 'R', destino: 'ELR PLAZA NORTE', direccion: 'AV AMERICO VESPUCIO 1737', comuna: 'HUECHURABA', horaIni: '1100', horaFin: '1500', volumen: 0.8076, peso: 254.234, cantCJ: 81 },
  { secuencia: 6, ambiente: 'C', destino: 'CORY PANORAMICO', direccion: 'GUARDIA VIEJA 116 LOCAL 138', comuna: 'PROVIDENCIA', horaIni: '1000', horaFin: '1400', volumen: 0.1604, peso: 38.39, cantCJ: 16 }
];

const DEFAULT_SAMPLE_ASSIGNMENTS = {
  '14-10-2026': [
    {
      id: 'disp-sample-1401',
      fecha: '14-10-2026',
      conductor_name: 'AGUILERA BELTRAN SERGIO',
      conductor_rut: '15.432.890-1',
      aux1_name: '',
      aux1_rut: '',
      aux2_name: '',
      aux2_rut: '',
      camion: 'C288 (GKPT12)',
      tipo_equipo: 'Camión',
      rampla: '',
      n_vuelta: '1',
      tipo_servicio: 'Centralizado',
      ruta: '1401',
      cliente: 'RUTA SBARRO COPEC 01',
      referencia: '',
      locales: 1,
      m3: 0.345,
      peso: 145,
      cantCJ: 16,
      transportista: 'T288',
      paradas: SAMPLE_PARADAS_1401
    },
    {
      id: 'disp-sample-1611',
      fecha: '14-10-2026',
      conductor_name: 'AGUILERA BELTRAN SERGIO',
      conductor_rut: '15.432.890-1',
      aux1_name: '',
      aux1_rut: '',
      aux2_name: '',
      aux2_rut: '',
      camion: 'C288 (GKPT12)',
      tipo_equipo: 'Camión',
      rampla: '',
      n_vuelta: '1',
      tipo_servicio: 'Distribución',
      ruta: '1611',
      cliente: 'RUTA CANTABRIA 02',
      referencia: '',
      locales: 7,
      m3: 3.0401,
      peso: 1527.26,
      cantCJ: 323,
      transportista: 'T306',
      paradas: SAMPLE_PARADAS_1611
    },
    {
      id: 'disp-sample-1612',
      fecha: '14-10-2026',
      conductor_name: 'AGUILERA BELTRAN SERGIO',
      conductor_rut: '15.432.890-1',
      aux1_name: '',
      aux1_rut: '',
      aux2_name: '',
      aux2_rut: '',
      camion: 'C288 (GKPT12)',
      tipo_equipo: 'Camión',
      rampla: '',
      n_vuelta: '2',
      tipo_servicio: 'Distribución',
      ruta: '1612',
      cliente: 'RUTA CANTABRIA 03',
      referencia: '',
      locales: 7,
      m3: 3.5664,
      peso: 1464.83,
      cantCJ: 400,
      transportista: 'T312',
      paradas: SAMPLE_PARADAS_1612
    },
    {
      id: 'disp-sample-3304',
      fecha: '14-10-2026',
      conductor_name: '',
      conductor_rut: '',
      aux1_name: '',
      aux1_rut: '',
      aux2_name: '',
      aux2_rut: '',
      camion: '',
      tipo_equipo: '',
      rampla: '',
      n_vuelta: '1',
      tipo_servicio: 'Distribución',
      ruta: '3304',
      cliente: 'RUTA FAST FOOD -04',
      referencia: '',
      locales: 6,
      m3: 4.41,
      peso: 1085.33,
      cantCJ: 464,
      transportista: 'T300',
      paradas: healParadasWithPreloaded('3304', [])
    }
  ]
};

export const ensureRowTransportista = (row) => {
  if (!row) return 'T300';
  if (row.transportista && String(row.transportista).trim() !== '' && String(row.transportista).trim() !== 'Sin Transportista') {
    return String(row.transportista).trim();
  }
  if (row.paradas && Array.isArray(row.paradas) && row.paradas.length > 0) {
    const pTrans = row.paradas.find(p => p.transportista && String(p.transportista).trim() !== '');
    if (pTrans) return String(pTrans.transportista).trim();
  }
  const ROUTE_TRANSP_MAP = {
    '1401': 'T311',
    '1611': 'T405',
    '1612': 'T405',
    '1613': 'T405',
    '1614': 'T405',
    '1615': 'T405',
    '1616': 'T405',
    '1702': 'T404',
    '1703': 'T404',
    '1704': 'T404',
    '1831': 'T310',
    '1832': 'T310',
    '1833': 'T310',
    '1834': 'T310',
    '1835': 'T310',
    '3304': 'T300'
  };
  const rKey = String(row.ruta || '').trim();
  if (ROUTE_TRANSP_MAP[rKey]) {
    return ROUTE_TRANSP_MAP[rKey];
  }
  if (row.camion) {
    const match = String(row.camion).match(/C(\d+)/i);
    if (match) return `T${match[1]}`;
  }
  return 'T300';
};

export const persistAssignmentsToDb = async (fecha, assignments) => {
  try {
    if (!fecha || !assignments) return;
    await supabase
      .from('planning_assignments')
      .upsert({
        fecha,
        assignments,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha' });
  } catch (e) {
    console.warn('Error guardando asignaciones en Supabase:', e);
  }
};

export const persistRuteoOverridesToDb = async (overrides) => {
  try {
    if (!overrides) return;
    await supabase
      .from('planning_assignments')
      .upsert({
        fecha: '__ruteo_overrides__',
        assignments: overrides,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha' });
  } catch (e) {
    console.warn('Error guardando overrides de ruteo en Supabase:', e);
  }
};

export const persistHistoryToDb = async (historyList) => {
  try {
    if (!historyList) return;
    await supabase
      .from('planning_assignments')
      .upsert({
        fecha: '__saved_history__',
        assignments: historyList,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha' });
  } catch (e) {
    console.warn('Error guardando histórico en Supabase:', e);
  }
};

export const persistChangeHistoryToDb = async (changeList) => {
  try {
    if (!changeList) return;
    await supabase
      .from('planning_assignments')
      .upsert({
        fecha: '__change_history__',
        assignments: changeList,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha' });
  } catch (e) {
    console.warn('Error guardando change history en Supabase:', e);
  }
};

export const fetchPlanningStateFromDb = async () => {
  try {
    const { data, error } = await supabase
      .from('planning_assignments')
      .select('*');
    if (error) {
      console.warn('Error leyendo planning_assignments:', error);
      return null;
    }
    if (data && data.length > 0) {
      const assignmentsMap = {};
      let ruteoOverridesFromDb = null;
      let historyListFromDb = null;
      let changeHistoryListFromDb = null;

      data.forEach(item => {
        if (!item.fecha || !item.assignments) return;

        if (item.fecha === '__ruteo_overrides__') {
          ruteoOverridesFromDb = item.assignments;
        } else if (item.fecha === '__saved_history__') {
          historyListFromDb = item.assignments;
        } else if (item.fecha === '__change_history__') {
          changeHistoryListFromDb = item.assignments;
        } else if (item.fecha.startsWith('__')) {
          // Claves internas (ej: __user_permissions__)
        } else if (Array.isArray(item.assignments)) {
          assignmentsMap[item.fecha] = item.assignments.map(r => ({
            ...r,
            transportista: ensureRowTransportista(r),
            paradas: healParadasWithPreloaded(r.ruta, r.paradas, item.fecha)
          }));
        }
      });

      return {
        assignmentsMap,
        ruteoOverridesFromDb,
        historyListFromDb,
        changeHistoryListFromDb
      };
    }
  } catch (e) {
    console.warn('Error obteniendo estado de planning desde Supabase:', e);
    return null;
  }
  return null;
};

export const fetchAssignmentsFromDb = async () => {
  const state = await fetchPlanningStateFromDb();
  return state?.assignmentsMap || null;
};

const loadPersistedAssignments = () => {
  try {
    const saved = localStorage.getItem('keylogistics_transmitted_assignments');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Object.keys(parsed).length > 0) {
        Object.keys(parsed).forEach(dateKey => {
          parsed[dateKey] = parsed[dateKey].map(r => ({
            ...r,
            transportista: ensureRowTransportista(r),
            paradas: healParadasWithPreloaded(r.ruta, r.paradas, dateKey)
          }));
        });
        return parsed;
      }
    }
    return DEFAULT_SAMPLE_ASSIGNMENTS;
  } catch (e) {
    console.error('Error loading transmitted assignments from localStorage:', e);
    return DEFAULT_SAMPLE_ASSIGNMENTS;
  }
};

const persistAssignments = (data) => {
  try {
    localStorage.setItem('keylogistics_transmitted_assignments', JSON.stringify(data));
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([fecha, rows]) => {
        persistAssignmentsToDb(fecha, rows);
      });
    }
  } catch (e) {
    console.error('Error saving transmitted assignments to localStorage:', e);
  }
};

const loadPersistedSavedRuteo = () => {
  try {
    const saved = localStorage.getItem('keylogistics_saved_ruteo');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(dateKey => {
        parsed[dateKey] = parsed[dateKey].map(r => ({
          ...r,
          transportista: ensureRowTransportista(r),
          paradas: healParadasWithPreloaded(r.ruta, r.paradas, dateKey)
        }));
      });
      return parsed;
    }
    return DEFAULT_SAMPLE_ASSIGNMENTS;
  } catch (e) {
    console.error('Error loading saved ruteo from localStorage:', e);
    return DEFAULT_SAMPLE_ASSIGNMENTS;
  }
};

const persistSavedRuteo = (data) => {
  try {
    localStorage.setItem('keylogistics_saved_ruteo', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving ruteo to localStorage:', e);
  }
};

const loadPersistedSavedBaseline = () => {
  try {
    const saved = localStorage.getItem('keylogistics_saved_baseline');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Object.keys(parsed).length > 0) return parsed;
    }
    return JSON.parse(JSON.stringify(DEFAULT_SAMPLE_ASSIGNMENTS));
  } catch (e) {
    console.error('Error loading saved baseline from localStorage:', e);
    return JSON.parse(JSON.stringify(DEFAULT_SAMPLE_ASSIGNMENTS));
  }
};

const persistSavedBaseline = (data) => {
  try {
    localStorage.setItem('keylogistics_saved_baseline', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving baseline to localStorage:', e);
  }
};

const persistHistory = (data) => {
  try {
    localStorage.setItem('keylogistics_saved_history_list', JSON.stringify(data));
    persistHistoryToDb(data);
  } catch (e) {
    console.error('Error saving history to localStorage:', e);
  }
};

const syncHistoryAndSavedForDate = (state, fecha, updatedRows) => {
  const clonedRows = JSON.parse(JSON.stringify(updatedRows || [])).map(r => ({
    ...r,
    transportista: ensureRowTransportista(r)
  }));
  const updatedSaved = {
    ...(state.savedRuteoByDate || {}),
    [fecha]: clonedRows
  };
  const totalServicios = clonedRows.length;
  const totalM3 = clonedRows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(2);
  const totalLocales = clonedRows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
  const totalPeso = clonedRows.reduce((acc, r) => acc + (parseFloat(r.peso) || 0), 0).toFixed(2);
  const totalCajas = clonedRows.reduce((acc, r) => acc + (parseInt(r.cantCJ, 10) || 0), 0);

  const historyEntry = {
    id: `hist-${fecha}-${Date.now()}`,
    fecha,
    savedAt: new Date().toLocaleString('es-CL'),
    totalServicios,
    totalM3,
    totalLocales,
    totalPeso,
    totalCajas,
    rows: clonedRows
  };

  const filteredHistory = (state.savedHistoryList || []).filter(h => h.fecha !== fecha);
  const updatedHistory = [historyEntry, ...filteredHistory];

  persistSavedRuteo(updatedSaved);
  persistHistory(updatedHistory);

  return {
    savedRuteoByDate: updatedSaved,
    savedHistoryList: updatedHistory
  };
};

const loadPersistedHistory = () => {
  try {
    const saved = localStorage.getItem('keylogistics_saved_history_list');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(h => ({
        ...h,
        rows: (h.rows || []).map(r => ({
          ...r,
          transportista: ensureRowTransportista(r),
          paradas: healParadasWithPreloaded(r.ruta, r.paradas, h.fecha)
        }))
      }));
    }
    return [];
  } catch (e) {
    console.error('Error loading history from localStorage:', e);
    return [];
  }
};

const SAMPLE_CHANGE_HISTORY = [
  {
    id: 'ch-sample-1',
    fechaPlanificacion: '14-10-2026',
    fechaHoraModificacion: '14-10-2026 15:30:12',
    horaAntigua: '14-10-2026 09:15:00',
    horaModificada: '14-10-2026 15:30:12',
    usuario: 'Hernán Soto',
    ruta: '1611',
    destino: 'RUTA CANTABRIA 02',
    conductorAntiguo: 'Sin Asignar',
    conductorModificado: 'AGUILERA BELTRAN SERGIO',
    auxiliarAntiguo: 'Sin Asignar',
    auxiliarModificado: 'ABARCA LEIVA RICARDO ANTONIO',
    camionAntiguo: 'Sin Asignar',
    camionModificado: 'C288 (GKPT12)',
    vueltaAntigua: 'Sin Vuelta',
    vueltaModificada: 'Vuelta 1'
  },
  {
    id: 'ch-sample-2',
    fechaPlanificacion: '14-10-2026',
    fechaHoraModificacion: '14-10-2026 16:10:45',
    horaAntigua: '14-10-2026 15:30:12',
    horaModificada: '14-10-2026 16:10:45',
    usuario: 'Hernán Soto',
    ruta: '1612',
    destino: 'RUTA CANTABRIA 03',
    conductorAntiguo: 'Sin Asignar',
    conductorModificado: 'AGUILERA BELTRAN SERGIO',
    auxiliarAntiguo: 'Sin Asignar',
    auxiliarModificado: 'Sin Asignar',
    camionAntiguo: 'Sin Asignar',
    camionModificado: 'C288 (GKPT12)',
    vueltaAntigua: 'Sin Vuelta',
    vueltaModificada: 'Vuelta 2'
  }
];

export const loadPersistedChangeHistory = () => {
  try {
    const saved = localStorage.getItem('keylogistics_change_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return SAMPLE_CHANGE_HISTORY;
  } catch (e) {
    console.error('Error loading change history from localStorage:', e);
    return SAMPLE_CHANGE_HISTORY;
  }
};

export const persistChangeHistory = (data) => {
  try {
    localStorage.setItem('keylogistics_change_history', JSON.stringify(data));
    persistChangeHistoryToDb(data);
  } catch (e) {
    console.error('Error saving change history to localStorage:', e);
  }
};

export const loadPersistedRuteoOverrides = () => {
  try {
    const saved = localStorage.getItem('keylogistics_ruteo_overrides_v1');
    if (saved) return JSON.parse(saved);
    return {};
  } catch (e) {
    console.error('Error loading ruteo overrides from localStorage:', e);
    return {};
  }
};

export const persistRuteoOverrides = (data) => {
  try {
    localStorage.setItem('keylogistics_ruteo_overrides_v1', JSON.stringify(data));
    persistRuteoOverridesToDb(data);
  } catch (e) {
    console.error('Error saving ruteo overrides to localStorage:', e);
  }
};

const createInitialTransformedRoutes = () => {
  if (PRELOADED_EXCEL_ROUTES && PRELOADED_EXCEL_ROUTES.length > 0) {
    return PRELOADED_EXCEL_ROUTES;
  }
  return [
    {
      id: 'trans-1401-sample',
      ruta: '1401',
      nombreRuta: 'RUTA SBARRO COPEC 01',
      fecha: '14-10-2026',
      transportista: 'T311',
      recuentoDestino: 1,
      sumaVolumen: 0.345,
      sumaPeso: 145,
      sumaCantCJ: 16,
      paradas: SAMPLE_PARADAS_1401.map((p, idx) => ({ ...p, id: `1401-p-${idx}`, transportista: 'T311' })),
      isModified: false,
      isAperturada: false
    },
    {
      id: 'trans-1611-sample',
      ruta: '1611',
      nombreRuta: 'RUTA CANTABRIA 02',
      fecha: '14-10-2026',
      transportista: 'T405',
      recuentoDestino: 7,
      sumaVolumen: 3.0401,
      sumaPeso: 1527.26,
      sumaCantCJ: 323,
      paradas: SAMPLE_PARADAS_1611.map((p, idx) => ({ ...p, id: `1611-p-${idx}`, transportista: 'T405' })),
      isModified: false,
      isAperturada: false
    },
    {
      id: 'trans-1612-sample',
      ruta: '1612',
      nombreRuta: 'RUTA CANTABRIA 03',
      fecha: '14-10-2026',
      transportista: 'T405',
      recuentoDestino: 7,
      sumaVolumen: 3.5664,
      sumaPeso: 1464.83,
      sumaCantCJ: 400,
      paradas: SAMPLE_PARADAS_1612.map((p, idx) => ({ ...p, id: `1612-p-${idx}`, transportista: 'T405' })),
      isModified: false,
      isAperturada: false
    }
  ];
};

export const loadPersistedTransformedRoutes = () => {
  try {
    const saved = localStorage.getItem('keylogistics_transformed_routes_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(r => {
          const paradas = healParadasWithPreloaded(r.ruta, r.paradas, r.fecha);
          const distinctAmbientes = Array.from(new Set(paradas.map(p => p.ambiente))).sort();
          return {
            ...r,
            ambientes: distinctAmbientes.length > 0 ? distinctAmbientes : (r.ambientes || ['S']),
            paradas
          };
        });
      }
    }
    return PRELOADED_EXCEL_ROUTES && PRELOADED_EXCEL_ROUTES.length > 0 
      ? PRELOADED_EXCEL_ROUTES 
      : createInitialTransformedRoutes();
  } catch (e) {
    console.error('Error loading transformed routes from localStorage:', e);
    return createInitialTransformedRoutes();
  }
};

export const persistTransformedRoutes = (data) => {
  try {
    localStorage.setItem('keylogistics_transformed_routes_v2', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving transformed routes to localStorage:', e);
  }
};

const _initialAssignments = loadPersistedAssignments();
const _initialSavedRuteo = loadPersistedSavedRuteo();

export const usePlanningStore = create((set, get) => ({
  // Raw data from Sheet1
  rawRows: [],
  fileName: '',
  uploadDate: null,

  // Transformed dynamic table (Hoja1 / Ruteo)
  transformedRoutes: loadPersistedTransformedRoutes(),
  isTransformed: true,

  // Transmitted data into Disponibilización: { [fecha]: Array<AssignmentRow> }
  transmittedAssignments: _initialAssignments,
  selectedDisponibilizarDate: getMostRecentDate(Object.keys(_initialAssignments || {}), '28-10-2026'),

  // Guardados definitivos de Disponibilización transmitidos a Ruteo: { [fecha]: Array<AssignmentRow> }
  savedRuteoByDate: _initialSavedRuteo,
  // Snapshot base para comparar modificaciones antes de guardar: { [fecha]: Array<AssignmentRow> }
  savedRuteoBaseline: loadPersistedSavedBaseline(),
  selectedRuteoDate: getMostRecentDate(Object.keys(_initialSavedRuteo || {}), '28-10-2026'),

  // Historial de guardados para "Histórico Disponibilización"
  savedHistoryList: loadPersistedHistory(),

  // Historial de cambios y auditoría para "Histórico de cambios" (Requisito 2)
  changeHistoryList: loadPersistedChangeHistory(),

  // Metadatos y modificaciones en el sub-menú Ruteo: { [fecha]: { [tripKey]: { turno, hora_cita, prioridad, destino_prioritario } } }
  ruteoOverrides: loadPersistedRuteoOverrides(),

  // Set Raw Rows imported from Excel Sheet1
  setRawRows: (rows, name = '') => {
    set({
      rawRows: rows,
      fileName: name,
      uploadDate: new Date().toISOString(),
      isTransformed: false,
      transformedRoutes: []
    });
  },

  // Transform raw Sheet1 data into the pivot/dynamic table format (Hoja1)
  transformRawRows: () => {
    const { rawRows } = get();
    if (!rawRows || rawRows.length === 0) {
      toast.error('No hay datos importados para transformar');
      return false;
    }

    try {
      const groups = new Map();

      rawRows.forEach((row, idx) => {
        const rutaRaw = row.Ruta || row.ruta || row['N° Ruta'] || row.RutaId || '';
        const ruta = String(rutaRaw).trim();
        // Requisito 1: Permitir todas las rutas (incluyendo más de 4 dígitos o que partan con 0)
        if (!ruta) return;

        const nombreRuta = String(row['Nombre Ruta'] || row.nombre_ruta || row.NombreRuta || row.Cliente || '').trim();
        const destino = String(row.Destino || row.destino || '').trim();
        const direccion = String(row.Direccion || row.Dirección || row.direccion || '').trim();
        const comuna = String(row.Comuna || row.comuna || '').trim();
        const fechaRaw = row.Fecha || row.fecha || '';
        const fecha = normalizeDate(fechaRaw);

        const volumen = parseFloat(String(row.Volumen || row.volumen || 0).replace(',', '.')) || 0;
        const peso = parseFloat(String(row.Peso || row.peso || 0).replace(',', '.')) || 0;
        const cantCJ = parseFloat(String(row.cantCJ || row.cantcj || row.CantCJ || row.Cajas || 0).replace(',', '.')) || 0;
        const secuencia = row.Secuencia || row.secuencia || idx + 1;
        const ambiente = String(row.Ambiente || row.ambiente || row.Amb || 'S').trim().toUpperCase() || 'S';
        const horaIni = row.HoraIni || row.hora_ini || '';
        const horaFin = row.HoraFin || row.hora_fin || '';

        const transportista = String(row.Transportista || row.transportista || row.Transp || row.transport || '').trim();
        const groupKey = String(ruta).trim();

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            ruta,
            nombreRuta: nombreRuta || `Ruta ${ruta}`,
            fecha: fecha || 'Sin Fecha',
            transportistasSet: new Set(),
            destinosSet: new Set(),
            sumaVolumen: 0,
            sumaPeso: 0,
            sumaCantCJ: 0,
            paradasMap: new Map()
          });
        }

        const g = groups.get(groupKey);
        if (nombreRuta && (!g.nombreRuta || g.nombreRuta === `Ruta ${ruta}`)) {
          g.nombreRuta = nombreRuta;
        }
        if (destino) g.destinosSet.add(destino);
        if (transportista) g.transportistasSet.add(transportista);
        g.sumaVolumen += volumen;
        g.sumaPeso += peso;
        g.sumaCantCJ += cantCJ;
        if (!g.fecha || g.fecha === 'Sin Fecha') {
          if (fecha) g.fecha = fecha;
        }

        // Consolidación de paradas por Secuencia + Ambiente (Requisitos 2 y 3):
        // Si el número de Sec se repite con el mismo Ambiente, se consolida sumando m³, peso y cj.
        // Si tienen diferente Ambiente (ej: C vs R vs S), se mantienen como filas distintas.
        const paradaKey = `${secuencia}:::${ambiente}`;

        if (g.paradasMap.has(paradaKey)) {
          const p = g.paradasMap.get(paradaKey);
          p.volumen = Number((p.volumen + volumen).toFixed(4));
          p.peso = Number((p.peso + peso).toFixed(2));
          p.cantCJ = Math.round(p.cantCJ + cantCJ);
          if (!p.destino && destino) p.destino = destino;
          if (!p.direccion && direccion) p.direccion = direccion;
          if (!p.comuna && comuna) p.comuna = comuna;
          if (!p.horaIni && horaIni) p.horaIni = horaIni;
          if (!p.horaFin && horaFin) p.horaFin = horaFin;
          if (!p.transportista && transportista) p.transportista = transportista;
        } else {
          g.paradasMap.set(paradaKey, {
            id: `${ruta}-s${secuencia}-${ambiente}-${g.paradasMap.size}`,
            secuencia,
            ambiente,
            destino,
            direccion,
            comuna,
            horaIni,
            horaFin,
            cantCJ: Math.round(cantCJ),
            peso: Number(peso.toFixed(2)),
            volumen: Number(volumen.toFixed(4)),
            transportista
          });
        }
      });

      const transformed = Array.from(groups.values()).map((g, index) => {
        const sortedParadas = Array.from(g.paradasMap.values()).sort((a, b) => {
          const numA = parseInt(a.secuencia, 10);
          const numB = parseInt(b.secuencia, 10);
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
          return String(a.ambiente).localeCompare(String(b.ambiente));
        });

        const ambientesSet = new Set(sortedParadas.map(p => p.ambiente));

        const masterOp = findOperationForRoute(g.ruta);
        const resolvedOp = masterOp?.operacion || getOperacionName(g.ruta, g.nombreRuta);
        const resolvedDenom = masterOp?.denominacion || g.nombreRuta;
        const resolvedTransp = masterOp?.transportista || Array.from(g.transportistasSet).filter(Boolean).join(', ') || 'Sin Transportista';

        return {
          id: `trans-${g.ruta}-${index}`,
          ruta: g.ruta,
          nombreRuta: resolvedDenom,
          operacion: resolvedOp,
          cliente: resolvedOp,
          denominacion: resolvedDenom,
          fecha: g.fecha,
          transportista: resolvedTransp,
          ambientes: Array.from(ambientesSet),
          recuentoDestino: g.destinosSet.size || (new Set(sortedParadas.map(p => p.destino)).size) || 1,
          sumaVolumen: Number(g.sumaVolumen.toFixed(4)),
          sumaPeso: Number(g.sumaPeso.toFixed(2)),
          sumaCantCJ: Math.round(g.sumaCantCJ),
          paradas: sortedParadas,
          isStandard4Digit: /^[1-9]\d{3}$/.test(g.ruta),
          isSpecialRoute: !/^[1-9]\d{3}$/.test(g.ruta)
        };
      });

      transformed.sort((a, b) => {
        const numA = parseInt(a.ruta, 10);
        const numB = parseInt(b.ruta, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.ruta.localeCompare(b.ruta);
      });

      persistTransformedRoutes(transformed);

      set({
        transformedRoutes: transformed,
        isTransformed: true
      });

      toast.success(`Transformación exitosa: ${transformed.length} rutas consolidadas`);
      return true;
    } catch (err) {
      console.error('Error al transformar datos:', err);
      toast.error('Error al transformar el archivo');
      return false;
    }
  },

  // Transmit from Ruteo to Disponibilización
  transmitToDisponibilizacion: () => {
    const { transformedRoutes, transmittedAssignments } = get();

    if (!transformedRoutes || transformedRoutes.length === 0) {
      toast.error('No hay rutas transformadas para transmitir.');
      return false;
    }

    const newAssignmentsByDate = { ...transmittedAssignments };
    let totalTransmitted = 0;

    transformedRoutes.forEach((route) => {
      const fecha = route.fecha || 'Sin Fecha';
      if (!newAssignmentsByDate[fecha]) {
        newAssignmentsByDate[fecha] = [];
      }

      const existingIdx = newAssignmentsByDate[fecha].findIndex(
        (a) => String(a.ruta).trim() === String(route.ruta).trim()
      );

      const opName = route.operacion || getOperacionName(route.ruta, route.nombreRuta);
      const denomName = route.denominacion || route.nombreRuta || `Ruta ${route.ruta}`;

      const assignmentRow = {
        id: `disp-${fecha}-${route.ruta}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fecha: fecha,
        conductor_name: '',
        conductor_rut: '',
        aux1_name: '',
        aux1_rut: '',
        aux2_name: '',
        aux2_rut: '',
        camion: '',
        tipo_equipo: '',
        rampla: '',
        n_vuelta: '', // Vacía inicialmente, seleccionable del 1 al 8
        tipo_servicio: 'Centralizado',
        ruta: route.ruta,
        cliente: opName,
        operacion: opName,
        denominacion: denomName,
        transportista: route.transportista || ensureRowTransportista(route),
        referencia: '',
        locales: route.recuentoDestino,
        m3: route.sumaVolumen,
        peso: route.sumaPeso || 0,
        cantCJ: route.sumaCantCJ || 0,
        paradas: route.paradas || []
      };

      if (existingIdx >= 0) {
        const old = newAssignmentsByDate[fecha][existingIdx];
        newAssignmentsByDate[fecha][existingIdx] = {
          ...old,
          locales: route.recuentoDestino,
          m3: route.sumaVolumen,
          peso: route.sumaPeso || old.peso || 0,
          cantCJ: route.sumaCantCJ || old.cantCJ || 0,
          cliente: opName,
          operacion: opName,
          denominacion: denomName,
          transportista: route.transportista || old.transportista || ensureRowTransportista(route),
          paradas: (route.paradas && route.paradas.length > 0) ? route.paradas : (old.paradas || [])
        };
      } else {
        newAssignmentsByDate[fecha].push(assignmentRow);
      }

      totalTransmitted++;
    });

    persistAssignments(newAssignmentsByDate);

    const dates = Object.keys(newAssignmentsByDate);
    const targetDate = transformedRoutes[0]?.fecha || dates[0] || '';

    const synced = syncHistoryAndSavedForDate(get(), targetDate, newAssignmentsByDate[targetDate] || []);

    const currentBaseline = get().savedRuteoBaseline || {};
    const updatedBaseline = { ...currentBaseline };
    if (!updatedBaseline[targetDate] || updatedBaseline[targetDate].length === 0) {
      updatedBaseline[targetDate] = JSON.parse(JSON.stringify(newAssignmentsByDate[targetDate] || []));
      persistSavedBaseline(updatedBaseline);
    }

    set({
      transmittedAssignments: newAssignmentsByDate,
      savedRuteoBaseline: updatedBaseline,
      selectedDisponibilizarDate: targetDate,
      ...synced
    });

    toast.success(`¡${totalTransmitted} rutas transmitidas a Disponibilización exitosamente!`);
    return true;
  },

  // APERTURAR RUTA: Permite tomar paradas/filas completas de una ruta y moverlas a una nueva ruta con nueva numeración
  aperturarRuta: (sourceRouteId, newRouteNumber, newRouteName, newTransportista, selectedParadaIds, selectedAmbientes = []) => {
    const { transformedRoutes } = get();
    const cleanNewNumber = String(newRouteNumber || '').trim();
    if (!cleanNewNumber) {
      toast.error('Debes ingresar una numeración para la nueva ruta (Ej: 1611-B, 1700)');
      return false;
    }

    const sourceIndex = transformedRoutes.findIndex(r => r.id === sourceRouteId || String(r.ruta).trim() === String(sourceRouteId).trim());
    if (sourceIndex < 0) {
      toast.error('No se encontró la ruta de origen seleccionada');
      return false;
    }

    const source = transformedRoutes[sourceIndex];
    const sourceParadas = source.paradas || [];
    const idSet = new Set(selectedParadaIds.map(x => String(x)));

    // Separar paradas a mover y paradas que quedan usando ID único
    const movedParadas = [];
    const remainingParadas = [];

    sourceParadas.forEach((p, idx) => {
      const matchId = String(p.id || `${source.ruta}-${idx}`);

      if (idSet.has(matchId)) {
        movedParadas.push(p);
      } else {
        remainingParadas.push(p);
      }
    });

    if (movedParadas.length === 0) {
      toast.error('Debes seleccionar al menos una parada para mover a la nueva ruta');
      return false;
    }

    // Actualizar ruta origen
    const updatedSource = {
      ...source,
      paradas: remainingParadas,
      ambientes: Array.from(new Set(remainingParadas.map(p => p.ambiente))),
      recuentoDestino: new Set(remainingParadas.map(p => p.destino)).size,
      sumaVolumen: Number(remainingParadas.reduce((a, b) => a + (parseFloat(b.volumen) || 0), 0).toFixed(4)),
      sumaPeso: Number(remainingParadas.reduce((a, b) => a + (parseFloat(b.peso) || 0), 0).toFixed(2)),
      sumaCantCJ: Math.round(remainingParadas.reduce((a, b) => a + (parseFloat(b.cantCJ) || 0), 0)),
      isModified: true
    };

    // Crear la nueva ruta aperturada
    const routeAmbientes = selectedAmbientes && selectedAmbientes.length > 0 
      ? selectedAmbientes 
      : Array.from(new Set(movedParadas.map(p => p.ambiente)));

    const newRoute = {
      id: `trans-aperturada-${cleanNewNumber}-${Date.now()}`,
      ruta: cleanNewNumber,
      nombreRuta: String(newRouteName || '').trim() || `${source.nombreRuta} (Aperturada)`,
      fecha: source.fecha || '14-10-2026',
      transportista: String(newTransportista || '').trim() || source.transportista || 'T300',
      ambientes: routeAmbientes,
      recuentoDestino: new Set(movedParadas.map(p => p.destino)).size,
      sumaVolumen: Number(movedParadas.reduce((a, b) => a + (parseFloat(b.volumen) || 0), 0).toFixed(4)),
      sumaPeso: Number(movedParadas.reduce((a, b) => a + (parseFloat(b.peso) || 0), 0).toFixed(2)),
      sumaCantCJ: Math.round(movedParadas.reduce((a, b) => a + (parseFloat(b.cantCJ) || 0), 0)),
      paradas: movedParadas.map((p, pIdx) => ({
        ...p,
        id: `p-${cleanNewNumber}-${pIdx + 1}`,
        secuencia: p.secuencia || pIdx + 1
      })),
      isModified: true,
      isAperturada: true,
      parentRuta: source.ruta
    };

    const nextRoutes = [...transformedRoutes];
    nextRoutes[sourceIndex] = updatedSource;
    // Insertar la nueva ruta aperturada inmediatamente después
    nextRoutes.splice(sourceIndex + 1, 0, newRoute);

    persistTransformedRoutes(nextRoutes);
    set({ transformedRoutes: nextRoutes });

    toast.success(`¡Ruta ${cleanNewNumber} aperturada con éxito con ${movedParadas.length} parada(s)!`);
    return true;
  },

  // TRANSMITIR SOLO RUTAS ESPECÍFICAS O MODIFICADAS A DISPONIBILIZACIÓN
  // Mantiene intacto todo lo que ya fue asignado o modificado en las otras rutas de Disponibilización
  transmitSpecificRoutesToDisponibilizacion: (routeIdsToTransmit) => {
    const { transformedRoutes, transmittedAssignments } = get();
    if (!routeIdsToTransmit || routeIdsToTransmit.length === 0) {
      toast.warning('No se indicaron rutas para transmitir.');
      return false;
    }

    const idsSet = new Set(routeIdsToTransmit.map(x => String(x).trim()));
    const targetRoutes = transformedRoutes.filter(r => idsSet.has(String(r.id).trim()) || idsSet.has(String(r.ruta).trim()));

    if (targetRoutes.length === 0) {
      toast.error('No se encontraron las rutas indicadas en la planificación.');
      return false;
    }

    const newAssignmentsByDate = JSON.parse(JSON.stringify(transmittedAssignments));
    let totalUpdated = 0;
    let totalAdded = 0;

    targetRoutes.forEach((route) => {
      const fecha = route.fecha || 'Sin Fecha';
      if (!newAssignmentsByDate[fecha]) {
        newAssignmentsByDate[fecha] = [];
      }

      const existingIdx = newAssignmentsByDate[fecha].findIndex(
        (a) => String(a.ruta).trim() === String(route.ruta).trim()
      );

      if (existingIdx >= 0) {
        // Actualizar SOLO métricas y paradas, preservando conductor, chofer, camión, rampla y vuelta ya asignados
        const old = newAssignmentsByDate[fecha][existingIdx];
        const opName = route.operacion || getOperacionName(route.ruta, route.nombreRuta);
        const denomName = route.denominacion || route.nombreRuta || `Ruta ${route.ruta}`;
        newAssignmentsByDate[fecha][existingIdx] = {
          ...old,
          locales: route.recuentoDestino,
          m3: route.sumaVolumen,
          peso: route.sumaPeso || old.peso || 0,
          cantCJ: route.sumaCantCJ || old.cantCJ || 0,
          cliente: opName || old.cliente,
          operacion: opName || old.operacion,
          denominacion: denomName || old.denominacion,
          transportista: route.transportista || old.transportista || ensureRowTransportista(route),
          paradas: (route.paradas && route.paradas.length > 0) ? route.paradas : (old.paradas || [])
        };
        totalUpdated++;
      } else {
        // Nueva ruta aperturada -> Crear registro en Disponibilización con campos de dotación y camión listos para asignar
        const assignmentRow = {
          id: `disp-${fecha}-${route.ruta}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          fecha: fecha,
          conductor_name: '',
          conductor_rut: '',
          aux1_name: '',
          aux1_rut: '',
          aux2_name: '',
          aux2_rut: '',
          camion: '',
          tipo_equipo: '',
          rampla: '',
          n_vuelta: '',
          tipo_servicio: 'Distribución',
          ruta: route.ruta,
          cliente: route.nombreRuta,
          transportista: route.transportista || ensureRowTransportista(route),
          referencia: route.isAperturada ? `Aperturada desde Ruta ${route.parentRuta || ''}` : '',
          locales: route.recuentoDestino,
          m3: route.sumaVolumen,
          peso: route.sumaPeso || 0,
          cantCJ: route.sumaCantCJ || 0,
          paradas: route.paradas || []
        };
        newAssignmentsByDate[fecha].push(assignmentRow);
        totalAdded++;
      }
    });

    // Marcar en transformedRoutes como no pendientes de transmisión
    const nextTransformed = transformedRoutes.map(r => {
      if (idsSet.has(String(r.id).trim()) || idsSet.has(String(r.ruta).trim())) {
        return { ...r, isModified: false, isTransmitted: true };
      }
      return r;
    });

    persistTransformedRoutes(nextTransformed);
    persistAssignments(newAssignmentsByDate);

    const targetDate = targetRoutes[0]?.fecha || Object.keys(newAssignmentsByDate)[0] || '14-10-2026';
    const synced = syncHistoryAndSavedForDate(get(), targetDate, newAssignmentsByDate[targetDate] || []);

    const currentBaseline = get().savedRuteoBaseline || {};
    const updatedBaseline = { ...currentBaseline };
    if (!updatedBaseline[targetDate] || updatedBaseline[targetDate].length === 0) {
      updatedBaseline[targetDate] = JSON.parse(JSON.stringify(newAssignmentsByDate[targetDate] || []));
      persistSavedBaseline(updatedBaseline);
    }

    set({
      transmittedAssignments: newAssignmentsByDate,
      transformedRoutes: nextTransformed,
      savedRuteoBaseline: updatedBaseline,
      selectedDisponibilizarDate: targetDate,
      ...synced
    });

    toast.success(`Transmitido a Disponibilización: ${totalAdded} ruta(s) nueva(s), ${totalUpdated} actualizada(s). El resto se mantuvo intacto.`);
    return true;
  },

  // Inicializar y sincronizar asignaciones, ruteo overrides e histórico desde Supabase
  initPlanningFromDb: async () => {
    try {
      const dbState = await fetchPlanningStateFromDb();
      if (dbState) {
        const { assignmentsMap, ruteoOverridesFromDb, historyListFromDb, changeHistoryListFromDb } = dbState;
        set(state => {
          const mergedAssignments = { ...state.transmittedAssignments };
          Object.entries(assignmentsMap).forEach(([fecha, dbRows]) => {
            const localRows = state.transmittedAssignments?.[fecha] || [];
            if (!localRows || localRows.length === 0) {
              mergedAssignments[fecha] = dbRows;
            } else {
              // Fusionar respetando filas ya asignadas localmente pero con DB autoritativa en rutas, métricas y paradas
              const localRowMap = new Map();
              localRows.forEach(lr => {
                const k = `${lr.ruta || ''}:::${lr.id || ''}`;
                localRowMap.set(k, lr);
              });
              
              mergedAssignments[fecha] = dbRows.map(dbR => {
                const k = `${dbR.ruta || ''}:::${dbR.id || ''}`;
                const lr = localRowMap.get(k) || localRows.find(l => l.ruta && String(l.ruta).trim() === String(dbR.ruta).trim());
                if (lr) {
                  // Si el local tiene conductor/camión y el de la DB está vacío, mantener local
                  return {
                    ...dbR,
                    conductor_name: dbR.conductor_name || lr.conductor_name || '',
                    conductor_rut: dbR.conductor_rut || lr.conductor_rut || '',
                    camion: dbR.camion || lr.camion || '',
                    tipo_equipo: dbR.tipo_equipo || lr.tipo_equipo || '',
                    rampla: dbR.rampla || lr.rampla || '',
                    n_vuelta: dbR.n_vuelta || lr.n_vuelta || '',
                    aux1_name: dbR.aux1_name || lr.aux1_name || '',
                    aux1_rut: dbR.aux1_rut || lr.aux1_rut || '',
                    aux2_name: dbR.aux2_name || lr.aux2_name || '',
                    aux2_rut: dbR.aux2_rut || lr.aux2_rut || '',
                    turno: dbR.turno || lr.turno || '',
                    hora_cita: dbR.hora_cita || lr.hora_cita || '',
                    prioridad: dbR.prioridad || lr.prioridad || 'Normal',
                    destino_prioritario: dbR.destino_prioritario || lr.destino_prioritario || '',
                    // La DB es la autoridad absoluta de paradas, destinos y métricas
                    paradas: (dbR.paradas && dbR.paradas.length > 0) ? dbR.paradas : (lr.paradas || []),
                    locales: dbR.locales != null ? dbR.locales : lr.locales,
                    m3: dbR.m3 != null ? dbR.m3 : lr.m3,
                    peso: dbR.peso != null ? dbR.peso : lr.peso,
                    cantCJ: dbR.cantCJ != null ? dbR.cantCJ : lr.cantCJ
                  };
                }
                return dbR;
              });

              // Preservar rutas aperturadas localmente si aún no existen en DB
              const dbRouteKeys = new Set(dbRows.map(dr => String(dr.ruta).trim()));
              localRows.forEach(lr => {
                if (lr.isAperturada && !dbRouteKeys.has(String(lr.ruta).trim())) {
                  mergedAssignments[fecha].push(lr);
                }
              });
            }
          });

          const mergedSaved = { ...state.savedRuteoByDate, ...mergedAssignments };
          const mergedBaseline = { ...(state.savedRuteoBaseline || {}), ...mergedAssignments };
          const mergedOverrides = ruteoOverridesFromDb 
            ? { ...state.ruteoOverrides, ...ruteoOverridesFromDb } 
            : state.ruteoOverrides;
          const mergedHistory = historyListFromDb && historyListFromDb.length > 0 
            ? historyListFromDb 
            : state.savedHistoryList;
          const mergedChangeHistory = changeHistoryListFromDb && Array.isArray(changeHistoryListFromDb) && changeHistoryListFromDb.length > 0
            ? changeHistoryListFromDb
            : state.changeHistoryList;

          try {
            localStorage.setItem('keylogistics_transmitted_assignments', JSON.stringify(mergedAssignments));
            localStorage.setItem('keylogistics_saved_ruteo', JSON.stringify(mergedSaved));
            localStorage.setItem('keylogistics_saved_baseline', JSON.stringify(mergedBaseline));
            if (ruteoOverridesFromDb) {
              localStorage.setItem('keylogistics_ruteo_overrides_v1', JSON.stringify(mergedOverrides));
            }
            if (historyListFromDb) {
              localStorage.setItem('keylogistics_saved_history_list', JSON.stringify(mergedHistory));
            }
            if (changeHistoryListFromDb) {
              localStorage.setItem('keylogistics_change_history', JSON.stringify(mergedChangeHistory));
            }
          } catch (e) {}

          const mostRecentDispDate = getMostRecentDate(Object.keys(mergedAssignments || {}));
          const mostRecentRuteoDate = getMostRecentDate(Object.keys(mergedSaved || {}));

          return {
            transmittedAssignments: mergedAssignments,
            savedRuteoByDate: mergedSaved,
            savedRuteoBaseline: mergedBaseline,
            ruteoOverrides: mergedOverrides,
            savedHistoryList: mergedHistory,
            changeHistoryList: mergedChangeHistory,
            selectedDisponibilizarDate: (state.selectedDisponibilizarDate && state.selectedDisponibilizarDate !== '14-10-2026' && mergedAssignments[state.selectedDisponibilizarDate])
              ? state.selectedDisponibilizarDate
              : mostRecentDispDate,
            selectedRuteoDate: (state.selectedRuteoDate && state.selectedRuteoDate !== '14-10-2026' && mergedSaved[state.selectedRuteoDate])
              ? state.selectedRuteoDate
              : mostRecentRuteoDate
          };
        });
      } else {
        // Si Supabase no tiene asignaciones pero localmente sí tenemos, sincronizar a Supabase
        const current = get().transmittedAssignments;
        if (current && typeof current === 'object') {
          Object.entries(current).forEach(([f, rows]) => {
            if (rows && rows.length > 0) {
              persistAssignmentsToDb(f, rows);
            }
          });
        }
        const overrides = get().ruteoOverrides;
        if (overrides && Object.keys(overrides).length > 0) {
          persistRuteoOverridesToDb(overrides);
        }
        const history = get().savedHistoryList;
        if (history && history.length > 0) {
          persistHistoryToDb(history);
        }
      }
    } catch (e) {
      console.warn('Error inicializando planning desde DB:', e);
    }
  },

  // Set selected date for Disponibilización
  setSelectedDisponibilizarDate: (date) => {
    set({ selectedDisponibilizarDate: date });
  },

  // Set selected date for Ruteo final view
  setSelectedRuteoDate: (date) => {
    set({ selectedRuteoDate: date });
  },

  // Update a single field in an assignment row (Sincroniza en tiempo real con Histórico, Ruteo y Supabase)
  updateAssignmentField: (fecha, rowId, field, value) => {
    set((state) => {
      const rows = state.transmittedAssignments[fecha] || [];
      const targetRow = rows.find(r => r.id === rowId);
      const targetRuta = targetRow?.ruta ? String(targetRow.ruta).trim() : null;

      // Mantener consistencia en todas las filas que compartan el mismo número de ruta
      const updatedRows = rows.map((r) => {
        if (r.id === rowId || (targetRuta && r.ruta && String(r.ruta).trim() === targetRuta)) {
          return { ...r, [field]: value };
        }
        return r;
      });
      const updatedMap = { ...state.transmittedAssignments, [fecha]: updatedRows };
      persistAssignments(updatedMap);
      persistAssignmentsToDb(fecha, updatedRows);
      const synced = syncHistoryAndSavedForDate(state, fecha, updatedRows);
      return { 
        transmittedAssignments: updatedMap,
        ...synced
      };
    });
  },

  // Batch update fields on multiple rows (Sincroniza en tiempo real con toda la ruta, Histórico, Ruteo y Supabase)
  batchUpdateRows: (fecha, rowIds, updates) => {
    set((state) => {
      const rows = state.transmittedAssignments[fecha] || [];
      const idSet = new Set(rowIds);

      // Identificar todos los números de ruta afectados para mantener coherencia en toda la ruta
      const affectedRutas = new Set();
      rows.forEach(r => {
        if (idSet.has(r.id) && r.ruta) affectedRutas.add(String(r.ruta).trim());
      });

      const updatedRows = rows.map((r) => {
        const matchesId = idSet.has(r.id);
        const matchesRuta = r.ruta && affectedRutas.has(String(r.ruta).trim());
        if (matchesId || matchesRuta) {
          return { ...r, ...updates };
        }
        return r;
      });

      const updatedMap = { ...state.transmittedAssignments, [fecha]: updatedRows };
      persistAssignments(updatedMap);
      persistAssignmentsToDb(fecha, updatedRows);
      const synced = syncHistoryAndSavedForDate(state, fecha, updatedRows);
      return { 
        transmittedAssignments: updatedMap,
        ...synced
      };
    });
  },

  // Assign staff with automatic RUT autocomplete
  assignStaffToRows: (fecha, rowIds, staffMember, targetRole = 'conductor') => {
    if (!staffMember) return;
    const updates = {};
    if (targetRole === 'conductor') {
      updates.conductor_name = staffMember.name;
      updates.conductor_rut = staffMember.rut || '';
    } else if (targetRole === 'auxiliar') {
      updates.aux1_name = staffMember.name;
      updates.aux1_rut = staffMember.rut || '';
    } else if (targetRole === 'auxiliar2') {
      updates.aux2_name = staffMember.name;
      updates.aux2_rut = staffMember.rut || '';
    }

    get().batchUpdateRows(fecha, rowIds, updates);
    toast.success(`Asignado ${staffMember.name} a ${rowIds.length} fila(s)`);
  },

  // Assign truck with automatic tipo_equipo autocomplete
  assignTruckToRows: (fecha, rowIds, truck) => {
    if (!truck) return;
    const truckIdentifier = truck.internal_number ? `${truck.internal_number} (${truck.plate})` : truck.plate;
    const updates = {
      camion: truckIdentifier,
      tipo_equipo: truck.type || 'Camión'
    };
    if (truck.empresa_externa) {
      updates.transportista = truck.empresa_externa;
    }

    get().batchUpdateRows(fecha, rowIds, updates);
    toast.success(`Camión ${truckIdentifier} asignado a ${rowIds.length} fila(s)`);
  },

  // Assign semirremolque to Rampla column
  assignRamplaToRows: (fecha, rowIds, truck) => {
    if (!truck) return;
    const ramplaIdentifier = truck.internal_number || truck.plate;
    get().batchUpdateRows(fecha, rowIds, { rampla: ramplaIdentifier });
    toast.success(`Rampla ${ramplaIdentifier} asignada a ${rowIds.length} fila(s)`);
  },

  // Clear slot from selected rows
  clearSlotFromRows: (fecha, rowIds, slot) => {
    const updates = {};
    if (slot === 'conductor') {
      updates.conductor_name = '';
      updates.conductor_rut = '';
    } else if (slot === 'auxiliar') {
      updates.aux1_name = '';
      updates.aux1_rut = '';
    } else if (slot === 'auxiliar2') {
      updates.aux2_name = '';
      updates.aux2_rut = '';
    } else if (slot === 'camion') {
      updates.camion = '';
      updates.tipo_equipo = '';
    } else if (slot === 'rampla') {
      updates.rampla = '';
    } else if (slot === 'vuelta') {
      updates.n_vuelta = '';
    }

    get().batchUpdateRows(fecha, rowIds, updates);
    toast.success(`Asignación limpiada en ${rowIds.length} fila(s)`);
  },

  // ELIMINAR RUTAS EN DISPONIBILIZACIÓN
  deleteAssignmentRows: (fecha, rowIds) => {
    if (!rowIds || rowIds.length === 0) return false;
    const idSet = new Set(rowIds);
    const { transmittedAssignments } = get();
    const currentRows = transmittedAssignments[fecha] || [];
    const updatedRows = currentRows.filter(r => !idSet.has(r.id));
    const updatedMap = { ...transmittedAssignments, [fecha]: updatedRows };

    persistAssignments(updatedMap);
    const synced = syncHistoryAndSavedForDate(get(), fecha, updatedRows);

    // Sincronizar con Supabase DB
    persistAssignmentsToDb(fecha, updatedRows);

    set({
      transmittedAssignments: updatedMap,
      ...synced
    });

    toast.success(`${rowIds.length} ruta(s) eliminada(s) de Disponibilización`);
    return true;
  },

  // TRANSMITIR RUTAS ESPECIALES A DISPONIBILIZACIÓN
  transmitSpecialRoutes: (fecha, specialRoutes) => {
    if (!specialRoutes || !Array.isArray(specialRoutes) || specialRoutes.length === 0) {
      toast.warning('No hay rutas especiales seleccionadas para transmitir.');
      return false;
    }

    const { transmittedAssignments, transformedRoutes } = get();
    const targetFecha = normalizeDate(fecha) || '14-10-2026';
    const nextAssignments = { ...transmittedAssignments };
    if (!nextAssignments[targetFecha]) {
      nextAssignments[targetFecha] = [];
    }

    let addedCount = 0;
    let updatedCount = 0;
    const currentRows = [...nextAssignments[targetFecha]];

    specialRoutes.forEach((sr, idx) => {
      const rutaClean = String(sr.ruta).trim();
      const existingIdx = currentRows.findIndex(r => String(r.ruta).trim() === rutaClean);

      if (existingIdx >= 0) {
        // La ruta ya existía: consolidar paradas nuevas preservando tripulación y camión asignados
        const old = currentRows[existingIdx];
        const oldParadas = old.paradas || [];
        const existingDestinos = new Set(oldParadas.map(p => (p.destino || '').trim().toUpperCase()));

        // Agregar paradas nuevas que no estaban
        const newParadas = (sr.paradas || []).filter(p => !existingDestinos.has((p.destino || '').trim().toUpperCase()));
        const mergedParadas = [...oldParadas, ...newParadas];

        const distinctDestinos = new Set(mergedParadas.map(p => (p.destino || '').trim().toUpperCase()));
        const totalVolumen = mergedParadas.reduce((a, b) => a + (parseFloat(b.volumen) || 0), 0);
        const totalPeso = mergedParadas.reduce((a, b) => a + (parseFloat(b.peso) || 0), 0);
        const totalCajas = mergedParadas.reduce((a, b) => a + (parseInt(b.cantCJ, 10) || 0), 0);

        currentRows[existingIdx] = {
          ...old,
          locales: distinctDestinos.size || 1,
          m3: Number(totalVolumen.toFixed(4)),
          peso: Number(totalPeso.toFixed(2)),
          cantCJ: totalCajas,
          referencia: old.referencia ? `${old.referencia} | Especial` : 'Ruta Especial (Destinos Nuevos)',
          paradas: mergedParadas,
          isSpecialRoute: true
        };
        updatedCount++;
      } else {
        // Nueva ruta especial: crear registro listo para asignar en Disponibilización
        const newAssignmentRow = {
          id: `disp-${targetFecha}-${rutaClean}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          fecha: targetFecha,
          conductor_name: '',
          conductor_rut: '',
          aux1_name: '',
          aux1_rut: '',
          aux2_name: '',
          aux2_rut: '',
          camion: '',
          tipo_equipo: '',
          rampla: '',
          n_vuelta: '',
          tipo_servicio: 'Distribución',
          ruta: rutaClean,
          cliente: sr.nombreRuta || `Ruta ${rutaClean}`,
          transportista: sr.transportista || '',
          referencia: 'Ruta Especial',
          locales: sr.recuentoDestino || (new Set((sr.paradas || []).map(p => p.destino)).size) || 1,
          m3: Number(parseFloat(sr.sumaVolumen || 0).toFixed(4)),
          peso: Number(parseFloat(sr.sumaPeso || 0).toFixed(2)),
          cantCJ: parseInt(sr.sumaCantCJ || 0, 10),
          isSpecialRoute: true,
          paradas: sr.paradas || []
        };
        currentRows.push(newAssignmentRow);
        addedCount++;
      }
    });

    nextAssignments[targetFecha] = currentRows;
    persistAssignments(nextAssignments);

    // Sincronizar con savedRuteo, savedHistory y Supabase
    const synced = syncHistoryAndSavedForDate(get(), targetFecha, currentRows);
    persistAssignmentsToDb(targetFecha, currentRows);

    // Sincronizar también con transformedRoutes para que aparezcan en Ruteo
    const nextTransformed = [...transformedRoutes];
    specialRoutes.forEach(sr => {
      const idx = nextTransformed.findIndex(r => String(r.ruta).trim() === String(sr.ruta).trim());
      if (idx >= 0) {
        nextTransformed[idx] = { ...nextTransformed[idx], ...sr, isSpecialRoute: true };
      } else {
        nextTransformed.push({ ...sr, isSpecialRoute: true });
      }
    });
    persistTransformedRoutes(nextTransformed);

    set({
      transmittedAssignments: nextAssignments,
      transformedRoutes: nextTransformed,
      selectedDisponibilizarDate: targetFecha,
      ...synced
    });

    toast.success(`¡${addedCount} ruta(s) nueva(s) y ${updatedCount} actualizada(s) como Especiales en Disponibilización!`);
    return true;
  },

  // GUARDAR DISPONIBILIZACIÓN: Transmite devuelta al sub-menú "Ruteo" y a "Envío de rutas", actualiza baseline y guarda en histórico
  saveDisponibilizacion: (fecha) => {
    const { transmittedAssignments, savedRuteoBaseline, ruteoOverrides } = get();
    const rows = transmittedAssignments[fecha] || [];

    if (rows.length === 0) {
      toast.warning(`No hay datos en la fecha ${fecha} para guardar.`);
      return false;
    }

    // Enriquecer cada fila con los metadatos de Ruteo (Turno, Hora Cita, Prioridad, Destino Prioritario)
    const dateOverrides = ruteoOverrides?.[fecha] || {};
    const enrichedRows = rows.map(r => {
      const vueltaKey = r.n_vuelta ? String(r.n_vuelta).trim() : '1';
      const hasAssignment = !!(r.camion && r.conductor_name);
      const tripKey = hasAssignment
        ? `${r.camion.trim()}:::${r.conductor_name.trim()}:::${vueltaKey}`
        : `single:::${r.ruta}:::${r.id}`;
      const ov = dateOverrides[tripKey] || {};
      return {
        ...r,
        turno: ov.turno !== undefined ? ov.turno : (r.turno || ''),
        hora_cita: ov.hora_cita !== undefined ? ov.hora_cita : (r.hora_cita || ''),
        prioridad: ov.prioridad !== undefined ? ov.prioridad : (r.prioridad || 'Normal'),
        destino_prioritario: ov.destino_prioritario !== undefined ? ov.destino_prioritario : (r.destino_prioritario || '')
      };
    });

    const synced = syncHistoryAndSavedForDate(get(), fecha, enrichedRows);
    const updatedBaseline = {
      ...(savedRuteoBaseline || {}),
      [fecha]: JSON.parse(JSON.stringify(enrichedRows))
    };
    persistSavedBaseline(updatedBaseline);

    const updatedAssignments = {
      ...(transmittedAssignments || {}),
      [fecha]: enrichedRows
    };
    persistAssignments(updatedAssignments);

    // Sincronizar inmediatamente con Supabase DB para todos los notebooks
    persistAssignmentsToDb(fecha, enrichedRows);
    persistRuteoOverridesToDb(ruteoOverrides);
    if (synced?.savedHistoryList) {
      persistHistoryToDb(synced.savedHistoryList);
    }

    set({
      transmittedAssignments: updatedAssignments,
      ...synced,
      savedRuteoBaseline: updatedBaseline,
      selectedRuteoDate: fecha
    });

    toast.success(`¡Disponibilización del ${fecha} guardada y transmitida a Envío de rutas!`);
    return true;
  },

  // REGISTRAR AUDITORÍA DE CAMBIOS (Requisito 2)
  recordChangeAudit: (entries) => {
    if (!entries || !Array.isArray(entries) || entries.length === 0) return;
    const current = get().changeHistoryList || [];
    const updated = [...entries, ...current];
    persistChangeHistory(updated);
    set({ changeHistoryList: updated });
    return true;
  },

  // Eliminar una fila individual del Histórico de cambios
  deleteChangeHistoryRow: (id) => {
    const current = get().changeHistoryList || [];
    const updated = current.filter(item => item.id !== id);
    persistChangeHistory(updated);
    set({ changeHistoryList: updated });
    toast.success('Registro de auditoría eliminado');
    return true;
  },

  // Eliminar lote de filas del Histórico de cambios
  deleteBatchChangeHistory: (ids) => {
    const idSet = new Set(ids);
    const current = get().changeHistoryList || [];
    const updated = current.filter(item => !idSet.has(item.id));
    persistChangeHistory(updated);
    set({ changeHistoryList: updated });
    toast.success(`${ids.length} registro(s) eliminado(s) del historial`);
    return true;
  },

  // Limpiar historial de cambios completo
  clearChangeHistory: () => {
    persistChangeHistory([]);
    set({ changeHistoryList: [] });
    toast.info('Histórico de cambios vaciado');
  },

  // ACTUALIZAR METADATOS DE RUTEO (Turno, Hora Cita, Prioridad, Destino Prioritario)
  updateRuteoTripField: (fecha, tripKey, field, value) => {
    set(state => {
      const dateOverrides = state.ruteoOverrides[fecha] || {};
      const tripData = dateOverrides[tripKey] || {};
      const updatedDateOverrides = {
        ...dateOverrides,
        [tripKey]: {
          ...tripData,
          [field]: value
        }
      };
      const nextOverrides = {
        ...state.ruteoOverrides,
        [fecha]: updatedDateOverrides
      };
      persistRuteoOverrides(nextOverrides);
      return { ruteoOverrides: nextOverrides };
    });
  },

  // ACTUALIZACIÓN MASIVA DE METADATOS DE RUTEO PARA FILAS SELECCIONADAS
  batchUpdateRuteoTripField: (fecha, tripKeys, updates) => {
    if (!tripKeys || tripKeys.length === 0) return;
    set(state => {
      const dateOverrides = { ...(state.ruteoOverrides[fecha] || {}) };
      tripKeys.forEach(tripKey => {
        dateOverrides[tripKey] = {
          ...(dateOverrides[tripKey] || {}),
          ...updates
        };
      });
      const nextOverrides = {
        ...state.ruteoOverrides,
        [fecha]: dateOverrides
      };
      persistRuteoOverrides(nextOverrides);
      return { ruteoOverrides: nextOverrides };
    });
  },

  // APERTURAR RUTA EN DISPONIBILIZACIÓN (Requisito 1)
  // Permite tomar paradas/filas completas de una ruta en Disponibilización y moverlas a una nueva ruta con numeración propia
  aperturarRutaEnDisponibilizacion: (fecha, sourceRowId, newRouteNumber, newRouteName, newTransportista, selectedParadaIds, selectedAmbientes = []) => {
    const { transmittedAssignments } = get();
    const cleanNewNumber = String(newRouteNumber || '').trim();
    if (!cleanNewNumber) {
      toast.error('Debes ingresar una numeración para la nueva ruta (Ej: 1611-B, 1700)');
      return false;
    }

    const currentRows = transmittedAssignments[fecha] || [];
    const sourceIndex = currentRows.findIndex(r => r.id === sourceRowId || String(r.ruta).trim() === String(sourceRowId).trim());
    if (sourceIndex < 0) {
      toast.error('No se encontró la ruta de origen en Disponibilización');
      return false;
    }

    const source = currentRows[sourceIndex];
    const sourceParadas = source.paradas || [];
    const idSet = new Set(selectedParadaIds.map(x => String(x)));

    const movedParadas = [];
    const remainingParadas = [];

    sourceParadas.forEach((p, idx) => {
      const matchId = String(p.id || `${source.ruta}-${idx}`);
      if (idSet.has(matchId)) {
        movedParadas.push(p);
      } else {
        remainingParadas.push(p);
      }
    });

    if (movedParadas.length === 0) {
      toast.error('Debes seleccionar al menos una parada para mover a la nueva ruta');
      return false;
    }

    // Actualizar ruta origen con métricas recalculadas
    const updatedSource = {
      ...source,
      paradas: remainingParadas,
      locales: new Set(remainingParadas.map(p => p.destino)).size,
      m3: Number(remainingParadas.reduce((a, b) => a + (parseFloat(b.volumen) || 0), 0).toFixed(4)),
      peso: Number(remainingParadas.reduce((a, b) => a + (parseFloat(b.peso) || 0), 0).toFixed(2)),
      cantCJ: Math.round(remainingParadas.reduce((a, b) => a + (parseFloat(b.cantCJ) || 0), 0)),
      isModified: true
    };

    // Crear nueva ruta aperturada con dotación y camión listos para asignar
    const newRow = {
      id: `disp-aperturada-${fecha}-${cleanNewNumber}-${Date.now()}`,
      fecha: fecha,
      conductor_name: '',
      conductor_rut: '',
      aux1_name: '',
      aux1_rut: '',
      aux2_name: '',
      aux2_rut: '',
      camion: '',
      tipo_equipo: '',
      rampla: '',
      n_vuelta: '',
      tipo_servicio: source.tipo_servicio || 'Distribución',
      ruta: cleanNewNumber,
      cliente: String(newRouteName || '').trim() || `${source.cliente} (Aperturada)`,
      transportista: String(newTransportista || '').trim() || source.transportista || 'T300',
      referencia: `Aperturada desde Ruta ${source.ruta}`,
      locales: new Set(movedParadas.map(p => p.destino)).size,
      m3: Number(movedParadas.reduce((a, b) => a + (parseFloat(b.volumen) || 0), 0).toFixed(4)),
      peso: Number(movedParadas.reduce((a, b) => a + (parseFloat(b.peso) || 0), 0).toFixed(2)),
      cantCJ: Math.round(movedParadas.reduce((a, b) => a + (parseFloat(b.cantCJ) || 0), 0)),
      paradas: movedParadas.map((p, pIdx) => ({
        ...p,
        id: `p-${cleanNewNumber}-${pIdx + 1}`,
        secuencia: p.secuencia || pIdx + 1
      })),
      isModified: true,
      isAperturada: true,
      parentRuta: source.ruta
    };

    const nextAssignments = { ...transmittedAssignments };
    const nextRows = [...currentRows];
    nextRows[sourceIndex] = updatedSource;
    nextRows.splice(sourceIndex + 1, 0, newRow);
    nextAssignments[fecha] = nextRows;

    persistAssignments(nextAssignments);

    // Sincronizar en tiempo real con savedRuteo y savedHistory
    const synced = syncHistoryAndSavedForDate(get(), fecha, nextRows);

    set({
      transmittedAssignments: nextAssignments,
      ...synced
    });

    toast.success(`¡Ruta ${cleanNewNumber} aperturada con éxito en Disponibilización con ${movedParadas.length} parada(s)!`);
    return true;
  },

  // AGREGAR SERVICIOS EXTRAS (Requisito 5)
  // Permite agregar filas de servicios operativos adicionales (Retiro camión, Taller, Vulcanización, Traspasos, Apoyo Centro, etc.)
  // y transmitirlos a Histórico de Disponibilización con su fecha de registro.
  addExtraServices: (extraRows) => {
    if (!extraRows || !Array.isArray(extraRows) || extraRows.length === 0) {
      toast.warning('No hay servicios extras para guardar.');
      return false;
    }

    const { transmittedAssignments } = get();
    const nextAssignments = { ...transmittedAssignments };
    const affectedDates = new Set();

    extraRows.forEach((item, idx) => {
      const fecha = normalizeDate(item.fecha) || '14-10-2026';
      affectedDates.add(fecha);

      if (!nextAssignments[fecha]) {
        nextAssignments[fecha] = [];
      }

      const newId = `extra-${fecha}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      const extraAssignmentRow = {
        id: newId,
        fecha: fecha,
        conductor_name: item.conductor_name || '',
        conductor_rut: item.conductor_rut || '',
        aux1_name: item.aux1_name || '',
        aux1_rut: item.aux1_rut || '',
        aux2_name: item.aux2_name || '',
        aux2_rut: item.aux2_rut || '',
        camion: item.camion || '',
        tipo_equipo: item.tipo_equipo || 'Camión',
        rampla: item.rampla || '',
        n_vuelta: item.n_vuelta || '1',
        tipo_servicio: item.servicio || 'Servicio especial',
        ruta: item.ruta || (item.servicio === 'SPID' ? `SPID-${nextAssignments[fecha].length + 1}` : `EXT-${nextAssignments[fecha].length + 1}`),
        cliente: item.cliente || (item.servicio === 'SPID' ? 'SPID' : item.servicio || 'Servicio Extra'),
        operacion: item.operacion || (item.servicio === 'SPID' ? 'SPID' : item.servicio || 'Servicios Extras'),
        referencia: item.nota || 'Servicio Extra Operativo',
        locales: 1,
        m3: 0,
        peso: 0,
        cantCJ: 0,
        transportista: item.transportista || '',
        isExtraService: true,
        paradas: []
      };

      nextAssignments[fecha].push(extraAssignmentRow);
    });

    persistAssignments(nextAssignments);

    // Sincronizar cada fecha afectada con savedRuteo y savedHistory
    let currentStoreState = { ...get(), transmittedAssignments: nextAssignments };
    affectedDates.forEach(f => {
      const rowsForF = nextAssignments[f] || [];
      const synced = syncHistoryAndSavedForDate(currentStoreState, f, rowsForF);
      currentStoreState = { ...currentStoreState, ...synced };
    });

    set({
      transmittedAssignments: nextAssignments,
      savedRuteoByDate: currentStoreState.savedRuteoByDate,
      savedHistoryList: currentStoreState.savedHistoryList
    });

    toast.success(`¡${extraRows.length} servicio(s) extra(s) guardado(s) y transmitido(s) a Histórico de Disponibilización!`);
    return true;
  }
}));
