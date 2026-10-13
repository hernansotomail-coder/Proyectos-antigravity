import { create } from 'zustand';
import { toast } from 'sonner';

// Helper to format/normalize date string to DD-MM-YYYY
export const normalizeDate = (rawDate) => {
  if (!rawDate) return '';
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    // Case: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.split('T')[0].split(' ')[0].split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    // Case: DD-MM-YYYY or DD/MM/YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(trimmed)) {
      const parts = trimmed.split(' ')[0].split(/[-/]/);
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
    return trimmed;
  }
  // Case: Excel serial number
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

// Initial state from localStorage if available
const loadPersistedAssignments = () => {
  try {
    const saved = localStorage.getItem('keylogistics_transmitted_assignments');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.error('Error loading transmitted assignments from localStorage:', e);
    return {};
  }
};

const persistAssignments = (data) => {
  try {
    localStorage.setItem('keylogistics_transmitted_assignments', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving transmitted assignments to localStorage:', e);
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
  selectedDisponibilizarDate: '',

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
        // Try multiple possible column casings
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

        const groupKey = `${ruta}:::${nombreRuta || 'Sin Nombre'}`;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            ruta,
            nombreRuta: nombreRuta || `Ruta ${ruta}`,
            fecha: fecha || 'Sin Fecha',
            destinosSet: new Set(),
            sumaVolumen: 0,
            sumaPeso: 0,
            sumaCantCJ: 0,
            paradas: []
          });
        }

        const g = groups.get(groupKey);
        if (destino) g.destinosSet.add(destino);
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
          volumen
        });
      });

      const transformed = Array.from(groups.values()).map((g, index) => ({
        id: `trans-${g.ruta}-${index}`,
        ruta: g.ruta,
        nombreRuta: g.nombreRuta,
        fecha: g.fecha,
        recuentoDestino: g.destinosSet.size,
        sumaVolumen: Number(g.sumaVolumen.toFixed(4)),
        sumaPeso: Number(g.sumaPeso.toFixed(2)),
        sumaCantCJ: Math.round(g.sumaCantCJ),
        paradas: g.paradas
      }));

      // Sort naturally by ruta
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

    // Group transformed routes by Fecha
    transformedRoutes.forEach((route) => {
      const fecha = route.fecha || 'Sin Fecha';
      if (!newAssignmentsByDate[fecha]) {
        newAssignmentsByDate[fecha] = [];
      }

      // Check if this route already exists for this date, if so update/keep existing assignments
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
        n_vuelta: route.ruta, // N° de vuelta viene de "Ruta" de Hoja1
        tipo_servicio: 'Centralizado',
        ruta: route.ruta, // N° de Ruta
        cliente: route.nombreRuta, // Cliente viene de "Nombre Ruta"
        referencia: '',
        locales: route.recuentoDestino, // Recuento distinto de Destino
        m3: route.sumaVolumen // Suma de Volumen
      };

      if (existingIdx >= 0) {
        // Keep existing conductor/aux/camion if already assigned
        const old = newAssignmentsByDate[fecha][existingIdx];
        newAssignmentsByDate[fecha][existingIdx] = {
          ...old,
          locales: route.recuentoDestino,
          m3: route.sumaVolumen,
          n_vuelta: route.ruta,
          cliente: route.nombreRuta
        };
      } else {
        newAssignmentsByDate[fecha].push(assignmentRow);
      }

      totalTransmitted++;
    });

    // Save and persist
    persistAssignments(newAssignmentsByDate);

    // Pick first available date as default selected
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

  // Batch update fields on multiple rows (e.g. multi-selection assignment)
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

  // Assign staff to selected rows with automatic RUT autocomplete
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

  // Assign truck to selected rows with automatic tipo_equipo autocomplete
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

  // Clear specific assignment slot from selected rows
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
    }

    get().batchUpdateRows(fecha, rowIds, updates);
    toast.success(`Asignación limpiada en ${rowIds.length} fila(s)`);
  }
}));
