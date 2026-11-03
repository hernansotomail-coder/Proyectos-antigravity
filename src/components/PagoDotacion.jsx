import React, { useState, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Trash2, Plus, 
  Search, Filter, Download, DollarSign, Calendar, Truck, 
  Users, Edit3, X, RefreshCw, FileText, ArrowUpDown,
  TrendingUp, TrendingDown, Award, Sparkles, Send,
  ChevronRight, Layers, FileSpreadsheet
} from 'lucide-react';
import { Button } from './ui/Button';
import { useStaffStore } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { usePlanningStore, normalizeDate, parseDateStrToTimestamp } from '../store/planningStore';
import { 
  usePagoDotacionStore, 
  getPeriodFromDate, 
  cleanRut, 
  cleanStr 
} from '../store/pagoDotacionStore';
import { ALL_OPERACIONES, ROUTE_OPERATIONS_MAP, canonicalizeOperation } from '../data/operacionesMaster';

// 28 Columnas oficiales requeridas para formato Colectivo
export const OFFICIAL_PAYMENT_COLUMNS = [
  'Periodo', 'Fecha Despacho', 'Cont Cond1', 'Tipo Cond1', 'Cond1',
  'Rut Cond1', 'Nom Cond1', 'Rutas', 'Transportistas', 'Owners',
  'Linea Negocio', 'regiones', 'Tipo Pago', 'Tipo Calculo', 'Segunda Vuelta',
  'Centralizado', 'Tipo Equipo', 'Codigo Equipo', 'Total Puntos Viaje',
  'Total M3Viaje', 'Total Cajas Viaje', 'Valor Punto Conductor',
  'Valor Punto Auxiliar', 'Valor Ruta', 'Valor Destino Cond1',
  'Pago Cond1', 'Tiempo Espera Cond1', 'Total'
];

export const SERVICE_TYPE_OPTIONS = [
  'Ruta',
  'Retiro camión',
  'Servicio de taller',
  'Servicio de vulcanización',
  'Traspasos',
  'Apoyo Centro',
  'SPID',
  'Otro'
];

// Formato de moneda chilena ($ X.XXX.XXX)
const formatCLP = (amount) => {
  const num = Number(amount) || 0;
  return '$' + Math.round(num).toLocaleString('es-CL');
};

// Formato en Millones ($XX.X MM)
const formatMM = (amount) => {
  const num = Number(amount) || 0;
  return '$' + (num / 1000000).toFixed(2) + ' MM';
};

