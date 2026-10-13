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

// Paradas de muestra basadas en los datos reales del usuario
const SAMPLE_PARADAS_1401 = [
  { secuencia: 1, destino: '2653 - SBARRO MALL FLORIDA CENTER', direccion: 'AV. DEPARTAMENTAL 555', comuna: 'LA FLORIDA', horaIni: '800', horaFin: '1100', volumen: 0.1922, peso: 94.2, cantCJ: 6 },
  { secuencia: 1, destino: '2653 - SBARRO MALL FLORIDA CENTER', direccion: 'AV. DEPARTAMENTAL 555', comuna: 'LA FLORIDA', horaIni: '800', horaFin: '1100', volumen: 0.1278, peso: 45.8, cantCJ: 5 },
  { secuencia: 1, destino: '2653 - SBARRO MALL FLORIDA CENTER', direccion: 'AV. DEPARTAMENTAL 555', comuna: 'LA FLORIDA', horaIni: '800', horaFin: '1100', volumen: 0.025, peso: 5, cantCJ: 5 }
];

const SAMPLE_PARADAS_1611 = [
  { secuencia: 1, destino: 'BRESLER PLAZA SUR 2', direccion: 'AV. PRESIDENTE JORGE ALESSANDR', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1100', volumen: 0.4397, peso: 257.328, cantCJ: 49 },
  { secuencia: 2, destino: 'BRESLER 1 (PASEO SAN BERNARDO)', direccion: 'EYZAGUIRRE 650 LOCAL T 16', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1130', volumen: 0.4017, peso: 229.075, cantCJ: 45 },
  { secuencia: 2, destino: 'BRESLER 2 (PASEO SAN BERNARDO)', direccion: 'EYZAGUIRRE 650 LOCAL P 8', comuna: 'SAN BERNARDO', horaIni: '900', horaFin: '1130', volumen: 0.514, peso: 219.573, cantCJ: 44 },
  { secuencia: 3, destino: 'SALA DE VENTAS SAN BERNARDO', direccion: 'AV LAS ACACIAS 1100', comuna: 'SAN BERNARDO', horaIni: '1000', horaFin: '1600', volumen: 0.2253, peso: 37.365, cantCJ: 24 },
  { secuencia: 4, destino: 'BRESLER PLAZA TOBALABA', direccion: 'AV CAMILO HENRIQUEZ 3692', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '2000', volumen: 0.6263, peso: 358.275, cantCJ: 72 },
  { secuencia: 5, destino: 'BRESLER PLAZA TOBALABA 2', direccion: 'AV. CAMILO HENRIQUEZ 3692 FC-2', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '1100', volumen: 0.3212, peso: 168.899, cantCJ: 33 },
  { secuencia: 5, destino: 'SAN FRANCISCO PLAZA TOBALABA', direccion: 'AV. CAMILO HENRIQUEZ 3692 C-11', comuna: 'PUENTE ALTO', horaIni: '900', horaFin: '1100', volumen: 0.5119, peso: 256.747, cantCJ: 56 }
];

const SAMPLE_PARADAS_1612 = [
  { secuencia: 1, destino: 'PAL MALL SPORT', direccion: 'LAS CONDES 13451 LOCAL AC11', comuna: 'LAS CONDES', horaIni: '800', horaFin: '1000', volumen: 0.2294, peso: 56.104, cantCJ: 36 },
  { secuencia: 2, destino: 'SAN FRANCISCO PLAZA NORTE', direccion: 'AVENIDA AMÉRICA VESPUCIO N° 17', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1100', volumen: 0.6462, peso: 337.407, cantCJ: 74 },
  { secuencia: 2, destino: 'SAN FRANCISCO PLAZA NORTE 2', direccion: 'AVENIDA AMÉRICA VESPUCIO N° 17', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1100', volumen: 0.9739, peso: 465.423, cantCJ: 94 },
  { secuencia: 3, destino: 'BRESLER 1 (PLAZA NORTE)', direccion: 'AMERICO VESPUCIO 1737', comuna: 'HUECHURABA', horaIni: '900', horaFin: '1200', volumen: 0.3253, peso: 191.808, cantCJ: 36 },
  { secuencia: 4, destino: 'PAL PLAZA NORTE', direccion: 'VESPUCIO 1737 LOCAL MP1038', comuna: 'HUECHURABA', horaIni: '800', horaFin: '1330', volumen: 0.4236, peso: 121.462, cantCJ: 63 },
  { secuencia: 5, destino: 'ELR PLAZA NORTE', direccion: 'AV AMERICO VESPUCIO 1737', comuna: 'HUECHURABA', horaIni: '1100', horaFin: '1500', volumen: 0.8076, peso: 254.234, cantCJ: 81 },
  { secuencia: 6, destino: 'CORY PANORAMICO', direccion: 'GUARDIA VIEJA 116 LOCAL 138', comuna: 'PROVIDENCIA', horaIni: '1000', horaFin: '1400', volumen: 0.1604, peso: 38.39, cantCJ: 16 }
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

const loadPersistedAssignments = () => {
  try {
    const saved = localStorage.getItem('keylogistics_transmitted_assignments');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Object.keys(parsed).length > 0) return parsed;
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
    return saved ? JSON.parse(saved) : DEFAULT_SAMPLE_ASSIGNMENTS;
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
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Error loading history from localStorage:', e);
    return [];
  }
};

const persistHistory = (data) => {
  try {
    localStorage.setItem('keylogistics_saved_history_list', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving history to localStorage:', e);
  }
};

export const usePlanningStore = create((set, get) => ({
  // Raw data from Sheet1
  rawRows: [],
  fileName: '',
  uploadDate: null,

  // Transformed dynamic table (Hoja1 / Ruteo)
  transformedRoutes: [],
  isTransformed: false,

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
            paradas: []
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

        g.paradas.push({
          id: `${ruta}-${idx}`,
          secuencia,
          destino,
          direccion,
          comuna,
          horaIni,
          horaFin,
          cantCJ,
          peso,
          volumen,
          transportista
        });
      });

      const transformed = Array.from(groups.values()).map((g, index) => ({
        id: `trans-${g.ruta}-${index}`,
        ruta: g.ruta,
        nombreRuta: g.nombreRuta,
        fecha: g.fecha,
        transportista: Array.from(g.transportistasSet).filter(Boolean).join(', ') || 'Sin Transportista',
        recuentoDestino: g.destinosSet.size,
        sumaVolumen: Number(g.sumaVolumen.toFixed(4)),
        sumaPeso: Number(g.sumaPeso.toFixed(2)),
        sumaCantCJ: Math.round(g.sumaCantCJ),
        paradas: g.paradas
      }));

      transformed.sort((a, b) => {
        const numA = parseInt(a.ruta, 10);
        const numB = parseInt(b.ruta, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.ruta.localeCompare(b.ruta);
      });

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
        transportista: route.transportista || '',
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
          transportista: route.transportista || old.transportista || '',
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

    const clonedRows = JSON.parse(JSON.stringify(rows));

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
