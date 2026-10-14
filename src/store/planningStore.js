import { create } from 'zustand';
import { toast } from 'sonner';

// Helper to format/normalize date string to DD-MM-YYYY
export const normalizeDate = (rawDate) => {
  if (!rawDate) return '';
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.split('T')[0].split(' ')[0].split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(trimmed)) {
      const parts = trimmed.split(' ')[0].split(/[-/]/);
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
    return trimmed;
  }
  if (typeof rawDate === 'number') {
    const dateObj = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const year = dateObj.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
  if (rawDate instanceof Date) {
    const day = String(rawDate.getDate()).padStart(2, '0');
    const month = String(rawDate.getMonth() + 1).padStart(2, '0');
    const year = rawDate.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(rawDate);
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
    '1835': 'T310'
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
            paradas: (r.paradas || []).map(p => ({
              ...p,
              ambiente: p.ambiente || (r.ruta === '1401' ? 'C' : 'S')
            }))
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
          transportista: ensureRowTransportista(r)
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

const loadPersistedHistory = () => {
  try {
    const saved = localStorage.getItem('keylogistics_saved_history_list');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(h => ({
        ...h,
        rows: (h.rows || []).map(r => ({
          ...r,
          transportista: ensureRowTransportista(r)
        }))
      }));
    }
    return [];
  } catch (e) {
    console.error('Error loading history from localStorage:', e);
    return [];
  }
};

const createInitialTransformedRoutes = () => {
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return createInitialTransformedRoutes();
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

export const usePlanningStore = create((set, get) => ({
  // Raw data from Sheet1
  rawRows: [],
  fileName: '',
  uploadDate: null,

  // Transformed dynamic table (Hoja1 / Ruteo)
  transformedRoutes: loadPersistedTransformedRoutes(),
  isTransformed: true,

  // Transmitted data into Disponibilización: { [fecha]: Array<AssignmentRow> }
  transmittedAssignments: loadPersistedAssignments(),
  selectedDisponibilizarDate: '14-10-2026',

  // Guardados definitivos de Disponibilización transmitidos a Ruteo: { [fecha]: Array<AssignmentRow> }
  savedRuteoByDate: loadPersistedSavedRuteo(),
  selectedRuteoDate: '14-10-2026',

  // Historial de guardados para "Histórico Disponibilización"
  savedHistoryList: loadPersistedHistory(),

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
        const groupKey = `${ruta}:::${nombreRuta || 'Sin Nombre'}`;

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

        return {
          id: `trans-${g.ruta}-${index}`,
          ruta: g.ruta,
          nombreRuta: g.nombreRuta,
          fecha: g.fecha,
          transportista: Array.from(g.transportistasSet).filter(Boolean).join(', ') || 'Sin Transportista',
          ambientes: Array.from(ambientesSet),
          recuentoDestino: g.destinosSet.size,
          sumaVolumen: Number(g.sumaVolumen.toFixed(4)),
          sumaPeso: Number(g.sumaPeso.toFixed(2)),
          sumaCantCJ: Math.round(g.sumaCantCJ),
          paradas: sortedParadas
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
        (a) => a.ruta === route.ruta && a.cliente === route.nombreRuta
      );

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
        cliente: route.nombreRuta,
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
          cliente: route.nombreRuta,
          transportista: route.transportista || old.transportista || ensureRowTransportista(route),
          paradas: route.paradas || old.paradas || []
        };
      } else {
        newAssignmentsByDate[fecha].push(assignmentRow);
      }

      totalTransmitted++;
    });

    persistAssignments(newAssignmentsByDate);

    const dates = Object.keys(newAssignmentsByDate);
    const targetDate = transformedRoutes[0]?.fecha || dates[0] || '';

    set({
      transmittedAssignments: newAssignmentsByDate,
      selectedDisponibilizarDate: targetDate
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
        newAssignmentsByDate[fecha][existingIdx] = {
          ...old,
          locales: route.recuentoDestino,
          m3: route.sumaVolumen,
          peso: route.sumaPeso || old.peso || 0,
          cantCJ: route.sumaCantCJ || old.cantCJ || 0,
          cliente: route.nombreRuta || old.cliente,
          transportista: route.transportista || old.transportista || ensureRowTransportista(route),
          paradas: route.paradas || old.paradas || []
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

    set({
      transmittedAssignments: newAssignmentsByDate,
      transformedRoutes: nextTransformed,
      selectedDisponibilizarDate: targetDate
    });

    toast.success(`Transmitido a Disponibilización: ${totalAdded} ruta(s) nueva(s), ${totalUpdated} actualizada(s). El resto se mantuvo intacto.`);
    return true;
  },

  // Set selected date for Disponibilización
  setSelectedDisponibilizarDate: (date) => {
    set({ selectedDisponibilizarDate: date });
  },

  // Set selected date for Ruteo final view
  setSelectedRuteoDate: (date) => {
    set({ selectedRuteoDate: date });
  },

  // Update a single field in an assignment row
  updateAssignmentField: (fecha, rowId, field, value) => {
    set((state) => {
      const rows = state.transmittedAssignments[fecha] || [];
      const updatedRows = rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r));
      const updatedMap = { ...state.transmittedAssignments, [fecha]: updatedRows };
      persistAssignments(updatedMap);
      return { transmittedAssignments: updatedMap };
    });
  },

  // Batch update fields on multiple rows
  batchUpdateRows: (fecha, rowIds, updates) => {
    set((state) => {
      const rows = state.transmittedAssignments[fecha] || [];
      const idSet = new Set(rowIds);
      const updatedRows = rows.map((r) => (idSet.has(r.id) ? { ...r, ...updates } : r));
      const updatedMap = { ...state.transmittedAssignments, [fecha]: updatedRows };
      persistAssignments(updatedMap);
      return { transmittedAssignments: updatedMap };
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

  // GUARDAR DISPONIBILIZACIÓN: Transmite devuelta al sub-menú "Ruteo" y guarda en histórico
  saveDisponibilizacion: (fecha) => {
    const { transmittedAssignments, savedRuteoByDate, savedHistoryList } = get();
    const rows = transmittedAssignments[fecha] || [];

    if (rows.length === 0) {
      toast.warning(`No hay datos en la fecha ${fecha} para guardar.`);
      return false;
    }

    const clonedRows = JSON.parse(JSON.stringify(rows)).map(r => ({
      ...r,
      transportista: ensureRowTransportista(r)
    }));

    const updatedSaved = {
      ...savedRuteoByDate,
      [fecha]: clonedRows
    };

    // Calculate totals for history
    const totalServicios = clonedRows.length;
    const totalM3 = clonedRows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(2);
    const totalLocales = clonedRows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
    const totalPeso = clonedRows.reduce((acc, r) => acc + (parseFloat(r.peso) || 0), 0).toFixed(2);
    const totalCajas = clonedRows.reduce((acc, r) => acc + (parseInt(r.cantCJ, 10) || 0), 0);

    const historyEntry = {
      id: `hist-${Date.now()}`,
      fecha,
      savedAt: new Date().toLocaleString('es-CL'),
      totalServicios,
      totalM3,
      totalLocales,
      totalPeso,
      totalCajas,
      rows: clonedRows
    };

    // Replace if same fecha already exists in history or prepend
    const filteredHistory = savedHistoryList.filter(h => h.fecha !== fecha);
    const updatedHistory = [historyEntry, ...filteredHistory];

    persistSavedRuteo(updatedSaved);
    persistHistory(updatedHistory);

    set({
      savedRuteoByDate: updatedSaved,
      savedHistoryList: updatedHistory,
      selectedRuteoDate: fecha
    });

    toast.success(`¡Disponibilización del ${fecha} guardada y transmitida a Ruteo!`);
    return true;
  }
}));