// Parsear fecha serial de Excel o texto a DD-MM-YYYY
function parseExcelDate(val) {
  if (typeof val === 'number' && val > 30000 && val < 65000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
  return normalizeDate(val);
}

export default function PagoDotacion() {
  const [activeTab, setActiveTab] = useState('dashboard'); 
  // 'dashboard' | 'contratos' | 'excel' | 'manual'

  // Stores
  const { staffList, fetchStaff } = useStaffStore();
  const { attendanceList, fetchAttendanceByDateRange } = useAttendanceStore();
  const { transmittedAssignments, fetchHistoricalAssignments } = usePlanningStore();
  const { 
    paymentsList, 
    transmittedTripsList,
    fetchPayments, 
    addBatchPayments, 
    addManualPayment, 
    addTransmittedTrip,
    updateTransmittedTrip,
    deleteTransmittedTrip,
    transmitRecords,
    updatePayment, 
    deletePayment, 
    isLoading 
  } = usePagoDotacionStore();

  useEffect(() => {
    fetchStaff();
    fetchPayments();
    if (fetchHistoricalAssignments) {
      fetchHistoricalAssignments();
    }
  }, [fetchStaff, fetchPayments, fetchHistoricalAssignments]);

  // Mapa de dotación para cruce rápido con Asistencia / StaffList
  const staffMapByRut = useMemo(() => {
    const map = new Map();
    (staffList || []).forEach(s => {
      const cRut = cleanRut(s.rut);
      if (cRut) {
        map.set(cRut, s);
      }
    });
    return map;
  }, [staffList]);

  // =========================================================================
  // SECCIÓN 1: PANTALLA PRINCIPAL (3.1 - 3.6)
  // Gráfico en MM por periodo, KPIs dinámicos, Ranking Top 5, Filtros y Comparador
  // =========================================================================
  const [filterPeriodo, setFilterPeriodo] = useState('');
  const [filterConductor, setFilterConductor] = useState('');
  const [filterAuxiliar, setFilterAuxiliar] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterServiceType, setFilterServiceType] = useState('');

  // Modo Comparación entre dos periodos (Requisito 3.6)
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [comparePeriodA, setComparePeriodA] = useState('');
  const [comparePeriodB, setComparePeriodB] = useState('');

  // Modales de edición
  const [editingPayment, setEditingPayment] = useState(null);
  const [editMontoValue, setEditMontoValue] = useState('');

  // Periodos únicos detectados en paymentsList usando la regla oficial (21 al 20)
  const availablePeriodos = useMemo(() => {
    const periodMap = new Map();
    paymentsList.forEach(p => {
      const info = getPeriodFromDate(p.fechaDespacho || p.fecha);
      if (info && info.key) {
        if (!periodMap.has(info.key)) {
          periodMap.set(info.key, info);
        }
      } else if (p.periodo) {
        const key = p.periodo;
        if (!periodMap.has(key)) {
          periodMap.set(key, { key, label: key, shortLabel: key });
        }
      }
    });
    return Array.from(periodMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [paymentsList]);

  // Lista única de Conductores y Auxiliares para filtros
  const { allConductores, allAuxiliares } = useMemo(() => {
    const condSet = new Map();
    const auxSet = new Map();

    paymentsList.forEach(p => {
      const rut = cleanRut(p.rutCond1 || p.rut);
      const nom = cleanStr(p.nomCond1 || p.nombre || p.cond1);
      const rol = cleanStr(p.tipoCond1 || p.rol);

      if (rol.toLowerCase().includes('auxiliar')) {
        if (rut || nom) auxSet.set(rut || nom, { rut, name: nom });
      } else {
        if (rut || nom) condSet.set(rut || nom, { rut, name: nom });
      }
    });

    return {
      allConductores: Array.from(condSet.values()).sort((a, b) => a.name.localeCompare(b.name)),
      allAuxiliares: Array.from(auxSet.values()).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [paymentsList]);

  // Datos agregados por periodo para el gráfico en MM (Requisito 3.1)
  const periodsChartData = useMemo(() => {
    const agg = {};
    paymentsList.forEach(p => {
      const info = getPeriodFromDate(p.fechaDespacho || p.fecha);
      const pKey = info?.key || p.periodo || 'Sin Periodo';
      const pLabel = info?.label || p.periodo || 'Sin Periodo';
      const pShort = info?.shortLabel || pKey;

      if (!agg[pKey]) {
        agg[pKey] = {
          key: pKey,
          label: pLabel,
          shortLabel: pShort,
          totalMonto: 0,
          tripsSet: new Set()
        };
      }
      const monto = parseFloat(p.total) || 0;
      agg[pKey].totalMonto += monto;
      const tripKey = `${p.fechaDespacho}_${cleanRut(p.rutCond1 || p.rut) || p.nomCond1}_${p.rutas || p.ruta}`;
      agg[pKey].tripsSet.add(tripKey);
    });

    const list = Object.values(agg).map(item => ({
      ...item,
      totalViajes: item.tripsSet.size,
      montoMM: item.totalMonto / 1000000
    }));

    return list.sort((a, b) => a.key.localeCompare(b.key));
  }, [paymentsList]);

  const maxChartMM = useMemo(() => {
    const max = Math.max(...periodsChartData.map(d => d.montoMM), 1);
    return max * 1.15; // 15% de margen superior
  }, [periodsChartData]);

  // Pagos filtrados reactivos en la vista activa
  const filteredPayments = useMemo(() => {
    return paymentsList.filter(item => {
      const pInfo = getPeriodFromDate(item.fechaDespacho || item.fecha);
      const itemPeriodKey = pInfo?.key || item.periodo;

      if (filterPeriodo && itemPeriodKey !== filterPeriodo && item.periodo !== filterPeriodo) {
        return false;
      }

      if (filterConductor) {
        const itemRut = cleanRut(item.rutCond1 || item.rut);
        const itemNom = cleanStr(item.nomCond1 || item.nombre);
        if (itemRut !== filterConductor && itemNom !== filterConductor) {
          return false;
        }
      }

      if (filterAuxiliar) {
        const itemRut = cleanRut(item.rutCond1 || item.rut);
        const itemNom = cleanStr(item.nomCond1 || item.nombre);
        if (itemRut !== filterAuxiliar && itemNom !== filterAuxiliar) {
          return false;
        }
      }

      if (filterServiceType && item.tipoServicio !== filterServiceType) {
        return false;
      }

      if (filterSearch.trim()) {
        const term = filterSearch.toLowerCase();
        const fullText = [
          item.fechaDespacho,
          item.rutCond1,
          item.nomCond1,
          item.rutas,
          item.transportistas,
          item.tipoServicio,
          item.periodo,
          item.contratoOrigen
        ].filter(Boolean).join(' ').toLowerCase();

        if (!fullText.includes(term)) return false;
      }

      return true;
    });
  }, [paymentsList, filterPeriodo, filterConductor, filterAuxiliar, filterServiceType, filterSearch]);

  // KPIs Dinámicos (Requisitos 3.2, 3.3, 3.4)
  const kpiData = useMemo(() => {
    const totalMonto = filteredPayments.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0);

    // 3.2: Total de viajes en base a cantidad de rutas por día (relación entre fecha con conductor/auxiliar)
    const uniqueTripsSet = new Set(
      filteredPayments.map(p => `${p.fechaDespacho}_${cleanRut(p.rutCond1 || p.rut) || p.nomCond1}_${p.rutas || p.ruta}`)
    );
    const totalViajes = uniqueTripsSet.size;

    // 3.3: Total Pagado Periodo Anterior y Fluctuación
    let previousPeriodTotal = 0;
    let previousPeriodLabel = '';
    let fluctuationPercent = 0;

    // Determinar periodo actual de referencia
    let activePKey = filterPeriodo;
    if (!activePKey && availablePeriodos.length > 0) {
      activePKey = availablePeriodos[0].key;
    }

    if (activePKey && availablePeriodos.length > 1) {
      const idx = availablePeriodos.findIndex(p => p.key === activePKey);
      if (idx >= 0 && idx + 1 < availablePeriodos.length) {
        const prevP = availablePeriodos[idx + 1];
        previousPeriodLabel = prevP.label;
        const prevPayments = paymentsList.filter(p => {
          const info = getPeriodFromDate(p.fechaDespacho || p.fecha);
          return (info?.key === prevP.key) || (p.periodo === prevP.key);
        });
        previousPeriodTotal = prevPayments.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0);
        if (previousPeriodTotal > 0) {
          fluctuationPercent = ((totalMonto - previousPeriodTotal) / previousPeriodTotal) * 100;
        }
      }
    }

    return {
      totalMonto,
      totalViajes,
      previousPeriodTotal,
      previousPeriodLabel,
      fluctuationPercent
    };
  }, [filteredPayments, filterPeriodo, availablePeriodos, paymentsList]);

  // Comparador de Dos Periodos (Requisito 3.6)
  const comparisonData = useMemo(() => {
    if (!isCompareMode || !comparePeriodA || !comparePeriodB) return null;

    const getPeriodStats = (targetKey) => {
      const rows = paymentsList.filter(p => {
        const info = getPeriodFromDate(p.fechaDespacho || p.fecha);
        return (info?.key === targetKey) || (p.periodo === targetKey);
      });
      const monto = rows.reduce((acc, r) => acc + (parseFloat(r.total) || 0), 0);
      const trips = new Set(rows.map(r => `${r.fechaDespacho}_${cleanRut(r.rutCond1 || r.rut) || r.nomCond1}_${r.rutas || r.ruta}`)).size;
      const countStaff = new Set(rows.map(r => cleanRut(r.rutCond1 || r.rut) || r.nomCond1)).size;
      return { monto, trips, countStaff, rowsCount: rows.length };
    };

    const statsA = getPeriodStats(comparePeriodA);
    const statsB = getPeriodStats(comparePeriodB);

    const diffMonto = statsB.monto - statsA.monto;
    const pctMonto = statsA.monto > 0 ? (diffMonto / statsA.monto) * 100 : 0;

    const diffTrips = statsB.trips - statsA.trips;
    const pctTrips = statsA.trips > 0 ? (diffTrips / statsA.trips) * 100 : 0;

    return {
      periodA: availablePeriodos.find(p => p.key === comparePeriodA)?.label || comparePeriodA,
      periodB: availablePeriodos.find(p => p.key === comparePeriodB)?.label || comparePeriodB,
      statsA,
      statsB,
      diffMonto,
      pctMonto,
      diffTrips,
      pctTrips
    };
  }, [isCompareMode, comparePeriodA, comparePeriodB, paymentsList, availablePeriodos]);

  // 3.5: Ranking Top 5 de Conductores y Auxiliares por Periodo
  const { topConductores, topAuxiliares } = useMemo(() => {
    const condMap = new Map();
    const auxMap = new Map();

    filteredPayments.forEach(p => {
      const rut = cleanRut(p.rutCond1 || p.rut);
      const nom = cleanStr(p.nomCond1 || p.nombre || p.cond1) || 'Sin Nombre';
      const rol = cleanStr(p.tipoCond1 || p.rol);
      const monto = parseFloat(p.total) || 0;
      const tripKey = `${p.fechaDespacho}_${p.rutas || p.ruta}`;

      const isAux = rol.toLowerCase().includes('auxiliar');
      const targetMap = isAux ? auxMap : condMap;

      const key = rut || nom;
      if (!targetMap.has(key)) {
        targetMap.set(key, {
          rut,
          name: nom,
          role: isAux ? 'Auxiliar' : 'Conductor',
          totalMonto: 0,
          tripsSet: new Set()
        });
      }
      const entry = targetMap.get(key);
      entry.totalMonto += monto;
      entry.tripsSet.add(tripKey);
    });

    const formatTop = (map) => {
      return Array.from(map.values())
        .map(i => ({ ...i, totalViajes: i.tripsSet.size }))
        .sort((a, b) => b.totalMonto - a.totalMonto)
        .slice(0, 5);
    };

    return {
      topConductores: formatTop(condMap),
      topAuxiliares: formatTop(auxMap)
    };
  }, [filteredPayments]);

  // Exportar Master a Excel
  const handleExportMasterExcel = () => {
    if (filteredPayments.length === 0) {
      toast.warning('No hay datos para exportar.');
      return;
    }

    const exportRows = filteredPayments.map(p => ({
      'Periodo': p.periodo || '',
      'Fecha Despacho': p.fechaDespacho || '',
      'Cont Cond1': p.contCond1 || '',
      'Tipo Cond1': p.tipoCond1 || '',
      'Cond1': p.cond1 || '',
      'Rut Cond1': p.rutCond1 || '',
      'Nom Cond1': p.nomCond1 || '',
      'Rutas': p.rutas || '',
      'Transportistas': p.transportistas || '',
      'Total': p.total || 0,
      'Contrato Origen': p.contratoOrigen || p.origen || 'Excel'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pago Dotacion');
    XLSX.writeFile(wb, `Pago_Dotacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Archivo Excel descargado exitosamente');
  };

  // =========================================================================
  // SECCIÓN 2: CARGA DE CONTRATOS (3.7)
  // Contratos Colectivos + Contratos Antiguos (Contrato 13, 8 y 9) + Transmitir
  // =========================================================================
  const [loadedContractsBatch, setLoadedContractsBatch] = useState([]);
  const [loadedSummary, setLoadedSummary] = useState({
    colectivo: 0,
    contrato8: 0,
    contrato9: 0,
    contrato13: 0
  });
  const [isConfirmTransmitModalOpen, setIsConfirmTransmitModalOpen] = useState(false);

  // Parser para formato "Colectivo" (matching vía Rut Cond1)
  const processColectivoFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawJson.length === 0) {
          toast.error('El archivo Colectivo está vacío.');
          return;
        }

        // Buscar fila de encabezado
        let headerIdx = -1;
        for (let r = 0; r < Math.min(10, rawJson.length); r++) {
          const row = rawJson[r] || [];
          if (row.some(c => String(c).toLowerCase().includes('rut cond1') || String(c).toLowerCase().includes('fecha despacho'))) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx === -1) {
          toast.error('No se encontró el encabezado oficial en el archivo Colectivo.');
          return;
        }

        const headers = rawJson[headerIdx].map(h => String(h || '').trim());
        const parsedRows = [];

        for (let r = headerIdx + 1; r < rawJson.length; r++) {
          const row = rawJson[r];
          if (!row || row.length === 0) continue;

          const rowObj = {};
          headers.forEach((h, i) => {
            rowObj[h] = row[i];
          });

          const rawRut = rowObj['Rut Cond1'] || rowObj['RUT'] || '';
          const cRut = cleanRut(rawRut);
          if (!cRut) continue;

          const rawFecha = rowObj['Fecha Despacho'] || rowObj['Fecha'] || '';
          const normFecha = parseExcelDate(rawFecha);
          const nom = cleanStr(rowObj['Nom Cond1'] || rowObj['Cond1'] || rowObj['Nombre']);
          const tipoCond = cleanStr(rowObj['Tipo Cond1']) || 'Conductor';
          const rutas = cleanStr(rowObj['Rutas'] || rowObj['Ruta']);
          const totalVal = parseFloat(String(rowObj['Total'] || rowObj['Pago Cond1'] || 0).replace(/[^\d.-]/g, '')) || 0;

          // Cruce con Asistencia / StaffList
          const matchedStaff = staffMapByRut.get(cRut);
          const periodInfo = getPeriodFromDate(normFecha);

          parsedRows.push({
            id: `colectivo-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 4)}`,
            contratoOrigen: 'Colectivo',
            periodo: periodInfo.key,
            periodoLabel: periodInfo.label,
            fechaDespacho: normFecha,
            rutCond1: cRut,
            nomCond1: matchedStaff?.name || nom,
            tipoCond1: matchedStaff?.role || tipoCond,
            rutas,
            transportistas: cleanStr(rowObj['Transportistas']),
            total: totalVal,
            pagoCond1: totalVal,
            tipoServicio: 'Ruta',
            origen: 'Colectivo',
            matchedStaffInAttendance: !!matchedStaff
          });
        }

        setLoadedContractsBatch(prev => [...parsedRows, ...prev]);
        setLoadedSummary(prev => ({ ...prev, colectivo: prev.colectivo + parsedRows.length }));
        toast.success(`Contrato Colectivo cargado: ${parsedRows.length} registros listos.`);
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar el archivo Colectivo.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Parser para formato "Antiguo" (Contrato 8, 9, 13) (matching vía Rut)
  const processAntiguoFile = (file, contractType) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawJson.length === 0) {
          toast.error(`El archivo de ${contractType} está vacío.`);
          return;
        }

        // Buscar fila de encabezado
        let headerIdx = -1;
        for (let r = 0; r < Math.min(15, rawJson.length); r++) {
          const row = rawJson[r] || [];
          if (row.some(c => String(c).toLowerCase().includes('rut')) && 
              row.some(c => String(c).toLowerCase().includes('fecha'))) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx === -1) headerIdx = 4; // Fallback al índice 4 detectado en la plantilla

        const parsedRows = [];
        for (let r = headerIdx + 1; r < rawJson.length; r++) {
          const row = rawJson[r];
          if (!row || row.length === 0) continue;

          const rawFecha = row[0];
          const rawRut = row[1];
          const rawNombre = row[2];

          // Validar que la fila contenga un RUT válido
          if (!rawRut || !String(rawRut).includes('-')) continue;

          const cRut = cleanRut(rawRut);
          const normFecha = parseExcelDate(rawFecha);
          const tipoPunto = cleanStr(row[4]);
          const ruta = cleanStr(row[6]);

          const viajes = parseFloat(row[16]) || 0;
          const espera = parseFloat(row[17]) || 0;
          const bono2v = parseFloat(row[18]) || 0;
          const dif = parseFloat(row[19]) || 0;

          let totalVal = viajes + espera + bono2v + dif;
          if (totalVal === 0 && viajes > 0) totalVal = viajes;

          // Cruce con Asistencia / StaffList
          const matchedStaff = staffMapByRut.get(cRut);
          const periodInfo = getPeriodFromDate(normFecha);

          parsedRows.push({
            id: `${contractType.toLowerCase()}-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 4)}`,
            contratoOrigen: contractType,
            periodo: periodInfo.key,
            periodoLabel: periodInfo.label,
            fechaDespacho: normFecha,
            rutCond1: cRut,
            nomCond1: matchedStaff?.name || cleanStr(rawNombre),
            tipoCond1: matchedStaff?.role || (tipoPunto.includes('Auxiliar') ? 'Auxiliar' : 'Conductor'),
            rutas: ruta || tipoPunto,
            tipoPunto,
            total: totalVal,
            pagoCond1: totalVal,
            tipoServicio: bono2v > 0 ? 'Segunda Vuelta' : 'Ruta',
            origen: contractType,
            matchedStaffInAttendance: !!matchedStaff
          });
        }

        setLoadedContractsBatch(prev => [...parsedRows, ...prev]);
        const summaryKey = contractType === 'Contrato 8' ? 'contrato8' 
                         : contractType === 'Contrato 9' ? 'contrato9' 
                         : 'contrato13';
        setLoadedSummary(prev => ({ ...prev, [summaryKey]: (prev[summaryKey] || 0) + parsedRows.length }));
        toast.success(`${contractType} cargado: ${parsedRows.length} registros listos.`);
      } catch (err) {
        console.error(err);
        toast.error(`Error al procesar el archivo ${contractType}.`);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Ejecutar Transmisión (Requisito 3.7)
  const handleConfirmTransmission = async () => {
    if (loadedContractsBatch.length === 0) return;

    const result = await transmitRecords({
      records: loadedContractsBatch,
      transmittedAssignments,
      staffList
    });

    setIsConfirmTransmitModalOpen(false);
    toast.success(
      `Transmisión completada: ${result.totalTransmitted} viajes conciliados con la Disponibilización de ${result.totalLoaded} cargados.`
    );

    // Limpiar lote temporal y navegar al detalle tipo Excel
    setLoadedContractsBatch([]);
    setLoadedSummary({ colectivo: 0, contrato8: 0, contrato9: 0, contrato13: 0 });
    setActiveTab('excel');
  };

  // =========================================================================
  // SECCIÓN 3: DETALLE DE VIAJES TRANSMITIDOS (VISTA EXCEL) (3.7)
  // Búsqueda por Conductor/Auxiliar, asignación de nuevos viajes y resaltado amarillo pastel
  // =========================================================================
  const [excelSelectedStaffRut, setExcelSelectedStaffRut] = useState('');
  const [excelSearchText, setExcelSearchText] = useState('');

  // Formulario para Asignar Nuevo Viaje Manual en la Vista Excel
  const [newTripForm, setNewTripForm] = useState({
    fecha: normalizeDate(new Date()) || '03-11-2026',
    staffRut: '',
    ruta: '',
    tipoServicio: 'Ruta',
    monto: ''
  });

  // Lista de personal con viajes transmitidos
  const transmittedStaffList = useMemo(() => {
    const map = new Map();
    transmittedTripsList.forEach(t => {
      const cRut = cleanRut(t.rutCond1);
      const name = cleanStr(t.nomCond1);
      const role = cleanStr(t.tipoCond1) || 'Conductor';
      if (cRut && !map.has(cRut)) {
        map.set(cRut, { rut: cRut, name, role });
      }
    });

    // Agregar también el resto de dotación activa de StaffList para permitir asignarles viajes
    staffList.filter(s => s.status === 'Activo').forEach(s => {
      const cRut = cleanRut(s.rut);
      if (cRut && !map.has(cRut)) {
        map.set(cRut, { rut: cRut, name: s.name, role: s.role });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [transmittedTripsList, staffList]);

  // Lista ordenada de viajes transmitidos según filtros
  // Los viajes se ordenan por fecha cronológicamente
  const displayedTransmittedTrips = useMemo(() => {
    let list = [...transmittedTripsList];

    if (excelSelectedStaffRut) {
      list = list.filter(t => cleanRut(t.rutCond1) === excelSelectedStaffRut);
    }

    if (excelSearchText.trim()) {
      const term = excelSearchText.toLowerCase();
      list = list.filter(t => {
        const full = [t.fechaDespacho, t.rutCond1, t.nomCond1, t.rutas, t.tipoServicio, t.contratoOrigen]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return full.includes(term);
      });
    }

    // Ordenamiento cronológico por fecha (Requisito 3.7: nuevos viajes suben a la posición de la fecha)
    return list.sort((a, b) => {
      const timeA = parseDateStrToTimestamp(a.fechaDespacho);
      const timeB = parseDateStrToTimestamp(b.fechaDespacho);
      return timeA - timeB;
    });
  }, [transmittedTripsList, excelSelectedStaffRut, excelSearchText]);

  // Manejador para Asignar Nuevo Viaje Manual en la Vista Excel
  const handleAddNewTransmittedTrip = async (e) => {
    e.preventDefault();
    const targetRut = excelSelectedStaffRut || newTripForm.staffRut;
    if (!targetRut) {
      toast.warning('Selecciona o busca el Conductor o Auxiliar al que deseas asignar el viaje.');
      return;
    }
    if (!newTripForm.ruta.trim() || !newTripForm.monto) {
      toast.warning('Por favor completa la Ruta y el Monto del viaje.');
      return;
    }

    const staffObj = transmittedStaffList.find(s => s.rut === targetRut) || staffMapByRut.get(targetRut);
    const montoNum = parseFloat(String(newTripForm.monto).replace(/[^\d.-]/g, '')) || 0;
    const normFecha = normalizeDate(newTripForm.fecha);
    const periodInfo = getPeriodFromDate(normFecha);

    const newTrip = {
      id: `manual-trans-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      fechaDespacho: normFecha,
      periodo: periodInfo.key,
      rutCond1: targetRut,
      nomCond1: staffObj?.name || 'Personal Asignado',
      tipoCond1: staffObj?.role || 'Conductor',
      rutas: newTripForm.ruta.trim(),
      tipoServicio: newTripForm.tipoServicio,
      total: montoNum,
      pagoCond1: montoNum,
      contratoOrigen: 'Asignación Manual',
      origen: 'Manual',
      isManuallyAssigned: true // Activa el resaltado amarillo pastel
    };

    await addTransmittedTrip(newTrip);

    // Limpiar campos de ruta y monto
    setNewTripForm(prev => ({
      ...prev,
      ruta: '',
      monto: ''
    }));
  };

  // Catálogo de rutas de briefing para autocompletar
  const briefingRouteSuggestions = useMemo(() => {
    const list = [];
    const seen = new Set();
    Object.values(ROUTE_OPERATIONS_MAP).forEach(item => {
      const label = `${item.ruta} (${item.denominacion || item.operacion})`;
      if (!seen.has(item.ruta)) {
        seen.add(item.ruta);
        list.push({ ruta: item.ruta, label });
      }
    });
    return list;
  }, []);

  return (
    <div className="bg-white p-5 md:p-7 rounded-2xl shadow-sm border border-slate-100 max-w-7xl mx-auto space-y-6">
      
      {/* Cabecera Principal */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
            <DollarSign size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Pago dotación</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Cálculo por periodos (21 a 20), carga masiva de contratos, transmisión con Disponibilización y detalle de viajes
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2">
          {paymentsList.length > 0 && (
            <Button
              type="button"
              onClick={handleExportMasterExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 rounded-xl cursor-pointer"
            >
              <Download size={14} />
              Exportar Todo ({filteredPayments.length})
            </Button>
          )}
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="flex space-x-2 border-b border-slate-200 overflow-x-auto pb-2 scrollbar-thin">
        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard & Gráficos ({paymentsList.length})
          {activeTab === 'dashboard' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>

        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'contratos' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('contratos')}
        >
          📑 Carga de Contratos (Colectivo / Antiguos)
          {activeTab === 'contratos' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>

        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'excel' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('excel')}
        >
          📋 Detalle de Viajes Transmitidos (Vista Excel) ({transmittedTripsList.length})
          {activeTab === 'excel' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: DASHBOARD & GRÁFICOS (3.1 - 3.6) */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">

          {/* Barra de Filtros y Modo Comparativo */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
              {/* Búsqueda General */}
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar por conductor, RUT, ruta..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Filtro por Periodo */}
              <div className="w-44">
                <select
                  value={filterPeriodo}
                  onChange={(e) => setFilterPeriodo(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                >
                  <option value="">Todos los periodos</option>
                  {availablePeriodos.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Conductor */}
              <div className="w-44">
                <select
                  value={filterConductor}
                  onChange={(e) => setFilterConductor(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="">Todos los Conductores</option>
                  {allConductores.map(c => (
                    <option key={c.rut || c.name} value={c.rut || c.name}>
                      {c.name} {c.rut ? `(${c.rut})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Auxiliar */}
              <div className="w-44">
                <select
                  value={filterAuxiliar}
                  onChange={(e) => setFilterAuxiliar(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="">Todos los Auxiliares</option>
                  {allAuxiliares.map(a => (
                    <option key={a.rut || a.name} value={a.rut || a.name}>
                      {a.name} {a.rut ? `(${a.rut})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {(filterSearch || filterPeriodo || filterConductor || filterAuxiliar) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterSearch('');
                    setFilterPeriodo('');
                    setFilterConductor('');
                    setFilterAuxiliar('');
                  }}
                  className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Botón Activar Comparación de 2 Periodos (3.6) */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setIsCompareMode(!isCompareMode);
                  if (!isCompareMode && availablePeriodos.length >= 2) {
                    setComparePeriodA(availablePeriodos[1].key);
                    setComparePeriodB(availablePeriodos[0].key);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isCompareMode 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ArrowUpDown size={13} />
                {isCompareMode ? 'Cerrar Comparador' : 'Comparar 2 Periodos'}
              </button>
            </div>
          </div>

          {/* Panel Comparador de Periodos (3.6) */}
          {isCompareMode && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-200 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                    <TrendingUp size={16} />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">
                    Comparador de Fluctuación entre Periodos
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Periodo Base:</span>
                  <select
                    value={comparePeriodA}
                    onChange={(e) => setComparePeriodA(e.target.value)}
                    className="py-1 px-2.5 text-xs bg-white border border-blue-300 rounded-lg font-bold"
                  >
                    {availablePeriodos.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>

                  <span className="text-xs font-black text-slate-400">vs</span>

                  <span className="text-xs font-bold text-slate-600">Periodo Comparado:</span>
                  <select
                    value={comparePeriodB}
                    onChange={(e) => setComparePeriodB(e.target.value)}
                    className="py-1 px-2.5 text-xs bg-white border border-blue-300 rounded-lg font-bold"
                  >
                    {availablePeriodos.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {comparisonData && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Monto Total Pagado</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-black text-slate-800">{formatCLP(comparisonData.statsB.monto)}</span>
                      <span className={`text-xs font-extrabold flex items-center gap-0.5 ${
                        comparisonData.diffMonto >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {comparisonData.diffMonto >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {comparisonData.pctMonto >= 0 ? '+' : ''}{comparisonData.pctMonto.toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Base: {formatCLP(comparisonData.statsA.monto)} (Dif: {formatCLP(comparisonData.diffMonto)})
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Total de Viajes</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-black text-slate-800">{comparisonData.statsB.trips} viajes</span>
                      <span className={`text-xs font-extrabold flex items-center gap-0.5 ${
                        comparisonData.diffTrips >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {comparisonData.diffTrips >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {comparisonData.pctTrips >= 0 ? '+' : ''}{comparisonData.pctTrips.toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Base: {comparisonData.statsA.trips} viajes (Dif: {comparisonData.diffTrips > 0 ? '+' : ''}{comparisonData.diffTrips})
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Dotación con Pago</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-black text-slate-800">{comparisonData.statsB.countStaff} personas</span>
                      <span className="text-xs text-slate-500 font-bold">
                        Base: {comparisonData.statsA.countStaff}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Variación de dotación entre periodos
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tarjetas KPI (Requisitos 3.2, 3.3, 3.4) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPI 1: Total Pagado */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Total Pagado</span>
              <p className="text-2xl font-black text-blue-900 mt-1">{formatCLP(kpiData.totalMonto)}</p>
              <span className="text-[10px] text-blue-500 font-medium">
                {filterPeriodo ? `Periodo ${filterPeriodo}` : 'Monto total acumulado'}
              </span>
            </div>

            {/* KPI 2: Total de Viajes (3.2) */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 rounded-2xl border border-emerald-100 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Total de Viajes</span>
              <p className="text-2xl font-black text-emerald-900 mt-1">{kpiData.totalViajes}</p>
              <span className="text-[10px] text-emerald-600 font-medium">
                Calculado por cantidad de rutas por día
              </span>
            </div>

            {/* KPI 3: Total Pagado Periodo Anterior (3.3 - reemplaza promedio por viaje) */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50/50 p-4 rounded-2xl border border-purple-100 shadow-2xs">
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">
                Total Pagado Periodo Anterior
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-2xl font-black text-purple-900">
                  {kpiData.previousPeriodTotal > 0 ? formatCLP(kpiData.previousPeriodTotal) : '$0'}
                </p>
                {kpiData.previousPeriodTotal > 0 && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                    kpiData.fluctuationPercent >= 0 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {kpiData.fluctuationPercent >= 0 ? '+' : ''}{kpiData.fluctuationPercent.toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="text-[10px] text-purple-500 font-medium">
                {kpiData.previousPeriodLabel ? `Comparado vs ${kpiData.previousPeriodLabel}` : 'Sin periodo anterior registrado'}
              </span>
            </div>
          </div>

          {/* Gráfico en MM por Periodo (3.1) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Evolución de Pago Dotación en Millones ($ MM) por Periodo
                </h3>
                <p className="text-xs text-slate-400">
                  Regla de corte oficial: Día 21 al día 20 (ej. 21 de octubre al 20 de noviembre = Periodo Noviembre)
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                  Total General: {formatMM(paymentsList.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0))}
                </span>
              </div>
            </div>

            {/* Contenedor del Gráfico de Barras SVG */}
            {periodsChartData.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No hay datos para graficar. Carga un archivo de contratos para comenzar.
              </div>
            ) : (
              <div className="pt-2">
                <div className="h-56 flex items-end justify-around gap-2 px-2 border-b border-slate-200">
                  {periodsChartData.map((item) => {
                    const heightPercent = maxChartMM > 0 ? (item.montoMM / maxChartMM) * 100 : 0;
                    const isSelected = filterPeriodo === item.key;

                    return (
                      <div
                        key={item.key}
                        onClick={() => setFilterPeriodo(isSelected ? '' : item.key)}
                        className="flex flex-col items-center flex-1 max-w-[90px] h-full justify-end group cursor-pointer"
                        title={`${item.label}: ${formatCLP(item.totalMonto)} (${item.totalViajes} viajes)`}
                      >
                        {/* Etiqueta flotante con el valor en MM */}
                        <span className={`text-[11px] font-black mb-1.5 transition-all ${
                          isSelected ? 'text-blue-700 font-extrabold scale-110' : 'text-slate-600 group-hover:text-blue-600'
                        }`}>
                          {item.montoMM.toFixed(2)} MM
                        </span>

                        {/* Barra */}
                        <div
                          style={{ height: `${Math.max(heightPercent, 6)}%` }}
                          className={`w-full max-w-[48px] rounded-t-xl transition-all duration-300 relative ${
                            isSelected
                              ? 'bg-gradient-to-t from-blue-700 to-indigo-600 shadow-md ring-2 ring-blue-300'
                              : 'bg-gradient-to-t from-blue-500 to-blue-400 hover:from-blue-600 hover:to-indigo-500'
                          }`}
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-t-xl transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Etiquetas de Eje X */}
                <div className="flex justify-around gap-2 px-2 pt-2 text-center">
                  {periodsChartData.map((item) => (
                    <div
                      key={item.key}
                      onClick={() => setFilterPeriodo(filterPeriodo === item.key ? '' : item.key)}
                      className="flex-1 max-w-[90px] cursor-pointer"
                    >
                      <span className={`text-[11px] font-black block truncate ${
                        filterPeriodo === item.key ? 'text-blue-700 underline' : 'text-slate-600 hover:text-blue-600'
                      }`}>
                        {item.shortLabel}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {item.totalViajes} vjs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ranking Top 5 de Conductores y Auxiliares (3.5) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Top 5 Conductores */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <Award size={16} />
                  </span>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Top 5 Conductores {filterPeriodo ? `(${filterPeriodo})` : 'General'}
                  </h4>
                </div>
                <span className="text-[10px] text-slate-400 font-bold">Por monto acumulado</span>
              </div>

              {topConductores.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Sin conductores en este periodo.</p>
              ) : (
                <div className="space-y-2">
                  {topConductores.map((c, idx) => (
                    <div 
                      key={c.rut || c.name}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                          idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                          idx === 1 ? 'bg-slate-300 text-slate-800' :
                          idx === 2 ? 'bg-amber-700/60 text-white' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="text-xs font-black text-slate-800 truncate">{c.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{c.rut || 'S/R'} • {c.totalViajes} viajes</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-blue-700">{formatCLP(c.totalMonto)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top 5 Auxiliares */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <Award size={16} />
                  </span>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Top 5 Auxiliares {filterPeriodo ? `(${filterPeriodo})` : 'General'}
                  </h4>
                </div>
                <span className="text-[10px] text-slate-400 font-bold">Por monto acumulado</span>
              </div>

              {topAuxiliares.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Sin auxiliares en este periodo.</p>
              ) : (
                <div className="space-y-2">
                  {topAuxiliares.map((a, idx) => (
                    <div 
                      key={a.rut || a.name}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                          idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                          idx === 1 ? 'bg-slate-300 text-slate-800' :
                          idx === 2 ? 'bg-amber-700/60 text-white' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="text-xs font-black text-slate-800 truncate">{a.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{a.rut || 'S/R'} • {a.totalViajes} viajes</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-indigo-700">{formatCLP(a.totalMonto)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabla de Registros Maestros */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Registros Maestros de Pago ({filteredPayments.length})
              </h3>
            </div>

            {filteredPayments.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                No hay pagos registrados para el filtro actual.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs max-h-96">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Fecha</th>
                      <th className="px-3 py-2.5">Periodo</th>
                      <th className="px-3 py-2.5">Ruta</th>
                      <th className="px-3 py-2.5">Personal</th>
                      <th className="px-3 py-2.5">RUT</th>
                      <th className="px-3 py-2.5">Rol</th>
                      <th className="px-3 py-2.5 text-right">Monto</th>
                      <th className="px-3 py-2.5 text-center">Contrato Origen</th>
                      <th className="px-3 py-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPayments.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2 font-bold text-slate-800">{row.fechaDespacho || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{row.periodo || '-'}</td>
                        <td className="px-3 py-2 font-black text-blue-700">{row.rutas || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.nomCond1 || row.nombre || '-'}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{row.rutCond1 || row.rut || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            row.tipoCond1 === 'Auxiliar' 
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {row.tipoCond1 || 'Conductor'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-700">
                          {formatCLP(row.total)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700">
                            {row.contratoOrigen || row.origen || 'Excel'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPayment(row);
                                setEditMontoValue(String(row.total || 0));
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Editar Monto"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`¿Eliminar registro de pago para ${row.nomCond1}?`)) {
                                  deletePayment(row.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: CARGA DE CONTRATOS COLECTIVOS Y ANTIGUOS (3.7) */}
      {/* ========================================================================= */}
      {activeTab === 'contratos' && (
        <div className="space-y-6">

          {/* Información y Reglas de Carga */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shrink-0 mt-0.5">
              <UploadCloud size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-800">
                Carga Masiva de Contratos Colectivos y Antiguos
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Carga los archivos de <strong>Contrato Colectivo</strong> y los 3 contratos antiguos (<strong>Contrato 8, 9 y 13</strong>). 
                El sistema cruzará automáticamente los RUT con la dotación de la <strong>Asistencia</strong>. 
                Luego presiona <strong>"Transmitir"</strong> para conciliar contra lo <strong>Disponibilizado</strong> en la plataforma.
              </p>
            </div>
          </div>

          {/* Tarjetas de Carga Independientes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Tarjeta 1: Contrato Colectivo */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <FileSpreadsheet size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">1. Contrato Colectivo</h3>
                    <p className="text-[11px] text-slate-400">Cruza con Asistencia por columna <strong>"Rut Cond1"</strong></p>
                  </div>
                </div>
                {loadedSummary.colectivo > 0 && (
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-black">
                    ✓ {loadedSummary.colectivo} cargados
                  </span>
                )}
              </div>

              <div className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl p-5 text-center transition-colors bg-blue-50/20">
                <input
                  type="file"
                  id="file-colectivo"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processColectivoFile(f);
                    e.target.value = '';
                  }}
                />
                <label htmlFor="file-colectivo" className="cursor-pointer block">
                  <UploadCloud size={30} className="mx-auto text-blue-500 mb-1.5" />
                  <span className="text-xs font-bold text-slate-700 block">
                    Seleccionar archivo Colectivo.xlsx
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Planilla oficial con 28 columnas
                  </span>
                </label>
              </div>
            </div>

            {/* Tarjeta 2: Contratos Antiguos (Contrato 8, 9 y 13) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <FileText size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">2. Contratos Antiguos</h3>
                    <p className="text-[11px] text-slate-400">Cruza con Asistencia por columna <strong>"Rut"</strong> (soporta fechas seriales)</p>
                  </div>
                </div>
              </div>

              {/* 3 Botones de Carga para Contrato 8, 9 y 13 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* Contrato 8 */}
                <div className="border border-slate-200 hover:border-indigo-400 rounded-xl p-3 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="file-contrato8"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processAntiguoFile(f, 'Contrato 8');
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="file-contrato8" className="cursor-pointer block">
                    <span className="text-xs font-black text-slate-800 block">Contrato 8</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {loadedSummary.contrato8 > 0 ? `✓ ${loadedSummary.contrato8} cargados` : 'Cargar Excel'}
                    </span>
                  </label>
                </div>

                {/* Contrato 9 */}
                <div className="border border-slate-200 hover:border-indigo-400 rounded-xl p-3 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="file-contrato9"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processAntiguoFile(f, 'Contrato 9');
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="file-contrato9" className="cursor-pointer block">
                    <span className="text-xs font-black text-slate-800 block">Contrato 9</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {loadedSummary.contrato9 > 0 ? `✓ ${loadedSummary.contrato9} cargados` : 'Cargar Excel'}
                    </span>
                  </label>
                </div>

                {/* Contrato 13 */}
                <div className="border border-slate-200 hover:border-indigo-400 rounded-xl p-3 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="file-contrato13"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processAntiguoFile(f, 'Contrato 13');
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="file-contrato13" className="cursor-pointer block">
                    <span className="text-xs font-black text-slate-800 block">Contrato 13</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {loadedSummary.contrato13 > 0 ? `✓ ${loadedSummary.contrato13} cargados` : 'Cargar Excel'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Resumen de Registros Cargados & Botón Transmitir (Requisito 3.7) */}
          {loadedContractsBatch.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    Lote Cargado ({loadedContractsBatch.length} registros listos para transmitir)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Colectivo: {loadedSummary.colectivo} | Contrato 8: {loadedSummary.contrato8} | Contrato 9: {loadedSummary.contrato9} | Contrato 13: {loadedSummary.contrato13}
                  </p>
                </div>

                {/* Botón Transmitir Oficial */}
                <Button
                  type="button"
                  onClick={() => setIsConfirmTransmitModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-10 px-5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Send size={15} />
                  Transmitir ({loadedContractsBatch.length} registros)
                </Button>
              </div>

              {/* Vista Previa de Tabla de Carga */}
              <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Origen</th>
                      <th className="px-3 py-2.5">Fecha</th>
                      <th className="px-3 py-2.5">Periodo</th>
                      <th className="px-3 py-2.5">RUT</th>
                      <th className="px-3 py-2.5">Nombre</th>
                      <th className="px-3 py-2.5">Rol</th>
                      <th className="px-3 py-2.5">Ruta</th>
                      <th className="px-3 py-2.5 text-right">Monto</th>
                      <th className="px-3 py-2.5 text-center">Asistencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loadedContractsBatch.slice(0, 100).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                            {row.contratoOrigen}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-800">{row.fechaDespacho}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{row.periodo}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{row.rutCond1}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.nomCond1}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.tipoCond1 === 'Auxiliar' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {row.tipoCond1}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-700">{row.rutas}</td>
                        <td className="px-3 py-2 text-right font-black text-emerald-700">{formatCLP(row.total)}</td>
                        <td className="px-3 py-2 text-center">
                          {row.matchedStaffInAttendance ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-[10px] rounded-full border border-emerald-200">
                              ✓ En Asistencia
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold text-[10px] rounded-full border border-amber-200">
                              No en Asistencia
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: DETALLE DE VIAJES TRANSMITIDOS (VISTA EXCEL) (3.7) */}
      {/* ========================================================================= */}
      {activeTab === 'excel' && (
        <div className="space-y-6">

          {/* Barra Superior: Selector de Personal y Búsqueda */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-blue-600" />
                  Planilla Operacional de Viajes Transmitidos
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Filtra por Conductor o Auxiliar para revisar sus viajes y asignar nuevos recorridos
                </p>
              </div>

              {/* Selector de Conductor o Auxiliar */}
              <div className="w-72">
                <select
                  value={excelSelectedStaffRut}
                  onChange={(e) => {
                    setExcelSelectedStaffRut(e.target.value);
                    setNewTripForm(prev => ({ ...prev, staffRut: e.target.value }));
                  }}
                  className="w-full py-1.5 px-3 text-xs bg-white border border-blue-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                >
                  <option value="">-- Ver todos los viajes ({transmittedTripsList.length}) --</option>
                  {transmittedStaffList.map(s => (
                    <option key={s.rut} value={s.rut}>
                      {s.name} ({s.role}) - {s.rut}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ficha Resumen del Conductor/Auxiliar Seleccionado */}
            {excelSelectedStaffRut && (
              <div className="bg-white p-3.5 rounded-xl border border-blue-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">
                    {staffMapByRut.get(excelSelectedStaffRut)?.role === 'Auxiliar' ? 'AUX' : 'COND'}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800">
                      {staffMapByRut.get(excelSelectedStaffRut)?.name || 'Personal'}
                    </h4>
                    <p className="text-xs text-slate-400 font-mono">
                      RUT: {excelSelectedStaffRut} • Rol: {staffMapByRut.get(excelSelectedStaffRut)?.role || 'Conductor'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Viajes</span>
                    <span className="text-sm font-black text-slate-800">
                      {displayedTransmittedTrips.length} viajes
                    </span>
                  </div>
                  <div className="border-l border-slate-200 pl-4">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Monto Acumulado</span>
                    <span className="text-sm font-black text-emerald-700">
                      {formatCLP(displayedTransmittedTrips.reduce((acc, t) => acc + (parseFloat(t.total) || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Formulario para Asignar Nuevos Viajes Directamente (3.7) */}
            <form onSubmit={handleAddNewTransmittedTrip} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-amber-100 text-amber-800 rounded-md">
                  <Plus size={14} />
                </span>
                <span className="text-xs font-black text-slate-800">
                  Asignar Nuevo Viaje (Se ordenará por fecha y se destacará en amarillo pastel)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {/* 1. Fecha */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fecha Despacho</label>
                  <input
                    type="text"
                    placeholder="DD-MM-YYYY"
                    value={newTripForm.fecha}
                    onChange={(e) => setNewTripForm({ ...newTripForm, fecha: e.target.value })}
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                {/* 2. Personal */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Personal</label>
                  <select
                    value={excelSelectedStaffRut || newTripForm.staffRut}
                    onChange={(e) => setNewTripForm({ ...newTripForm, staffRut: e.target.value })}
                    disabled={!!excelSelectedStaffRut}
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:bg-slate-100"
                  >
                    <option value="">Seleccionar personal...</option>
                    {transmittedStaffList.map(s => (
                      <option key={s.rut} value={s.rut}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>

                {/* 3. Ruta */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ruta</label>
                  <input
                    type="text"
                    placeholder="Ej. 1610 o Cantabria 07"
                    value={newTripForm.ruta}
                    onChange={(e) => setNewTripForm({ ...newTripForm, ruta: e.target.value })}
                    list="briefing-routes-list"
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-black text-blue-700"
                  />
                  <datalist id="briefing-routes-list">
                    {briefingRouteSuggestions.map(r => (
                      <option key={r.ruta} value={r.ruta}>{r.label}</option>
                    ))}
                  </datalist>
                </div>

                {/* 4. Tipo Servicio */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tipo Servicio</label>
                  <select
                    value={newTripForm.tipoServicio}
                    onChange={(e) => setNewTripForm({ ...newTripForm, tipoServicio: e.target.value })}
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {SERVICE_TYPE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Monto */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto ($ CLP)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder="Ej. 20000"
                      value={newTripForm.monto}
                      onChange={(e) => setNewTripForm({ ...newTripForm, monto: e.target.value })}
                      className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-black text-emerald-700"
                    />
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3 rounded-lg shrink-0 cursor-pointer"
                    >
                      Asignar
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Grilla Tipo Excel de Viajes Transmitidos */}
          {displayedTransmittedTrips.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400 space-y-2">
              <FileSpreadsheet size={32} className="mx-auto text-slate-300" />
              <p className="font-bold text-slate-600">No hay viajes transmitidos para mostrar</p>
              <p className="text-[11px] text-slate-400">
                Ve a la pestaña "Carga de Contratos", sube tus archivos y presiona "Transmitir" para conciliar con la Disponibilización.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-300 rounded-xl shadow-xs max-h-[600px]">
              <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
                <thead className="bg-slate-200 text-slate-800 font-black sticky top-0 z-10 border-b border-slate-300">
                  <tr>
                    <th className="px-3 py-2.5 border-r border-slate-300 w-10 text-center">#</th>
                    <th className="px-3.5 py-2.5 border-r border-slate-300">Fecha</th>
                    <th className="px-3 py-2.5 border-r border-slate-300">Ruta</th>
                    <th className="px-3 py-2.5 border-r border-slate-300">Personal</th>
                    <th className="px-3 py-2.5 border-r border-slate-300">RUT</th>
                    <th className="px-3 py-2.5 border-r border-slate-300">Rol</th>
                    <th className="px-3 py-2.5 border-r border-slate-300">Tipo Servicio / Concepto</th>
                    <th className="px-3 py-2.5 border-r border-slate-300 text-right">Monto ($)</th>
                    <th className="px-3 py-2.5 border-r border-slate-300 text-center">Contrato / Origen</th>
                    <th className="px-3 py-2.5 border-r border-slate-300 text-center">Estado</th>
                    <th className="px-3 py-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {displayedTransmittedTrips.map((row, idx) => {
                    const isManual = row.isManuallyAssigned;

                    return (
                      <tr 
                        key={row.id}
                        className={`transition-colors ${
                          isManual 
                            ? 'bg-amber-100 hover:bg-amber-200/80 border-l-4 border-l-amber-500 font-semibold' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px] border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="px-3.5 py-2 font-black text-slate-800 border-r border-slate-200">
                          {row.fechaDespacho}
                        </td>
                        <td className="px-3 py-2 font-black text-blue-700 border-r border-slate-200">
                          {row.rutas}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-800 border-r border-slate-200">
                          {row.nomCond1}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500 border-r border-slate-200">
                          {row.rutCond1}
                        </td>
                        <td className="px-3 py-2 border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            row.tipoCond1 === 'Auxiliar' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {row.tipoCond1 || 'Conductor'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700 border-r border-slate-200">
                          {row.tipoServicio || row.tipoPunto || 'Ruta'}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-emerald-800 border-r border-slate-200 text-sm">
                          {formatCLP(row.total)}
                        </td>
                        <td className="px-3 py-2 text-center border-r border-slate-200">
                          <span className="px-2 py-0.5 rounded font-extrabold text-[10px] bg-white/80 border border-slate-200 text-slate-700">
                            {row.contratoOrigen || row.origen || 'Excel'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center border-r border-slate-200">
                          {isManual ? (
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 border border-amber-300 rounded font-black text-[10px]">
                              ✨ Asignado Manual
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-black text-[10px]">
                              ✓ Transmitido
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const newAmount = prompt('Nuevo monto para este viaje ($):', String(row.total || 0));
                                if (newAmount !== null) {
                                  const parsed = parseFloat(newAmount.replace(/[^\d.-]/g, '')) || 0;
                                  updateTransmittedTrip(row.id, { total: parsed, pagoCond1: parsed });
                                }
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar Monto"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`¿Eliminar viaje de ${row.nomCond1} en ruta ${row.rutas}?`)) {
                                  deleteTransmittedTrip(row.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMACIÓN DE TRANSMISIÓN (3.7) */}
      {/* ========================================================================= */}
      {isConfirmTransmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Send size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">
                  Confirmar Transmisión con Disponibilización
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conciliación automática de viajes por Fecha y RUT
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 space-y-2 border border-slate-200">
              <p>
                • Se evaluarán <strong>{loadedContractsBatch.length} registros cargados</strong> contra las asignaciones disponibilizadas en la plataforma.
              </p>
              <p>
                • Los viajes que <strong>no tengan coincidencia de Fecha y RUT en la Disponibilización</strong> serán filtrados de la vista de transmisión operacional.
              </p>
              <p className="font-bold text-blue-700">
                • Los registros completos se conservarán en la pantalla principal para mantener intactos los totales generales y gráficos de remuneraciones.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsConfirmTransmitModalOpen(false)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmTransmission}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-9 px-4"
              >
                Confirmar y Transmitir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA EDITAR MONTO EN REGISTROS MAESTROS */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800">Editar Monto de Pago</h3>
            <p className="text-xs text-slate-500">
              {editingPayment.nomCond1} • Ruta {editingPayment.rutas} ({editingPayment.fechaDespacho})
            </p>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Monto ($ CLP)</label>
              <input
                type="number"
                value={editMontoValue}
                onChange={(e) => setEditMontoValue(e.target.value)}
                className="w-full py-2 px-3 text-sm border border-slate-200 rounded-xl font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingPayment(null)} className="text-xs h-8">
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  const parsed = parseFloat(editMontoValue.replace(/[^\d.-]/g, '')) || 0;
                  await updatePayment(editingPayment.id, { total: parsed, pagoCond1: parsed });
                  setEditingPayment(null);
                }}
                className="text-xs h-8 bg-blue-600 text-white font-bold"
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
