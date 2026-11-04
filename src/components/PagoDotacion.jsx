import React, { useState, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Trash2, Plus, 
  Search, Filter, Download, DollarSign, Calendar, Truck, 
  Users, Edit3, X, RefreshCw, FileText, ArrowUpDown,
  TrendingUp, TrendingDown, Award, Sparkles, Send,
  ChevronRight, Layers, FileSpreadsheet, Mail, History,
  CheckSquare, Square, Copy, ExternalLink, Check, Info, Eye
} from 'lucide-react';
import { Button } from './ui/Button';
import { useStaffStore } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useAuthStore } from '../store/authStore';
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
  'Eventualidad_Key',
  'Retiro camión',
  'Servicio de taller',
  'Servicio de vulcanización',
  'Traspasos',
  'Apoyo Centro',
  'SPID',
  'Otro'
];

// Opciones de contratos para el filtro múltiple (Requisito 10.4)
export const CONTRACT_FILTER_OPTIONS = [
  { id: 'Colectivo', label: 'Colectivo', match: (str) => str.toLowerCase().includes('colectivo') },
  { id: 'Contrato 8', label: 'Contrato 8', match: (str) => str.includes('8') },
  { id: 'Contrato 9', label: 'Contrato 9', match: (str) => str.includes('9') },
  { id: 'Contrato 13', label: 'Contrato 13', match: (str) => str.includes('13') },
  { id: 'Eventualidad_Key', label: 'Eventualidad_Key', match: (str, isMan, isEv) => isMan || str.toLowerCase().includes('eventualidad') || isEv }
];

// Validación y cálculo de escala oficial RM por Puntos y M3 para Contratos Colectivos (Requisito 10.2)
export const calculateColectivoRmMonto = (contCond, tipoPago, puntosRaw, m3Raw) => {
  if (cleanStr(tipoPago).toUpperCase() !== 'RM') return null;
  const c = cleanStr(contCond).padStart(3, '0');
  if (c !== '018' && c !== '019') return null;
  const factor = (c === '018') ? 0.5 : 1.0;
  const pts = parseFloat(puntosRaw) || 0;
  const vol = parseFloat(m3Raw) || 0;

  // 1. Overrides por volumen en m3:
  // "para los rangos 1 a 3 cuando este se encuentre entre 10 a 12 m^3 en la columna Total M3Viaje debes considerar un valor de 6000 para 019 y la mitad para 018"
  if (pts >= 1 && pts <= 3 && vol >= 10 && vol <= 12) {
    return 6000 * factor;
  }
  // "En el caso de mas de 12 m^3 en los punto de 1 a 3 o 4 a 6 necesito que su valor sea 8000 para los 019 y la mitad para los 018"
  if ((pts >= 1 && pts <= 6) && vol > 12) {
    return 8000 * factor;
  }

  // 2. Escala base por Puntos:
  // 1 a 3 -> 3.500 (019) / 1.750 (018)
  if (pts >= 1 && pts <= 3) return 3500 * factor;
  // 4 a 6 -> 7.000 (019) / 3.500 (018)
  if (pts >= 4 && pts <= 6) return 7000 * factor;
  // 7 a 9 -> 8.000 (019) / 4.000 (018)
  if (pts >= 7 && pts <= 9) return 8000 * factor;
  // 10 a 20 -> 10.000 (019) / 5.000 (018)
  if (pts >= 10 && pts <= 20) return 10000 * factor;
  // 21 a 30 -> 12.000 (019) / 6.000 (018)
  if (pts >= 21 && pts <= 30) return 12000 * factor;
  // mas a 31 -> 14.000 (019) / 7.000 (018)
  if (pts >= 31) return 14000 * factor;

  return null;
};

// Formato de moneda chilena ($ X.XXX.XXX)
const formatCLP = (amount) => {
  const num = Number(amount) || 0;
  if (num < 0) {
    return '-$' + Math.abs(Math.round(num)).toLocaleString('es-CL');
  }
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

  // Usuario autenticado
  const { user } = useAuthStore();
  const currentUserName = user?.name || user?.username || 'Usuario';

  // Stores
  const { staffList, fetchStaff } = useStaffStore();
  const { attendanceList, fetchAttendanceByDateRange } = useAttendanceStore();
  const { transmittedAssignments, fetchHistoricalAssignments } = usePlanningStore();
  const { 
    paymentsList, 
    transmittedTripsList,
    contractUploadDates,
    changeHistory,
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

  // Filtro por tipo de contrato (multi-selección, Requisito 10.4)
  const [filterContracts, setFilterContracts] = useState([]); // ['Colectivo', 'Contrato 8', etc.]

  // Selección de viajes para acciones masivas (Requisito 10.4)
  const [selectedTripIds, setSelectedTripIds] = useState(new Set());

  // Modal Histórico de Cambios (Requisito 10.4)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyFilterAction, setHistoryFilterAction] = useState('TODOS');

  // Modal Enviar por Correo / Outlook (Requisito 10.4)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('operaciones@keylogistics.cl');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('executive'); // 'executive' | 'detailed' | 'eventualidades'

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
          tripsCount: 0
        };
      }
      const monto = parseFloat(p.total) || 0;
      agg[pKey].totalMonto += monto;
      agg[pKey].tripsCount += 1;
    });

    const list = Object.values(agg).map(item => ({
      ...item,
      totalViajes: item.tripsCount,
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

      if (filterConductor.trim()) {
        const itemRut = cleanRut(item.rutCond1 || item.rut);
        const itemNom = cleanStr(item.nomCond1 || item.nombre).toLowerCase();
        const search = filterConductor.toLowerCase().trim();
        const searchRut = cleanRut(search);
        const matchRut = searchRut && itemRut.includes(searchRut);
        const matchNom = search && itemNom.includes(search);
        if (!matchRut && !matchNom) {
          return false;
        }
      }

      if (filterAuxiliar.trim()) {
        const itemRut = cleanRut(item.rutCond1 || item.rut);
        const itemNom = cleanStr(item.nomCond1 || item.nombre).toLowerCase();
        const search = filterAuxiliar.toLowerCase().trim();
        const searchRut = cleanRut(search);
        const matchRut = searchRut && itemRut.includes(searchRut);
        const matchNom = search && itemNom.includes(search);
        if (!matchRut && !matchNom) {
          return false;
        }
      }

      if (filterServiceType && item.tipoServicio !== filterServiceType) {
        return false;
      }

      // Filtro múltiple por Contrato (Requisito 10.4)
      if (filterContracts.length > 0) {
        const originStr = cleanStr(item.contratoOrigen || item.origen || item.glosa || '').toLowerCase();
        const isMan = !!item.isManuallyAssigned;
        const isEv = !!item.isEventualidad;
        const matchesContract = filterContracts.some(cId => {
          const opt = CONTRACT_FILTER_OPTIONS.find(o => o.id === cId);
          return opt ? opt.match(originStr, isMan, isEv) : false;
        });
        if (!matchesContract) return false;
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
  }, [paymentsList, filterPeriodo, filterConductor, filterAuxiliar, filterServiceType, filterContracts, filterSearch]);

  // KPIs Dinámicos (Requisitos 3.2, 3.3, 3.4, 10.3)
  const kpiData = useMemo(() => {
    const totalMonto = filteredPayments.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0);

    // 3.2 y 10.3: Total de viajes en base a cantidad de vueltas/rutas realizadas (sin colapsar vueltas)
    const totalViajes = filteredPayments.length;

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

  // Comparador de Dos Periodos (Requisito 3.6, 10.3)
  const comparisonData = useMemo(() => {
    if (!isCompareMode || !comparePeriodA || !comparePeriodB) return null;

    const getPeriodStats = (targetKey) => {
      const rows = paymentsList.filter(p => {
        const info = getPeriodFromDate(p.fechaDespacho || p.fecha);
        return (info?.key === targetKey) || (p.periodo === targetKey);
      });
      const monto = rows.reduce((acc, r) => acc + (parseFloat(r.total) || 0), 0);
      const trips = rows.length; // Conteo real de viajes / vueltas
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

  // 3.5: Ranking Top 5 de Conductores y Auxiliares por Periodo (10.3: contabilizando cada vuelta)
  const { topConductores, topAuxiliares } = useMemo(() => {
    const condMap = new Map();
    const auxMap = new Map();

    filteredPayments.forEach(p => {
      const rut = cleanRut(p.rutCond1 || p.rut);
      const nom = cleanStr(p.nomCond1 || p.nombre || p.cond1) || 'Sin Nombre';
      const rol = cleanStr(p.tipoCond1 || p.rol);
      const monto = parseFloat(p.total) || 0;

      const isAux = rol.toLowerCase().includes('auxiliar');
      const targetMap = isAux ? auxMap : condMap;

      const key = rut || nom;
      if (!targetMap.has(key)) {
        targetMap.set(key, {
          rut,
          name: nom,
          role: isAux ? 'Auxiliar' : 'Conductor',
          totalMonto: 0,
          totalViajes: 0
        });
      }
      const entry = targetMap.get(key);
      entry.totalMonto += monto;
      entry.totalViajes += 1; // Cada registro representa una vuelta real
    });

    const formatTop = (map) => {
      return Array.from(map.values())
        .sort((a, b) => b.totalMonto - a.totalMonto)
        .slice(0, 5);
    };

    return {
      topConductores: formatTop(condMap),
      topAuxiliares: formatTop(auxMap)
    };
  }, [filteredPayments]);

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
          if (row.some(c => String(c).toLowerCase().includes('rut cond1') || String(c).toLowerCase().includes('fecha despacho') || String(c).toLowerCase().includes('periodo'))) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx === -1) {
          toast.error('No se encontró el encabezado oficial en el archivo Colectivo.');
          return;
        }

        const headers = rawJson[headerIdx].map(h => String(h || '').trim());
        
        // Mapeo inteligente de columnas para Colectivo
        let colPeriodo = -1, colFecha = -1, colContCond = -1, colTipoCond = -1, colRut = -1, colNombre = -1;
        let colRutas = -1, colTransportistas = -1, colTipoPago = -1, colTipoCalculo = -1, colSegundaVuelta = -1;
        let colPuntos = -1, colM3 = -1, colCajas = -1, colTotal = -1;

        headers.forEach((hRaw, c) => {
          const h = hRaw.toLowerCase().trim();
          if (h === 'periodo') colPeriodo = c;
          if (h === 'fecha despacho' || h === 'fecha') colFecha = c;
          if (h === 'cont cond1' || h === 'cont' || h === 'contrato') colContCond = c;
          if (h === 'tipo cond1' || h === 'tipo') colTipoCond = c;
          if (h === 'rut cond1' || h === 'rut') colRut = c;
          if (h === 'nom cond1' || h === 'nombre') colNombre = c;
          if (h === 'rutas' || h === 'ruta') colRutas = c;
          if (h === 'transportistas') colTransportistas = c;
          if (h === 'tipo pago') colTipoPago = c;
          if (h === 'tipo calculo') colTipoCalculo = c;
          if (h === 'segunda vuelta' || h === '2v') colSegundaVuelta = c;
          if (h === 'total puntos viaje' || h === 'puntos viaje' || h === 'puntos') colPuntos = c;
          if (h === 'total m3viaje' || h === 'total m3' || h === 'm3') colM3 = c;
          if (h === 'total cajas viaje' || h === 'total cajas' || h === 'cajas') colCajas = c;
          if (h === 'total') colTotal = c;
        });

        if (colFecha === -1) colFecha = 1;
        if (colContCond === -1) colContCond = 2;
        if (colTipoCond === -1) colTipoCond = 3;
        if (colRut === -1) colRut = 5;
        if (colNombre === -1) colNombre = 6;
        if (colRutas === -1) colRutas = 7;
        if (colTransportistas === -1) colTransportistas = 8;
        if (colTipoPago === -1) colTipoPago = 12;
        if (colTipoCalculo === -1) colTipoCalculo = 13;
        if (colSegundaVuelta === -1) colSegundaVuelta = 14;
        if (colPuntos === -1) colPuntos = 18;
        if (colM3 === -1) colM3 = 19;
        if (colCajas === -1) colCajas = 20;
        if (colTotal === -1) colTotal = headers.length - 1;

        const parsedRows = [];

        for (let r = headerIdx + 1; r < rawJson.length; r++) {
          const row = rawJson[r];
          if (!row || row.length === 0) continue;

          // 1. Filtrar estrictamente solo lo que dice 018 y 019 de la columna "Cont Cond1" (Requisito 10.1)
          const rawContCond = colContCond >= 0 ? cleanStr(row[colContCond]) : '';
          const normContCond = rawContCond.replace(/^0+/, '');
          if (normContCond !== '18' && normContCond !== '19' && rawContCond !== '018' && rawContCond !== '019') {
            continue; // Se descartan filas con otros contratos
          }

          const rawRut = row[colRut];
          const cRut = cleanRut(rawRut);
          if (!cRut) continue;

          const rawFecha = row[colFecha];
          const normFecha = parseExcelDate(rawFecha);
          const nom = cleanStr(row[colNombre]);
          const tipoCond = cleanStr(row[colTipoCond]) || 'Conductor';
          const rutas = cleanStr(row[colRutas]);
          const tipoPagoVal = colTipoPago >= 0 ? cleanStr(row[colTipoPago]) : '';
          const tipoCalculoVal = colTipoCalculo >= 0 ? cleanStr(row[colTipoCalculo]) : '';
          const segundaVueltaVal = colSegundaVuelta >= 0 ? cleanStr(row[colSegundaVuelta]) : '';
          const puntosVal = colPuntos >= 0 ? (parseFloat(row[colPuntos]) || 0) : 0;
          const m3Val = colM3 >= 0 ? (parseFloat(row[colM3]) || 0) : 0;
          const cajasVal = colCajas >= 0 ? (parseFloat(row[colCajas]) || 0) : 0;
          
          // Total de la fila (columna Total o última columna numérica)
          let totalVal = 0;
          if (colTotal >= 0 && row[colTotal] !== undefined && row[colTotal] !== '') {
            totalVal = parseFloat(String(row[colTotal]).replace(/[^\d.-]/g, '')) || 0;
          }
          if (totalVal === 0) {
            for (let c = row.length - 1; c >= 7; c--) {
              const v = row[c];
              if (v !== undefined && v !== null && v !== '') {
                const parsedV = parseFloat(String(v).replace(/[^\d.-]/g, ''));
                if (!isNaN(parsedV) && parsedV !== 0) {
                  totalVal = parsedV;
                  break;
                }
              }
            }
          }

          // Detección de palabra "Eventualidad" (Requisito explícito de marcado celeste pastel)
          const fullRowText = row.map(x => String(x || '')).join(' ').toLowerCase();
          const isEventualidad = fullRowText.includes('eventualidad') || 
                                fullRowText.includes('eventualidades') ||
                                rutas.toLowerCase().includes('eventualidad');

          // Cruce con Asistencia / StaffList
          const matchedStaff = staffMapByRut.get(cRut);
          const periodInfo = getPeriodFromDate(normFecha);

          const baseItem = {
            id: `colectivo-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 4)}`,
            contratoOrigen: 'Colectivo',
            periodo: colPeriodo >= 0 && row[colPeriodo] ? String(row[colPeriodo]) : periodInfo.key,
            periodoLabel: periodInfo.label,
            fechaDespacho: normFecha,
            rutCond1: cRut,
            nomCond1: matchedStaff?.name || nom,
            tipoCond1: matchedStaff?.role || tipoCond,
            rutas,
            transportistas: colTransportistas >= 0 ? cleanStr(row[colTransportistas]) : '',
            total: totalVal,
            pagoCond1: totalVal,
            tipoPago: tipoPagoVal,
            tipoCalculo: tipoCalculoVal,
            segundaVuelta: segundaVueltaVal,
            totalPuntosViaje: puntosVal,
            totalM3Viaje: m3Val,
            totalCajasViaje: cajasVal,
            contCond1: rawContCond || (normContCond ? normContCond.padStart(3, '0') : '018'),
            tipoServicio: isEventualidad ? 'Eventualidades' : 'Ruta',
            origen: 'Colectivo',
            isEventualidad,
            matchedStaffInAttendance: !!matchedStaff
          };

          parsedRows.push(baseItem);

          // 2. Validación de regla oficial para Tipo Pago === 'RM' (Requisito 10.2)
          const calcRmMonto = calculateColectivoRmMonto(
            baseItem.contCond1,
            tipoPagoVal,
            puntosVal,
            m3Val
          );

          // Si el valor calculado difiere del que viene en el Excel, se ingresa como una fila diferente con color diferenciado (Morado pastel)
          if (calcRmMonto !== null && Math.round(calcRmMonto) !== Math.round(totalVal)) {
            parsedRows.push({
              id: `colectivo-ajuste-rm-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 4)}`,
              contratoOrigen: 'Colectivo',
              periodo: baseItem.periodo,
              periodoLabel: baseItem.periodoLabel,
              fechaDespacho: normFecha,
              rutCond1: cRut,
              nomCond1: baseItem.nomCond1,
              tipoCond1: baseItem.tipoCond1,
              rutas: `${rutas || 'Ruta'} [Ajuste Escala RM: ${puntosVal} pts, ${m3Val} m³]`,
              transportistas: baseItem.transportistas,
              total: calcRmMonto,
              originalExcelTotal: totalVal,
              diferenciaMonto: calcRmMonto - totalVal,
              pagoCond1: calcRmMonto,
              tipoPago: 'RM',
              tipoCalculo: 'Escala Oficial RM',
              segundaVuelta: segundaVueltaVal,
              totalPuntosViaje: puntosVal,
              totalM3Viaje: m3Val,
              totalCajasViaje: cajasVal,
              contCond1: baseItem.contCond1,
              tipoServicio: 'Ajuste Escala RM',
              glosa: 'Ajuste_RM_Puntos',
              origen: 'Colectivo (Ajuste RM)',
              isRmAdjustment: true, // Color morado/violeta pastel
              isEventualidad: false,
              matchedStaffInAttendance: !!matchedStaff
            });
          }
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

  // Parser dinámico para contratos antiguos (Contrato 8, 9, 13)
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

        // Buscar fila de encabezado revisando hasta 15 filas
        let headerIdx = -1;
        for (let r = 0; r < Math.min(15, rawJson.length); r++) {
          const row = rawJson[r] || [];
          const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
          if (rowStr.includes('rut') && (rowStr.includes('fecha') || rowStr.includes('nombre') || rowStr.includes('viajes') || rowStr.includes('cajas') || rowStr.includes('total'))) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx === -1) headerIdx = 4; // Fallback al índice 4 detectado en la plantilla

        const headerRow = rawJson[headerIdx] || [];
        const prevHeaderRow = headerIdx > 0 ? (rawJson[headerIdx - 1] || []) : [];
        const prevHeaderRow2 = headerIdx > 1 ? (rawJson[headerIdx - 2] || []) : [];

        let colFecha = -1, colRut = -1, colNombre = -1, colTipoPunto = -1, colRuta = -1, colTotal = -1;
        let colViajes = -1, colEspera = -1, colBono2v = -1, colDif = -1, colCarga = -1;

        const maxCols = Math.max(headerRow.length, prevHeaderRow.length, prevHeaderRow2.length);
        for (let c = 0; c < maxCols; c++) {
          const h2 = String(prevHeaderRow2[c] || '').toLowerCase().trim();
          const h1 = String(prevHeaderRow[c] || '').toLowerCase().trim();
          const h0 = String(headerRow[c] || '').toLowerCase().trim();
          const h = `${h2} ${h1} ${h0}`.trim();

          if (colFecha === -1 && (h0 === 'fecha' || h.includes('fecha'))) colFecha = c;
          if (colRut === -1 && (h0 === 'rut' || h0 === 'rut cond1' || h.includes('rut'))) colRut = c;
          if (colNombre === -1 && (h0 === 'nom cond1' || h0 === 'nombre' || h.includes('conductor/auxiliar') || h.includes('nombre'))) colNombre = c;
          if (colTipoPunto === -1 && (h0 === 'tipo punto' || h.includes('tipo punto') || h.includes('tipo contrato'))) colTipoPunto = c;
          if (colRuta === -1 && (h0 === 'cajas/viajes/ruta' || h.includes('cajas/viajes/ruta') || h.includes('descripción ruta') || h.includes('cajas/despachadas') || h0 === 'rutas' || h0 === 'ruta')) colRuta = c;
          if (colTotal === -1 && (h0 === 'pago total' || h0 === 'total final' || h0 === 'total' || h.includes('pago total') || h.includes('total pago') || h.includes('monto'))) colTotal = c;
          if (colViajes === -1 && (h0 === 'viajes' || h.includes('viajes')) && colRuta !== c) colViajes = c;
          if (colEspera === -1 && (h.includes('tiempo de espera') || h0 === 'espera')) colEspera = c;
          if (colBono2v === -1 && (h.includes('bono segunda') || h.includes('segunda vuelta') || h.includes('bono 2v'))) colBono2v = c;
          if (colDif === -1 && (h.includes('diferencia') || h0 === 'dif')) colDif = c;
          if (colCarga === -1 && (h.includes('carga/descarga') || h.includes('descarga'))) colCarga = c;
        }

        if (colFecha === -1) colFecha = 0;
        if (colRut === -1) colRut = 1;
        if (colNombre === -1) colNombre = 2;

        const parsedRows = [];
        for (let r = headerIdx + 1; r < rawJson.length; r++) {
          const row = rawJson[r];
          if (!row || row.length === 0) continue;

          // Buscar RUT en colRut o en las primeras columnas
          let rawRut = row[colRut];
          if (!rawRut || !String(rawRut).includes('-')) {
            for (let c = 0; c < Math.min(5, row.length); c++) {
              if (row[c] && String(row[c]).includes('-') && cleanRut(row[c]).length >= 8) {
                rawRut = row[c];
                break;
              }
            }
          }

          // Validar que la fila contenga un RUT válido
          if (!rawRut || !String(rawRut).includes('-')) continue;

          const cRut = cleanRut(rawRut);
          const rawFecha = row[colFecha] || row[0];
          const normFecha = parseExcelDate(rawFecha);
          const rawNombre = cleanStr(row[colNombre]);

          // Tipo Punto
          let tipoPunto = colTipoPunto >= 0 ? cleanStr(row[colTipoPunto]) : '';
          if (!tipoPunto && row[3] && typeof row[3] === 'string' && !row[3].includes('-') && isNaN(row[3])) {
            tipoPunto = cleanStr(row[3]);
          } else if (!tipoPunto && row[4] && typeof row[4] === 'string' && !row[4].includes('-') && isNaN(row[4])) {
            tipoPunto = cleanStr(row[4]);
          }

          // Detección inteligente de Ruta:
          let ruta = '';
          // 1. En Contrato 9, la columna K (index 10) contiene la descripción (ej: '4304|RUTA STREAT BURGUER 04...')
          const colK = row[10] ? cleanStr(row[10]) : '';
          if (colK && (colK.includes('|') || colK.toUpperCase().includes('RUTA') || colK.toUpperCase().includes('SPID') || colK.toUpperCase().includes('OXXO') || colK.toUpperCase().includes('SUBWAY') || colK.toUpperCase().includes('CARLS') || colK.toUpperCase().includes('SERVICIO') || colK.toUpperCase().includes('ESPECIALES'))) {
            ruta = colK;
          }

          // 2. Columna detectada por encabezado (ej. Cajas/Viajes/Ruta)
          if (!ruta && colRuta >= 0 && row[colRuta]) {
            const cand = cleanStr(row[colRuta]);
            if (cand && cand.toUpperCase() !== rawNombre.toUpperCase()) {
              ruta = cand;
            }
          }

          // 3. Fallback a columnas comunes (col 6 o col 4) cuidando de NO usar el nombre
          if (!ruta && row[6]) {
            const cand = cleanStr(row[6]);
            if (cand && cand.toUpperCase() !== rawNombre.toUpperCase() && isNaN(cand)) {
              ruta = cand;
            }
          }
          if (!ruta && row[4]) {
            const cand = cleanStr(row[4]);
            if (cand && cand.toUpperCase() !== rawNombre.toUpperCase() && isNaN(cand)) {
              ruta = cand;
            }
          }

          // 4. Búsqueda por patrón de ruta en cualquier celda de la fila
          if (!ruta) {
            for (let c = 0; c < row.length; c++) {
              const val = cleanStr(row[c]);
              if (val && val.toUpperCase() !== rawNombre.toUpperCase() && (/\d{3,5}\|/.test(val) || val.toUpperCase().includes('RUTA ') || val.toUpperCase().includes('SERVICIO'))) {
                ruta = val;
                break;
              }
            }
          }

          if (!ruta) ruta = tipoPunto || 'Ruta';

          // Cálculo del Total:
          // 1. Columna Total explícita
          let totalVal = 0;
          if (colTotal >= 0 && row[colTotal] !== undefined && row[colTotal] !== '') {
            const p = parseFloat(String(row[colTotal]).replace(/[^\d.-]/g, ''));
            if (!isNaN(p) && p !== 0) totalVal = p;
          }

          // 2. Suma de componentes (viajes + espera + bono2v + dif + carga)
          const viajes = colViajes >= 0 ? (parseFloat(row[colViajes]) || 0) : 0;
          const espera = colEspera >= 0 ? (parseFloat(row[colEspera]) || 0) : 0;
          const bono2v = colBono2v >= 0 ? (parseFloat(row[colBono2v]) || 0) : 0;
          const dif = colDif >= 0 ? (parseFloat(row[colDif]) || 0) : 0;
          const carga = colCarga >= 0 ? (parseFloat(row[colCarga]) || 0) : 0;
          const sumComponents = viajes + espera + bono2v + dif + carga;

          // 3. Última columna numérica no vacía de la fila (requisito explícito del usuario)
          let lastNumeric = 0;
          for (let c = row.length - 1; c >= Math.max(5, colRut + 2); c--) {
            const v = row[c];
            if (v !== undefined && v !== null && v !== '') {
              const parsedV = parseFloat(String(v).replace(/[^\d.-]/g, ''));
              if (!isNaN(parsedV) && parsedV !== 0) {
                lastNumeric = parsedV;
                break;
              }
            }
          }

          if (totalVal === 0) {
            if (sumComponents > 0) {
              totalVal = sumComponents;
            } else if (lastNumeric !== 0) {
              totalVal = lastNumeric;
            }
          }

          // Detección de palabra "Eventualidad" en cualquier celda o campo (Requisito celeste pastel)
          const rowText = row.map(c => String(c || '')).join(' ').toLowerCase();
          const isEventualidad = rowText.includes('eventualidad') || 
                                rowText.includes('eventualidades') ||
                                tipoPunto.toLowerCase().includes('eventualidad') || 
                                ruta.toLowerCase().includes('eventualidad');

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
            tipoCond1: matchedStaff?.role || (tipoPunto.toLowerCase().includes('auxiliar') ? 'Auxiliar' : 'Conductor'),
            rutas: ruta || tipoPunto,
            tipoPunto,
            total: totalVal,
            pagoCond1: totalVal,
            tipoServicio: isEventualidad ? 'Eventualidades' : (bono2v > 0 ? 'Segunda Vuelta' : 'Ruta'),
            origen: contractType,
            isEventualidad,
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
  const [excelStaffInput, setExcelStaffInput] = useState('');
  const [excelServiceTypeInput, setExcelServiceTypeInput] = useState('');
  const [excelSearchText, setExcelSearchText] = useState('');

  // Formulario para Asignar Nuevo Viaje Manual en la Vista Excel
  const [newTripForm, setNewTripForm] = useState({
    fecha: normalizeDate(new Date()) || '03-11-2026',
    staffRut: '',
    ruta: '',
    tipoServicio: 'Ruta',
    monto: ''
  });
  const [assignStaffInputValue, setAssignStaffInputValue] = useState('');

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

  // Sincronizar campo de asignación si cambia el colaborador seleccionado arriba
  useEffect(() => {
    if (excelSelectedStaffRut) {
      const staffObj = transmittedStaffList.find(s => s.rut === excelSelectedStaffRut) || staffMapByRut.get(excelSelectedStaffRut);
      if (staffObj) {
        setAssignStaffInputValue(`${staffObj.name} (${staffObj.role}) - ${staffObj.rut}`);
        setNewTripForm(prev => ({ ...prev, staffRut: excelSelectedStaffRut }));
      }
    }
  }, [excelSelectedStaffRut, transmittedStaffList, staffMapByRut]);

  // Lista ordenada de viajes transmitidos según filtros
  // Los viajes se ordenan por fecha cronológicamente
  const displayedTransmittedTrips = useMemo(() => {
    let list = [...transmittedTripsList];

    // Filtro por Conductor o Auxiliar (por RUT o texto escrito)
    if (excelSelectedStaffRut) {
      list = list.filter(t => cleanRut(t.rutCond1) === excelSelectedStaffRut);
    } else if (excelStaffInput.trim()) {
      const term = excelStaffInput.toLowerCase().trim();
      const termRut = cleanRut(term);
      list = list.filter(t => {
        const cRut = cleanRut(t.rutCond1);
        const cNom = cleanStr(t.nomCond1).toLowerCase();
        return (termRut && cRut.includes(termRut)) || cNom.includes(term);
      });
    }

    // Filtro por Tipo de Servicio con escritura
    if (excelServiceTypeInput.trim()) {
      const term = excelServiceTypeInput.toLowerCase().trim();
      list = list.filter(t => {
        const sType = cleanStr(t.tipoServicio || t.tipoPunto || '').toLowerCase();
        return sType.includes(term);
      });
    }

    // Filtro múltiple por Tipo de Contrato (Requisito 10.4)
    if (filterContracts.length > 0) {
      list = list.filter(t => {
        const originStr = cleanStr(t.contratoOrigen || t.origen || t.glosa || '').toLowerCase();
        const isMan = !!t.isManuallyAssigned;
        const isEv = !!t.isEventualidad;
        return filterContracts.some(cId => {
          const opt = CONTRACT_FILTER_OPTIONS.find(o => o.id === cId);
          return opt ? opt.match(originStr, isMan, isEv) : false;
        });
      });
    }

    // Búsqueda general por ruta, contrato, glosa, etc.
    if (excelSearchText.trim()) {
      const term = excelSearchText.toLowerCase();
      list = list.filter(t => {
        const full = [t.fechaDespacho, t.rutCond1, t.nomCond1, t.rutas, t.tipoServicio, t.tipoPunto, t.contratoOrigen, t.glosa]
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
  }, [transmittedTripsList, excelSelectedStaffRut, excelStaffInput, excelServiceTypeInput, excelSearchText, filterContracts]);

  // Manejador para Asignar Nuevo Viaje Manual en la Vista Excel
  const handleAddNewTransmittedTrip = async (e) => {
    e.preventDefault();
    const targetRut = excelSelectedStaffRut || newTripForm.staffRut;
    if (!targetRut) {
      toast.warning('Selecciona o busca el Conductor o Auxiliar al que deseas asignar el viaje.');
      return;
    }
    if (!newTripForm.ruta.trim() || newTripForm.monto === '' || newTripForm.monto === undefined) {
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
      periodoLabel: periodInfo.label,
      rutCond1: targetRut,
      nomCond1: staffObj?.name || 'Personal Asignado',
      tipoCond1: staffObj?.role || 'Conductor',
      rutas: newTripForm.ruta.trim(),
      tipoServicio: newTripForm.tipoServicio || 'Ruta',
      total: montoNum,
      pagoCond1: montoNum,
      contratoOrigen: 'Eventualidad_Key',
      glosa: 'Eventualidad_Key',
      origen: 'Manual',
      isManuallyAssigned: true // Activa el resaltado amarillo pastel
    };

    await addTransmittedTrip(newTrip);

    // Sincronizar en tiempo real con Disponibilización ("la plataforma")
    try {
      const isConductor = (staffObj?.role || '').toLowerCase().includes('cond') || (staffObj?.role || '').toLowerCase() !== 'auxiliar';
      await usePlanningStore.getState().addExtraServices([{
        fecha: normFecha,
        conductor_name: isConductor ? (staffObj?.name || 'Conductor') : '',
        conductor_rut: isConductor ? targetRut : '',
        aux1_name: !isConductor ? (staffObj?.name || 'Auxiliar') : '',
        aux1_rut: !isConductor ? targetRut : '',
        camion: '',
        ruta: newTripForm.ruta.trim(),
        servicio: newTripForm.tipoServicio || 'Ruta',
        operacion: 'Eventualidad_Key',
        cliente: 'Eventualidad_Key',
        nota: 'Asignación Pago Dotación - Eventualidad_Key'
      }]);
    } catch (err) {
      console.warn('Error sincronizando con planningStore:', err);
    }

    // Enfocar automáticamente al colaborador en la planilla
    setExcelSelectedStaffRut(targetRut);
    setExcelStaffInput(staffObj?.name ? `${staffObj.name} (${targetRut})` : targetRut);
    setExcelSearchText('');
    setExcelServiceTypeInput('');

    // Limpiar campos de ruta y monto
    setNewTripForm(prev => ({
      ...prev,
      ruta: '',
      monto: ''
    }));

    toast.success(`Viaje '${newTrip.rutas}' asignado a ${staffObj?.name || targetRut} (Eventualidad_Key) y reflejado en la plataforma`);
  };

  // -------------------------------------------------------------------------
  // MÉTODOS DE SELECCIÓN Y FILTROS MULTIPLES (Requisito 10.4)
  // -------------------------------------------------------------------------
  const toggleSelectTrip = (id) => {
    setSelectedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const visibleIds = displayedTransmittedTrips.map(t => t.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTripIds.has(id));
    setSelectedTripIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleSelectAllEventualidadKey = () => {
    const targetTrips = transmittedTripsList.filter(t => 
      t.isManuallyAssigned || 
      cleanStr(t.contratoOrigen) === 'Eventualidad_Key' || 
      cleanStr(t.glosa) === 'Eventualidad_Key' ||
      cleanStr(t.tipoServicio) === 'Eventualidad_Key' ||
      t.isEventualidad
    );

    if (targetTrips.length === 0) {
      toast.info('No hay registros de Eventualidad_Key en los viajes transmitidos.');
      return;
    }

    setSelectedTripIds(prev => {
      const next = new Set(prev);
      targetTrips.forEach(t => next.add(t.id));
      return next;
    });
    toast.success(`Se seleccionaron ${targetTrips.length} registro(s) de Eventualidad_Key.`);
  };

  const toggleContractFilter = (contractId) => {
    setFilterContracts(prev => {
      if (prev.includes(contractId)) {
        return prev.filter(c => c !== contractId);
      } else {
        return [...prev, contractId];
      }
    });
  };

  // Exportar Master / Transmitidos a Excel filtrado (Requisito 10.4)
  const handleExportMasterExcel = () => {
    let sourceData = [];
    if (selectedTripIds.size > 0) {
      const allAvailable = [...transmittedTripsList, ...paymentsList];
      const seen = new Set();
      sourceData = allAvailable.filter(t => {
        if (selectedTripIds.has(t.id) && !seen.has(t.id)) {
          seen.add(t.id);
          return true;
        }
        return false;
      });
    } else if (activeTab === 'excel') {
      sourceData = displayedTransmittedTrips;
    } else {
      sourceData = filteredPayments;
    }

    if (sourceData.length === 0) {
      toast.warning('No hay datos filtrados o seleccionados para exportar.');
      return;
    }

    const exportRows = sourceData.map((p, idx) => ({
      '#': idx + 1,
      'Periodo': p.periodo || '',
      'Fecha Despacho': p.fechaDespacho || p.fecha || '',
      'Cont Cond1': p.contCond1 || '',
      'Tipo Cond1': p.tipoCond1 || '',
      'Rut Cond1': p.rutCond1 || p.rut || '',
      'Nom Cond1': p.nomCond1 || p.nombre || '',
      'Rutas': p.rutas || p.ruta || '',
      'Tipo Servicio': p.tipoServicio || p.tipoPunto || '',
      'Tipo Pago': p.tipoPago || '',
      'Total Puntos Viaje': p.totalPuntosViaje || '',
      'Total M3Viaje': p.totalM3Viaje || '',
      'Segunda Vuelta': p.segundaVuelta || '',
      'Monto Total ($)': Number(p.total) || 0,
      'Contrato Origen': p.contratoOrigen || p.origen || 'Excel',
      'Glosa': p.glosa || '',
      'Es Eventualidad': p.isEventualidad ? 'SI' : 'NO',
      'Es Ajuste RM': p.isRmAdjustment ? 'SI' : 'NO',
      'Asignación Manual': p.isManuallyAssigned ? 'SI' : 'NO'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pago Dotacion');
    XLSX.writeFile(wb, `Pago_Dotacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Archivo Excel descargado: ${exportRows.length} registros exportados.`);
  };

  // -------------------------------------------------------------------------
  // CORREO / OUTLOOK GENERATION (Requisito 10.4)
  // -------------------------------------------------------------------------
  const emailData = useMemo(() => {
    let items = [];
    if (selectedTripIds.size > 0) {
      items = displayedTransmittedTrips.filter(t => selectedTripIds.has(t.id));
      if (items.length === 0) {
        items = transmittedTripsList.filter(t => selectedTripIds.has(t.id));
      }
    } else {
      items = displayedTransmittedTrips;
    }

    const totalMonto = items.reduce((acc, t) => acc + (parseFloat(t.total) || 0), 0);
    const totalViajes = items.length;
    const staffSet = new Set(items.map(t => cleanRut(t.rutCond1) || t.nomCond1));

    const byContract = {};
    items.forEach(t => {
      const c = t.contratoOrigen || t.origen || 'Otros';
      if (!byContract[c]) byContract[c] = { name: c, count: 0, monto: 0 };
      byContract[c].count += 1;
      byContract[c].monto += (parseFloat(t.total) || 0);
    });

    const byStaff = {};
    items.forEach(t => {
      const k = cleanRut(t.rutCond1) || t.nomCond1;
      if (!byStaff[k]) {
        byStaff[k] = {
          rut: t.rutCond1,
          name: t.nomCond1,
          role: t.tipoCond1 || 'Conductor',
          count: 0,
          monto: 0
        };
      }
      byStaff[k].count += 1;
      byStaff[k].monto += (parseFloat(t.total) || 0);
    });

    return {
      items,
      totalMonto,
      totalViajes,
      totalColaboradores: staffSet.size,
      contractSummary: Object.values(byContract).sort((a, b) => b.monto - a.monto),
      staffSummary: Object.values(byStaff).sort((a, b) => b.monto - a.monto)
    };
  }, [selectedTripIds, displayedTransmittedTrips, transmittedTripsList]);

  const generateOutlookHtml = () => {
    const { items, totalMonto, totalViajes, totalColaboradores, contractSummary, staffSummary } = emailData;

    return `
<div style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; max-width: 850px; margin: 0 auto; line-height: 1.5;">
  <div style="background-color: #0f172a; padding: 20px; border-radius: 8px 8px 0 0; color: #ffffff;">
    <h2 style="margin: 0; font-size: 19px; color: #ffffff; letter-spacing: -0.5px;">Key Logistics - Liquidación y Pago Dotación</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
      Reporte de Liquidación y Asignación Operacional • Generado el ${new Date().toLocaleDateString('es-CL')} a las ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>

  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 8px 8px; background-color: #ffffff;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="width: 33.33%; padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Monto Total Liquidado</div>
          <div style="font-size: 20px; font-weight: 900; color: #047857; margin-top: 4px;">${formatCLP(totalMonto)}</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="width: 33.33%; padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Total de Viajes / Vueltas</div>
          <div style="font-size: 20px; font-weight: 900; color: #1e40af; margin-top: 4px;">${totalViajes}</div>
        </td>
        <td style="width: 10px;"></td>
        <td style="width: 33.33%; padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Dotación Activa</div>
          <div style="font-size: 20px; font-weight: 900; color: #334155; margin-top: 4px;">${totalColaboradores} pers.</div>
        </td>
      </tr>
    </table>

    <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 18px 0 8px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      1. Resumen Consolidado por Contrato
    </h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 22px;">
      <thead>
        <tr style="background-color: #1e293b; color: #ffffff; text-align: left;">
          <th style="padding: 8px 10px; border: 1px solid #334155;">Contrato / Origen</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; text-align: center;">Viajes</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; text-align: right;">Monto Total ($)</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; text-align: right;">% Part.</th>
        </tr>
      </thead>
      <tbody>
        ${contractSummary.map((c, i) => `
          <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; font-weight: bold;">${c.name}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: center;">${c.count}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: ${c.monto < 0 ? '#dc2626' : '#047857'};">${formatCLP(c.monto)}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: right; color: #64748b;">${totalMonto > 0 ? ((c.monto / totalMonto) * 100).toFixed(1) : 0}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 18px 0 8px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      2. Resumen por Personal (Conductores y Auxiliares)
    </h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 22px;">
      <thead>
        <tr style="background-color: #334155; color: #ffffff; text-align: left;">
          <th style="padding: 8px 10px; border: 1px solid #475569;">Colaborador</th>
          <th style="padding: 8px 10px; border: 1px solid #475569;">RUT</th>
          <th style="padding: 8px 10px; border: 1px solid #475569; text-align: center;">Rol</th>
          <th style="padding: 8px 10px; border: 1px solid #475569; text-align: center;">Viajes</th>
          <th style="padding: 8px 10px; border: 1px solid #475569; text-align: right;">Total Liquidado ($)</th>
        </tr>
      </thead>
      <tbody>
        ${staffSummary.map((s, i) => `
          <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${s.name}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; color: #64748b;">${s.rut || '-'}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: center;">${s.role}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${s.count}</td>
            <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: ${s.monto < 0 ? '#dc2626' : '#047857'};">${formatCLP(s.monto)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${(emailTemplate === 'detailed' || emailTemplate === 'eventualidades') ? `
      <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 18px 0 8px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
        3. Detalle de Viajes (${items.length})
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background-color: #475569; color: #ffffff; text-align: left;">
            <th style="padding: 7px 8px; border: 1px solid #64748b;">Fecha</th>
            <th style="padding: 7px 8px; border: 1px solid #64748b;">Colaborador</th>
            <th style="padding: 7px 8px; border: 1px solid #64748b;">Ruta</th>
            <th style="padding: 7px 8px; border: 1px solid #64748b;">Tipo / Contrato</th>
            <th style="padding: 7px 8px; border: 1px solid #64748b; text-align: right;">Monto ($)</th>
          </tr>
        </thead>
        <tbody>
          ${items.slice(0, 150).map((t, i) => {
            let bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            if (t.isManuallyAssigned || t.glosa === 'Eventualidad_Key') bg = '#fef3c7';
            else if (t.isRmAdjustment) bg = '#f3e8ff';
            else if (t.isEventualidad) bg = '#e0f2fe';

            return `
              <tr style="background-color: ${bg};">
                <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: bold;">${t.fechaDespacho || t.fecha}</td>
                <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${t.nomCond1} <span style="font-size: 10px; color: #64748b;">(${t.rutCond1})</span></td>
                <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e40af;">${t.rutas || t.ruta}</td>
                <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${t.glosa || t.contratoOrigen || t.origen || '-'}</td>
                <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: ${(parseFloat(t.total) || 0) < 0 ? '#dc2626' : '#047857'};">${formatCLP(t.total)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${items.length > 150 ? `<p style="font-size: 11px; color: #64748b; margin-top: 6px;">* Mostrando los primeros 150 viajes de ${items.length} para optimizar el correo.</p>` : ''}
    ` : ''}

    <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
      Key Logistics SpA • Sistema Integral de Asignación y Pago Dotación • San Bernardo, Santiago de Chile
    </div>
  </div>
</div>
    `.trim();
  };

  const generatePlainTextSummary = () => {
    const { totalMonto, totalViajes, totalColaboradores, contractSummary, staffSummary } = emailData;
    let text = `LIQUIDACIÓN Y PAGO DE DOTACIÓN - KEY LOGISTICS\n`;
    text += `Fecha: ${new Date().toLocaleDateString('es-CL')}\n\n`;
    text += `RESUMEN GENERAL:\n`;
    text += `- Monto Total: ${formatCLP(totalMonto)}\n`;
    text += `- Total Viajes / Vueltas: ${totalViajes}\n`;
    text += `- Personal Liquidado: ${totalColaboradores} colaboradores\n\n`;
    text += `DESGLOSE POR CONTRATO:\n`;
    contractSummary.forEach(c => {
      text += `• ${c.name}: ${c.count} viajes | ${formatCLP(c.monto)}\n`;
    });
    text += `\nRESUMEN POR COLABORADOR (TOP 10):\n`;
    staffSummary.slice(0, 10).forEach(s => {
      text += `• ${s.name} (${s.rut || s.role}): ${s.count} viajes | ${formatCLP(s.monto)}\n`;
    });
    text += `\nKey Logistics SpA - Gestión Operacional`;
    return text;
  };

  const handleOpenOutlookMailto = () => {
    const subject = emailSubject.trim() || `Liquidación Pago Dotación - ${new Date().toLocaleDateString('es-CL')}`;
    const body = generatePlainTextSummary();
    const mailto = `mailto:${encodeURIComponent(emailTo)}?cc=${encodeURIComponent(emailCc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
    toast.success('Abriendo cliente de correo Outlook...');
  };

  const handleCopyOutlookHtml = async () => {
    const html = generateOutlookHtml();
    const plain = generatePlainTextSummary();
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([plain], { type: 'text/plain' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast.success('¡Tabla HTML copiada! Pégala directamente en Outlook con Ctrl+V');
    } catch (err) {
      console.warn('Clipboard write error:', err);
      await navigator.clipboard.writeText(plain);
      toast.info('Copiado texto plano al portapapeles');
    }
  };

  // Histórico de cambios filtrado
  const filteredHistoryList = useMemo(() => {
    let list = changeHistory || [];
    if (historyFilterAction !== 'TODOS') {
      list = list.filter(h => h.action === historyFilterAction);
    }
    if (historySearchTerm.trim()) {
      const term = historySearchTerm.toLowerCase().trim();
      list = list.filter(h => {
        const full = [h.details, h.user, h.timestamp, h.action].filter(Boolean).join(' ').toLowerCase();
        return full.includes(term);
      });
    }
    return list;
  }, [changeHistory, historyFilterAction, historySearchTerm]);

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

        {/* Acciones de Cabecera (Requisito 10.4) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Histórico de Cambios */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsHistoryModalOpen(true)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs h-9 px-3 flex items-center gap-1.5 rounded-xl cursor-pointer border border-slate-200"
          >
            <History size={14} className="text-blue-600" />
            Histórico de cambios
            {changeHistory.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full text-[10px] font-black">
                {changeHistory.length}
              </span>
            )}
          </Button>

          {/* Botón Enviar por Correo (Outlook) */}
          <Button
            type="button"
            onClick={() => {
              setEmailSubject(`Liquidación y Pago de Dotación - Key Logistics (${new Date().toLocaleDateString('es-CL')})`);
              setIsEmailModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 rounded-xl cursor-pointer shadow-xs"
          >
            <Mail size={14} />
            Enviar por correo (Outlook)
            {selectedTripIds.size > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-white/20 text-white rounded-full text-[10px] font-black">
                {selectedTripIds.size}
              </span>
            )}
          </Button>

          {/* Botón Exportar Todo / Filtrados */}
          {paymentsList.length > 0 && (
            <Button
              type="button"
              onClick={handleExportMasterExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 rounded-xl cursor-pointer shadow-xs"
            >
              <Download size={14} />
              Exportar {selectedTripIds.size > 0 ? `Seleccionados (${selectedTripIds.size})` : `Todo (${(activeTab === 'excel' ? displayedTransmittedTrips : filteredPayments).length})`}
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

              {/* Filtro por Conductor (con escritura) */}
              <div className="w-48 relative">
                <input
                  type="text"
                  list="conductores-dashboard-list"
                  placeholder="Escribir o elegir Conductor..."
                  value={filterConductor}
                  onChange={(e) => setFilterConductor(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <datalist id="conductores-dashboard-list">
                  {allConductores.map(c => (
                    <option key={c.rut || c.name} value={c.name}>
                      {c.rut ? `${c.name} (${c.rut})` : c.name}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Filtro por Auxiliar (con escritura) */}
              <div className="w-48 relative">
                <input
                  type="text"
                  list="auxiliares-dashboard-list"
                  placeholder="Escribir o elegir Auxiliar..."
                  value={filterAuxiliar}
                  onChange={(e) => setFilterAuxiliar(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <datalist id="auxiliares-dashboard-list">
                  {allAuxiliares.map(a => (
                    <option key={a.rut || a.name} value={a.name}>
                      {a.rut ? `${a.name} (${a.rut})` : a.name}
                    </option>
                  ))}
                </datalist>
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
                    {filteredPayments.map((row) => {
                      const isManual = row.isManuallyAssigned;
                      const isEv = !isManual && (
                        row.isEventualidad || 
                        String(row.tipoPunto || '').toLowerCase().includes('eventualidad') || 
                        String(row.rutas || '').toLowerCase().includes('eventualidad') || 
                        String(row.glosa || '').toLowerCase().includes('eventualidad')
                      );
                      const rowClass = isManual 
                        ? 'bg-amber-100 hover:bg-amber-200/80 border-l-4 border-l-amber-500 font-semibold text-slate-900' 
                        : isEv 
                          ? 'bg-sky-100 hover:bg-sky-200/80 border-l-4 border-l-sky-500 font-semibold text-slate-900' 
                          : 'hover:bg-slate-50/80';
                      return (
                      <tr key={row.id} className={`${rowClass} transition-colors`}>
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
                        <td className={`px-3 py-2 text-right font-black ${(parseFloat(row.total) || 0) < 0 ? "text-red-600 bg-red-50/60" : "text-emerald-700"}`}>
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
                    );
                  })}
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
                    {loadedContractsBatch.slice(0, 100).map((row) => {
                      const isEv = row.isEventualidad || 
                        String(row.tipoPunto || '').toLowerCase().includes('eventualidad') || 
                        String(row.rutas || '').toLowerCase().includes('eventualidad');
                      return (
                      <tr key={row.id} className={isEv ? 'bg-sky-100 hover:bg-sky-200/80 border-l-4 border-l-sky-500 font-semibold text-slate-900' : 'hover:bg-slate-50'}>
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
                        <td className={`px-3 py-2 text-right font-black ${(parseFloat(row.total) || 0) < 0 ? "text-red-600 bg-red-50/60" : "text-emerald-700"}`}>{formatCLP(row.total)}</td>
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
                    );
                  })}
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

          {/* Banner de Última Fecha de Carga por Contrato (Requisito 1) */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-600" />
                Última Fecha de Carga por Contrato
              </span>
              <span className="text-[10px] text-slate-400">
                Cada contrato nuevo subido pisa al anterior del mismo tipo. Los registros "Eventualidad_Key" se mantienen siempre.
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Colectivo */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    Colectivo
                  </span>
                  <span className={`w-2 h-2 rounded-full ${contractUploadDates?.colectivo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <p className="text-xs font-black text-slate-800">
                  {contractUploadDates?.colectivo || 'Sin cargas'}
                </p>
              </div>

              {/* Contrato 8 */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                    Contrato 8
                  </span>
                  <span className={`w-2 h-2 rounded-full ${contractUploadDates?.contrato8 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <p className="text-xs font-black text-slate-800">
                  {contractUploadDates?.contrato8 || 'Sin cargas'}
                </p>
              </div>

              {/* Contrato 9 */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                    Contrato 9
                  </span>
                  <span className={`w-2 h-2 rounded-full ${contractUploadDates?.contrato9 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <p className="text-xs font-black text-slate-800">
                  {contractUploadDates?.contrato9 || 'Sin cargas'}
                </p>
              </div>

              {/* Contrato 13 */}
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Contrato 13
                  </span>
                  <span className={`w-2 h-2 rounded-full ${contractUploadDates?.contrato13 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <p className="text-xs font-black text-slate-800">
                  {contractUploadDates?.contrato13 || 'Sin cargas'}
                </p>
              </div>
            </div>
          </div>

          {/* Barra Superior: Filtros con Escritura para Personal, Tipo Servicio y Búsqueda */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-blue-600" />
                  Planilla Operacional de Viajes Transmitidos ({displayedTransmittedTrips.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Filtra escribiendo el nombre o RUT del colaborador, tipo de servicio o asigna nuevos viajes con glosa Eventualidad_Key
                </p>
              </div>

              {/* Filtros con Escritura */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. Selector/Buscador de Conductor o Auxiliar con escritura */}
                <div className="w-64 relative">
                  <input
                    type="text"
                    list="excel-staff-datalist"
                    placeholder="Escribir o buscar Personal..."
                    value={excelStaffInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExcelStaffInput(val);
                      const matched = transmittedStaffList.find(s => 
                        cleanRut(s.rut) === cleanRut(val) || 
                        `${s.name} (${s.role}) - ${s.rut}` === val ||
                        s.name.toLowerCase() === val.toLowerCase()
                      );
                      if (matched) {
                        setExcelSelectedStaffRut(matched.rut);
                        setNewTripForm(prev => ({ ...prev, staffRut: matched.rut }));
                        setAssignStaffInputValue(`${matched.name} (${matched.role}) - ${matched.rut}`);
                      } else if (!val.trim()) {
                        setExcelSelectedStaffRut('');
                      }
                    }}
                    className="w-full py-1.5 pl-3 pr-7 text-xs bg-white border border-blue-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                  />
                  {excelStaffInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setExcelStaffInput('');
                        setExcelSelectedStaffRut('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                  <datalist id="excel-staff-datalist">
                    {transmittedStaffList.map(s => (
                      <option key={s.rut} value={`${s.name} (${s.role}) - ${s.rut}`}>
                        RUT: {s.rut}
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* 2. Filtro Tipo de Servicio con escritura */}
                <div className="w-48 relative">
                  <input
                    type="text"
                    list="excel-service-datalist"
                    placeholder="Filtrar Tipo Servicio..."
                    value={excelServiceTypeInput}
                    onChange={(e) => setExcelServiceTypeInput(e.target.value)}
                    className="w-full py-1.5 pl-3 pr-7 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />
                  {excelServiceTypeInput && (
                    <button
                      type="button"
                      onClick={() => setExcelServiceTypeInput('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                  <datalist id="excel-service-datalist">
                    {SERVICE_TYPE_OPTIONS.map(opt => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>

                {/* 3. Búsqueda libre */}
                <div className="w-44 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder="Buscar ruta, glosa..."
                    value={excelSearchText}
                    onChange={(e) => setExcelSearchText(e.target.value)}
                    className="w-full py-1.5 pl-7 pr-6 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {excelSearchText && (
                    <button
                      type="button"
                      onClick={() => setExcelSearchText('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Limpiar filtros */}
                {(excelStaffInput || excelSelectedStaffRut || excelServiceTypeInput || excelSearchText || filterContracts.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setExcelStaffInput('');
                      setExcelSelectedStaffRut('');
                      setExcelServiceTypeInput('');
                      setExcelSearchText('');
                      setFilterContracts([]);
                    }}
                    className="text-xs text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <X size={12} /> Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Filtros por Contrato y Selección Rápida (Requisito 10.4) */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2.5 border-t border-slate-200">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-black text-slate-700 flex items-center gap-1 mr-1">
                  <Filter size={12} className="text-blue-600" />
                  Filtrar por Contrato:
                </span>
                {CONTRACT_FILTER_OPTIONS.map(cOpt => {
                  const isSelected = filterContracts.includes(cOpt.id);
                  return (
                    <button
                      key={cOpt.id}
                      type="button"
                      onClick={() => toggleContractFilter(cOpt.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected ? <Check size={12} /> : null}
                      {cOpt.label}
                    </button>
                  );
                })}

                {filterContracts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterContracts([])}
                    className="text-[11px] text-blue-600 hover:underline font-bold ml-1 cursor-pointer"
                  >
                    (Todos)
                  </button>
                )}
              </div>

              {/* Botones de Selección Rápida y Acciones Masivas */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectAllEventualidadKey}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 font-bold text-xs h-7.5 px-2.5 flex items-center gap-1 rounded-lg cursor-pointer"
                  title="Seleccionar todos los registros de Eventualidad_Key"
                >
                  <Sparkles size={12} className="text-amber-600" />
                  ★ Seleccionar Eventualidad_Key
                </Button>

                {selectedTripIds.size > 0 && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-800">
                    <span>{selectedTripIds.size} seleccionados</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTripIds(new Set())}
                      className="text-blue-600 hover:text-blue-900 underline font-normal text-[11px] cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
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
                    <span className={`text-sm font-black ${
                      displayedTransmittedTrips.reduce((acc, t) => acc + (parseFloat(t.total) || 0), 0) < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}>
                      {formatCLP(displayedTransmittedTrips.reduce((acc, t) => acc + (parseFloat(t.total) || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Formulario para Asignar Nuevos Viajes Directamente (3.7) */}
            <form onSubmit={handleAddNewTransmittedTrip} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 bg-amber-100 text-amber-800 rounded-md">
                    <Plus size={14} />
                  </span>
                  <span className="text-xs font-black text-slate-800">
                    Asignar Nuevo Viaje (Glosa "Eventualidad_Key", se destaca en amarillo pastel y se refleja en la plataforma)
                  </span>
                </div>
                <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                  Glosa: Eventualidad_Key
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

                {/* 2. Personal (con escritura y datalist) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Personal (Escribir o buscar)</label>
                  <input
                    type="text"
                    list="assign-staff-datalist"
                    placeholder="Escribir nombre o RUT..."
                    value={assignStaffInputValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAssignStaffInputValue(val);
                      const matched = transmittedStaffList.find(s => 
                        cleanRut(s.rut) === cleanRut(val) || 
                        `${s.name} (${s.role}) - ${s.rut}` === val ||
                        s.name.toLowerCase().includes(val.toLowerCase())
                      );
                      if (matched) {
                        setNewTripForm(prev => ({ ...prev, staffRut: matched.rut }));
                      } else {
                        setNewTripForm(prev => ({ ...prev, staffRut: cleanRut(val) }));
                      }
                    }}
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <datalist id="assign-staff-datalist">
                    {transmittedStaffList.map(s => (
                      <option key={s.rut} value={`${s.name} (${s.role}) - ${s.rut}`}>
                        {s.name} ({s.role}) - RUT: {s.rut}
                      </option>
                    ))}
                  </datalist>
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

                {/* 4. Tipo Servicio (con escritura y datalist) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tipo Servicio (Escribir)</label>
                  <input
                    type="text"
                    list="assign-service-datalist"
                    placeholder="Seleccionar o escribir..."
                    value={newTripForm.tipoServicio}
                    onChange={(e) => setNewTripForm({ ...newTripForm, tipoServicio: e.target.value })}
                    className="w-full py-1.5 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <datalist id="assign-service-datalist">
                    {SERVICE_TYPE_OPTIONS.map(opt => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>

                {/* 5. Monto (Rojo si es negativo) */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto ($ CLP)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder="Ej. 20000 o -2000"
                      value={newTripForm.monto}
                      onChange={(e) => setNewTripForm({ ...newTripForm, monto: e.target.value })}
                      className={`w-full py-1.5 px-2.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-black ${
                        (parseFloat(newTripForm.monto) || 0) < 0 
                          ? 'text-red-600 bg-red-50/60 border-red-300' 
                          : 'text-emerald-700 border-slate-200'
                      }`}
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
                    <th className="px-2.5 py-2.5 border-r border-slate-300 w-9 text-center">
                      <input
                        type="checkbox"
                        checked={displayedTransmittedTrips.length > 0 && displayedTransmittedTrips.every(t => selectedTripIds.has(t.id))}
                        onChange={handleSelectAllVisible}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Seleccionar / Deseleccionar todos los visibles"
                      />
                    </th>
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
                    const isRm = row.isRmAdjustment;
                    const isEventualidad = !isManual && !isRm && (
                      row.isEventualidad || 
                      String(row.tipoPunto || '').toLowerCase().includes('eventualidad') || 
                      String(row.rutas || '').toLowerCase().includes('eventualidad') || 
                      String(row.tipoServicio || '').toLowerCase().includes('eventualidad') || 
                      String(row.glosa || '').toLowerCase().includes('eventualidad')
                    );

                    // Colores por tipo:
                    // 1. Ajuste por escala oficial RM Puntos/M3: Morado/Violeta pastel (Requisito 10.2)
                    // 2. Asignación manual desde plataforma (Eventualidad_Key): Amarillo pastel
                    // 3. Eventualidades de los 4 archivos subidos: Celeste pastel
                    // 4. Normal: slate
                    let rowClass = 'hover:bg-slate-50';
                    if (isRm) {
                      rowClass = 'bg-purple-100 hover:bg-purple-200/80 border-l-4 border-l-purple-600 font-semibold text-purple-950';
                    } else if (isManual) {
                      rowClass = 'bg-amber-100 hover:bg-amber-200/80 border-l-4 border-l-amber-500 font-semibold text-slate-900';
                    } else if (isEventualidad) {
                      rowClass = 'bg-sky-100 hover:bg-sky-200/80 border-l-4 border-l-sky-500 font-semibold text-slate-900';
                    }

                    return (
                      <tr 
                        key={row.id}
                        className={`transition-colors ${rowClass}`}
                      >
                        <td className="px-2.5 py-2 text-center border-r border-slate-200">
                          <input
                            type="checkbox"
                            checked={selectedTripIds.has(row.id)}
                            onChange={() => toggleSelectTrip(row.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
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
                        <td className={`px-3 py-2 text-right font-black border-r border-slate-200 text-sm ${
                          (parseFloat(row.total) || 0) < 0 ? 'text-red-600 bg-red-50/60' : (isRm ? 'text-purple-900' : 'text-emerald-800')
                        }`}>
                          <div>{formatCLP(row.total)}</div>
                          {row.originalExcelTotal !== undefined && (
                            <div className="text-[10px] text-purple-700 font-normal">
                              Excel: {formatCLP(row.originalExcelTotal)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] border ${
                            isRm
                              ? 'bg-purple-200 text-purple-950 border-purple-300 shadow-2xs'
                              : isManual
                                ? 'bg-amber-200 text-amber-950 border-amber-300 shadow-2xs'
                                : isEventualidad
                                  ? 'bg-sky-200 text-sky-950 border-sky-300 shadow-2xs'
                                  : 'bg-white/80 border-slate-200 text-slate-700'
                          }`}>
                            {row.glosa || row.contratoOrigen || row.origen || 'Excel'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center border-r border-slate-200">
                          {isRm ? (
                            <span className="px-2 py-0.5 bg-purple-200 text-purple-950 border border-purple-300 rounded font-black text-[10px] inline-flex items-center gap-1">
                              ✦ Ajuste RM
                            </span>
                          ) : isManual ? (
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 border border-amber-300 rounded font-black text-[10px]">
                              ★ Eventualidad_Key
                            </span>
                          ) : isEventualidad ? (
                            <span className="px-2 py-0.5 bg-sky-200 text-sky-900 border border-sky-300 rounded font-black text-[10px]">
                              ◆ Eventualidad
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
                              onClick={async () => {
                                const newAmount = prompt('Nuevo monto para este viaje ($):', String(row.total || 0));
                                if (newAmount !== null) {
                                  const parsed = parseFloat(newAmount.replace(/[^\d.-]/g, '')) || 0;
                                  await updateTransmittedTrip(row.id, { total: parsed, pagoCond1: parsed }, currentUserName);
                                }
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar Monto"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(`¿Eliminar viaje de ${row.nomCond1} en ruta ${row.rutas}? Esta acción eliminará el viaje de todas las vistas y se conservará en el histórico de cambios.`)) {
                                  await deleteTransmittedTrip(row.id, currentUserName);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Eliminar de todas las vistas"
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
                  await updatePayment(editingPayment.id, { total: parsed, pagoCond1: parsed }, currentUserName);
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

      {/* ========================================================================= */}
      {/* MODAL HISTÓRICO DE CAMBIOS (Requisito 10.4) */}
      {/* ========================================================================= */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Cabecera del Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    Histórico de Cambios y Modificaciones
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-black">
                      {filteredHistoryList.length} registros
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Registro auditable permanente de eliminaciones, ediciones, ajustes por escala RM y transmisiones
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filtros dentro del Histórico */}
            <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['TODOS', 'ELIMINACION', 'EDICION', 'AJUSTE_RM', 'CREACION', 'TRANSMISION'].map(act => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setHistoryFilterAction(act)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      historyFilterAction === act
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {act === 'TODOS' ? 'Todos' : act}
                  </button>
                ))}
              </div>

              <div className="w-64 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Buscar en el histórico..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Lista / Timeline del Histórico */}
            <div className="overflow-y-auto p-4 flex-1 divide-y divide-slate-100 space-y-3">
              {filteredHistoryList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <History size={36} className="mx-auto text-slate-300" />
                  <p className="font-bold text-xs text-slate-600">No se encontraron eventos en el histórico</p>
                  <p className="text-[11px] text-slate-400">
                    Todas las acciones de eliminación, edición o ajuste quedarán registradas aquí permanentemente.
                  </p>
                </div>
              ) : (
                filteredHistoryList.map(item => {
                  let badgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
                  if (item.action === 'ELIMINACION') badgeClass = 'bg-red-100 text-red-800 border-red-200';
                  else if (item.action === 'EDICION') badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                  else if (item.action === 'AJUSTE_RM') badgeClass = 'bg-purple-100 text-purple-900 border-purple-200';
                  else if (item.action === 'CREACION') badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  else if (item.action === 'TRANSMISION') badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';

                  return (
                    <div key={item.id} className="pt-3 first:pt-0 flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase ${badgeClass}`}>
                              {item.action}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              Usuario: {item.user || 'Sistema'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {item.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1 font-medium leading-relaxed">
                          {item.details}
                        </p>
                        {item.recordSnapshot && (
                          <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 font-mono flex flex-wrap gap-x-4 gap-y-1">
                            {item.recordSnapshot.fechaDespacho && <span><strong>Fecha:</strong> {item.recordSnapshot.fechaDespacho}</span>}
                            {item.recordSnapshot.nomCond1 && <span><strong>Personal:</strong> {item.recordSnapshot.nomCond1}</span>}
                            {item.recordSnapshot.rutCond1 && <span><strong>RUT:</strong> {item.recordSnapshot.rutCond1}</span>}
                            {item.recordSnapshot.rutas && <span><strong>Ruta:</strong> {item.recordSnapshot.rutas}</span>}
                            {item.recordSnapshot.total !== undefined && <span><strong>Monto:</strong> {formatCLP(item.recordSnapshot.total)}</span>}
                            {item.recordSnapshot.contratoOrigen && <span><strong>Contrato:</strong> {item.recordSnapshot.contratoOrigen}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pie del Modal */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Mostrando {filteredHistoryList.length} registro(s) auditados
              </span>
              <Button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs h-8.5 px-4 rounded-xl cursor-pointer"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL ENVIAR POR CORREO (OUTLOOK) CON PREVIEW (Requisito 10.4) */}
      {/* ========================================================================= */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Cabecera del Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    Enviar Planilla y Liquidación por Correo (Outlook)
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-black">
                      {emailData.items.length} viajes incluidos
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Previsualiza la tabla con formato oficial para Outlook y envíala directamente o cópiala al portapapeles
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Configuración de Envío y Selección de Plantilla Tipo */}
            <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Para:</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="destinatario@keylogistics.cl"
                  className="w-full py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">CC (Copia):</label>
                <input
                  type="text"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="copia@keylogistics.cl"
                  className="w-full py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Plantilla Tipo:</label>
                <select
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                >
                  <option value="executive">1. Resumen Ejecutivo por Contrato</option>
                  <option value="detailed">2. Detalle Completo de Viajes</option>
                  <option value="eventualidades">3. Especial Eventualidad_Key</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Asunto:</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Asunto del correo..."
                  className="w-full py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                />
              </div>
            </div>

            {/* Previsualización en Tiempo Real (Live Preview) */}
            <div className="p-4 bg-slate-100 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                  <Eye size={13} className="text-blue-600" />
                  Previsualización en Tiempo Real (Formato Outlook)
                </span>
                <span className="text-[10px] text-slate-500">
                  Total: {formatCLP(emailData.totalMonto)} • {emailData.totalViajes} viajes • {emailData.totalColaboradores} colaboradores
                </span>
              </div>

              <div 
                className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 overflow-x-auto text-xs"
                dangerouslySetInnerHTML={{ __html: generateOutlookHtml() }}
              />
            </div>

            {/* Botones de Acción */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2.5">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyOutlookHtml}
                  className="text-xs h-9 px-3.5 flex items-center gap-1.5 bg-white border-slate-300 font-bold hover:bg-slate-100 cursor-pointer"
                  title="Copia la tabla HTML con colores lista para pegar en Outlook con Ctrl+V"
                >
                  <Copy size={13} />
                  Copiar Tabla HTML para Outlook
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(generatePlainTextSummary());
                    toast.success('Texto resumen copiado al portapapeles');
                  }}
                  className="text-xs h-9 px-3 bg-white border-slate-300 font-medium hover:bg-slate-100 cursor-pointer"
                >
                  Copiar Texto
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="text-xs h-9 px-4 cursor-pointer"
                >
                  Cerrar
                </Button>
                <Button
                  type="button"
                  onClick={handleOpenOutlookMailto}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-9 px-4 flex items-center gap-1.5 rounded-xl cursor-pointer shadow-xs"
                >
                  <ExternalLink size={14} />
                  Abrir en Outlook (mailto)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
