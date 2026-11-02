import React, { useState, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Trash2, Plus, 
  Search, Filter, Download, DollarSign, Calendar, Truck, 
  Users, Edit3, X, RefreshCw, FileText, ArrowUpDown
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useStaffStore } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { usePagoDotacionStore } from '../store/pagoDotacionStore';
import { ALL_OPERACIONES, ROUTE_OPERATIONS_MAP, canonicalizeOperation } from '../data/operacionesMaster';

// 28 Columnas oficiales requeridas por el usuario
export const OFFICIAL_PAYMENT_COLUMNS = [
  'Periodo',
  'Fecha Despacho',
  'Cont Cond1',
  'Tipo Cond1',
  'Cond1',
  'Rut Cond1',
  'Nom Cond1',
  'Rutas',
  'Transportistas',
  'Owners',
  'Linea Negocio',
  'regiones',
  'Tipo Pago',
  'Tipo Calculo',
  'Segunda Vuelta',
  'Centralizado',
  'Tipo Equipo',
  'Codigo Equipo',
  'Total Puntos Viaje',
  'Total M3Viaje',
  'Total Cajas Viaje',
  'Valor Punto Conductor',
  'Valor Punto Auxiliar',
  'Valor Ruta',
  'Valor Destino Cond1',
  'Pago Cond1',
  'Tiempo Espera Cond1',
  'Total'
];

// Opciones oficiales de Tipo de Servicio:
// Los mismos que están en la Disponibilización (Servicios Extras) + "Ruta"
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

// Helper para limpiar RUTs
const cleanRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
const cleanStr = (s) => String(s || '').trim();

// Formato de moneda CLP chilena ($ X.XXX.XXX)
const formatCLP = (amount) => {
  const num = Number(amount) || 0;
  return '$' + Math.round(num).toLocaleString('es-CL');
};

export default function PagoDotacion() {
  const [activeTab, setActiveTab] = useState('resumen'); // 'masiva' | 'manual' | 'resumen'

  // Stores
  const { staffList, fetchStaff } = useStaffStore();
  const { attendanceList, fetchAttendanceByDateRange } = useAttendanceStore();
  const { transmittedAssignments } = usePlanningStore();
  const { 
    paymentsList, 
    fetchPayments, 
    addBatchPayments, 
    addManualPayment, 
    updatePayment, 
    deletePayment, 
    isLoading 
  } = usePagoDotacionStore();

  useEffect(() => {
    fetchStaff();
    fetchPayments();
  }, [fetchStaff, fetchPayments]);

  // ==========================================
  // TAB 1: CARGA MASIVA DE EXCEL CON CRUCE DISPONIBILIZACIÓN
  // ==========================================
  const [parsedExcelRows, setParsedExcelRows] = useState([]);
  const [matchConflicts, setMatchConflicts] = useState([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictDecisions, setConflictDecisions] = useState({}); // { [rowId]: 'mantener' | 'cambiar' }

  const onDropExcel = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (json.length === 0) {
          toast.error('El archivo Excel está vacío.');
          return;
        }

        // Normalizador de claves de fila insensible a mayúsculas/acentos
        const processed = json.map((row, idx) => {
          const rowKeys = Object.keys(row);
          const getVal = (targetName) => {
            const cleanTarget = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundKey = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);
            return foundKey ? row[foundKey] : '';
          };

          const rawFecha = getVal('Fecha Despacho') || getVal('Fecha') || '';
          const normFecha = normalizeDate(rawFecha);
          const rutCond = cleanRut(getVal('Rut Cond1') || getVal('RUT'));
          const nomCond = cleanStr(getVal('Nom Cond1') || getVal('Cond1') || getVal('Nombre'));
          const ruta = cleanStr(getVal('Rutas') || getVal('Ruta'));
          const totalVal = parseFloat(String(getVal('Total') || getVal('Pago Cond1') || getVal('Monto') || 0).replace(/[^\d.-]/g, '')) || 0;

          return {
            id: `excel-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            periodo: cleanStr(getVal('Periodo')),
            fechaDespacho: normFecha || rawFecha,
            contCond1: cleanStr(getVal('Cont Cond1')),
            tipoCond1: cleanStr(getVal('Tipo Cond1')),
            cond1: cleanStr(getVal('Cond1')),
            rutCond1: rutCond,
            nomCond1: nomCond,
            rutas: ruta,
            transportistas: cleanStr(getVal('Transportistas') || getVal('Transportista')),
            owners: cleanStr(getVal('Owners')),
            lineaNegocio: cleanStr(getVal('Linea Negocio')),
            regiones: cleanStr(getVal('regiones') || getVal('Region') || getVal('Región')),
            tipoPago: cleanStr(getVal('Tipo Pago')),
            tipoCalculo: cleanStr(getVal('Tipo Calculo')),
            segundaVuelta: cleanStr(getVal('Segunda Vuelta')),
            centralizado: cleanStr(getVal('Centralizado')),
            tipoEquipo: cleanStr(getVal('Tipo Equipo')),
            codigoEquipo: cleanStr(getVal('Codigo Equipo')),
            totalPuntosViaje: getVal('Total Puntos Viaje') || 0,
            totalM3Viaje: getVal('Total M3Viaje') || 0,
            totalCajasViaje: getVal('Total Cajas Viaje') || 0,
            valorPuntoConductor: getVal('Valor Punto Conductor') || 0,
            valorPuntoAuxiliar: getVal('Valor Punto Auxiliar') || 0,
            valorRuta: getVal('Valor Ruta') || 0,
            valorDestinoCond1: getVal('Valor Destino Cond1') || 0,
            pagoCond1: getVal('Pago Cond1') || totalVal,
            tiempoEsperaCond1: getVal('Tiempo Espera Cond1') || 0,
            total: totalVal,
            tipoServicio: 'Ruta',
            origen: 'Excel'
          };
        });

        // Cruce con Disponibilización:
        // Si el viaje del Excel tiene coincidencia en la Disponibilización o en pagos guardados
        // (Misma fecha, misma ruta, mismo conductor)
        const conflictsFound = [];
        const decisionsInit = {};

        processed.forEach(item => {
          const itemFecha = item.fechaDespacho;
          const itemRuta = item.rutas;
          const itemRut = cleanRut(item.rutCond1);
          const itemNom = item.nomCond1.toUpperCase();

          // 1. Buscar en asignaciones de Disponibilización
          const dayAssignments = transmittedAssignments?.[itemFecha] || [];
          const matchedDisp = dayAssignments.find(a => {
            const matchRuta = String(a.ruta || '').trim() === itemRuta;
            const matchCond = (itemRut && cleanRut(a.conductor_rut) === itemRut) ||
                              (itemNom && cleanStr(a.conductor_name).toUpperCase() === itemNom);
            return matchRuta && matchCond;
          });

          // 2. Buscar en pagos ya registrados previamente
          const matchedExistingPayment = paymentsList.find(p => {
            const matchRuta = String(p.rutas || '').trim() === itemRuta;
            const matchFecha = p.fechaDespacho === itemFecha;
            const matchCond = (itemRut && cleanRut(p.rutCond1) === itemRut) ||
                              (itemNom && cleanStr(p.nomCond1).toUpperCase() === itemNom);
            return matchFecha && matchRuta && matchCond;
          });

          if (matchedDisp || matchedExistingPayment) {
            const currentAmount = matchedExistingPayment ? matchedExistingPayment.total : 0;
            conflictsFound.push({
              rowId: item.id,
              fecha: itemFecha,
              ruta: itemRuta,
              conductor: item.nomCond1 || item.rutCond1,
              rut: item.rutCond1,
              montoExcel: item.total,
              montoRegistrado: currentAmount,
              existingPaymentId: matchedExistingPayment ? matchedExistingPayment.id : null,
              excelRow: item
            });
            // Por defecto sugerir 'cambiar' (actualizar monto) o 'mantener'
            decisionsInit[item.id] = 'cambiar';
          }
        });

        setParsedExcelRows(processed);

        if (conflictsFound.length > 0) {
          setMatchConflicts(conflictsFound);
          setConflictDecisions(decisionsInit);
          setIsConflictModalOpen(true);
          toast.warning(`Se encontraron ${conflictsFound.length} coincidencias con la Disponibilización.`);
        } else {
          toast.success(`Excel procesado: ${processed.length} registros listos para guardar.`);
        }
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar el archivo Excel. Revisa el formato.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropExcel,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1
  });

  // Confirmar procesamiento tras resolver modal de coincidencias
  const handleConfirmConflicts = async () => {
    let finalRowsToInsert = [];
    const updatesToPerform = [];

    parsedExcelRows.forEach(row => {
      const conflict = matchConflicts.find(c => c.rowId === row.id);
      if (conflict) {
        const decision = conflictDecisions[row.id] || 'cambiar';
        if (decision === 'cambiar' && conflict.existingPaymentId) {
          // Actualizar monto de la existente en lugar de duplicar
          updatesToPerform.push({
            id: conflict.existingPaymentId,
            total: row.total,
            pagoCond1: row.pagoCond1,
            periodo: row.periodo || undefined
          });
        } else {
          // Mantener ambas
          finalRowsToInsert.push(row);
        }
      } else {
        finalRowsToInsert.push(row);
      }
    });

    // Ejecutar actualizaciones
    for (const up of updatesToPerform) {
      await updatePayment(up.id, { total: up.total, pagoCond1: up.pagoCond1 });
    }

    // Insertar nuevas
    if (finalRowsToInsert.length > 0) {
      await addBatchPayments(finalRowsToInsert);
    }

    setIsConflictModalOpen(false);
    setParsedExcelRows([]);
    setMatchConflicts([]);
    setActiveTab('resumen');
  };

  // Guardar directo si no hubo conflictos
  const handleSaveParsedExcel = async () => {
    if (parsedExcelRows.length === 0) return;
    await addBatchPayments(parsedExcelRows);
    setParsedExcelRows([]);
    setActiveTab('resumen');
  };

  // ==========================================
  // TAB 2: CARGAR VIAJE MANUAL (Dotación desde Asistencia, Rutas desde Briefing)
  // ==========================================
  const [manualForm, setManualForm] = useState({
    fechaDespacho: normalizeDate(new Date()) || '02-11-2026',
    staffId: '',
    ruta: '',
    tipoServicio: 'Ruta',
    monto: '',
    observacion: ''
  });

  // Lista de Dotación disponible desde Asistencia / StaffList
  const staffOptions = useMemo(() => {
    return staffList
      .filter(s => s.status === 'Activo')
      .map(s => ({
        value: s.id,
        label: `${s.name} (${s.rut}) - ${s.role}`,
        staff: s
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staffList]);

  // Lista de Rutas y Operaciones disponibles desde Briefing
  const briefingRouteOptions = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Rutas del catálogo maestro
    Object.values(ROUTE_OPERATIONS_MAP).forEach(item => {
      const key = `${item.ruta} - ${item.denominacion || item.operacion}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          value: item.ruta,
          label: `${item.ruta} | ${item.operacion} (${item.denominacion || 'Ruta oficial'})`,
          operacion: item.operacion
        });
      }
    });

    // 2. Operaciones generales de Briefing
    ALL_OPERACIONES.forEach(op => {
      const canon = canonicalizeOperation(op) || op;
      if (!seen.has(canon)) {
        seen.add(canon);
        list.push({
          value: canon,
          label: `Operación: ${canon}`,
          operacion: canon
        });
      }
    });

    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    if (!manualForm.staffId || !manualForm.ruta || !manualForm.monto) {
      toast.warning('Por favor completa Dotación, Ruta y Monto.');
      return;
    }

    const selectedStaff = staffList.find(s => s.id === manualForm.staffId);
    if (!selectedStaff) {
      toast.error('Personal no encontrado');
      return;
    }

    const numericMonto = parseFloat(String(manualForm.monto).replace(/[^\d.-]/g, '')) || 0;
    const [y, m] = manualForm.fechaDespacho.split('-').length === 3
      ? [manualForm.fechaDespacho.split('-')[2], manualForm.fechaDespacho.split('-')[1]]
      : [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0')];
    const periodo = `${y}-${m}`;

    const newPayment = {
      periodo,
      fechaDespacho: manualForm.fechaDespacho,
      contCond1: 'Propio',
      tipoCond1: selectedStaff.role || 'Conductor',
      cond1: selectedStaff.name,
      rutCond1: selectedStaff.rut,
      nomCond1: selectedStaff.name,
      rutas: manualForm.ruta,
      transportistas: 'T300 (Key)',
      owners: 'KEY LOGISTICS',
      lineaNegocio: 'Distribución',
      regiones: 'RM',
      tipoPago: 'Servicio',
      tipoCalculo: 'Monto Fijo',
      segundaVuelta: 'No',
      centralizado: 'No',
      tipoEquipo: 'Camión',
      codigoEquipo: '-',
      totalPuntosViaje: 1,
      totalM3Viaje: 0,
      totalCajasViaje: 0,
      valorPuntoConductor: 0,
      valorPuntoAuxiliar: 0,
      valorRuta: numericMonto,
      valorDestinoCond1: 0,
      pagoCond1: numericMonto,
      tiempoEsperaCond1: 0,
      total: numericMonto,
      tipoServicio: manualForm.tipoServicio,
      observacion: manualForm.observacion || ''
    };

    // Validar si ya existe este viaje en Disponibilización para advertir al usuario
    const dayAssignments = transmittedAssignments?.[manualForm.fechaDespacho] || [];
    const matchedDisp = dayAssignments.find(a => {
      const matchRuta = String(a.ruta || '').trim() === manualForm.ruta;
      const matchCond = cleanRut(a.conductor_rut) === cleanRut(selectedStaff.rut) ||
                        cleanStr(a.conductor_name).toUpperCase() === cleanStr(selectedStaff.name).toUpperCase();
      return matchRuta && matchCond;
    });

    if (matchedDisp) {
      toast.info(`Nota: La ruta ${manualForm.ruta} ya se encuentra disponibilizada para ${selectedStaff.name}.`);
    }

    const ok = await addManualPayment(newPayment);
    if (ok) {
      setManualForm({
        ...manualForm,
        monto: '',
        observacion: ''
      });
      setActiveTab('resumen');
    }
  };

  // ==========================================
  // TAB 3: REGISTROS, RESUMEN, FILTROS Y EXPORTACIÓN
  // ==========================================
  const [filterSearch, setFilterSearch] = useState('');
  const [filterServiceType, setFilterServiceType] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('');
  const [editingPayment, setEditingPayment] = useState(null);
  const [editMontoValue, setEditMontoValue] = useState('');

  // Periodos únicos detectados
  const availablePeriodos = useMemo(() => {
    const set = new Set();
    paymentsList.forEach(p => {
      if (p.periodo) set.add(p.periodo);
    });
    return Array.from(set).sort().reverse();
  }, [paymentsList]);

  // Filtrado reactivo de pagos
  const filteredPayments = useMemo(() => {
    return paymentsList.filter(item => {
      if (filterPeriodo && item.periodo !== filterPeriodo) return false;
      if (filterServiceType && item.tipoServicio !== filterServiceType) return false;

      if (filterSearch.trim()) {
        const term = filterSearch.toLowerCase();
        const fullText = [
          item.fechaDespacho,
          item.rutCond1,
          item.nomCond1,
          item.rutas,
          item.transportistas,
          item.tipoServicio,
          item.periodo
        ].filter(Boolean).join(' ').toLowerCase();

        if (!fullText.includes(term)) return false;
      }

      return true;
    });
  }, [paymentsList, filterPeriodo, filterServiceType, filterSearch]);

  // KPIs calculados
  const kpiData = useMemo(() => {
    const totalMonto = filteredPayments.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0);
    const totalViajes = filteredPayments.length;
    const promedio = totalViajes > 0 ? totalMonto / totalViajes : 0;
    const uniqueDrivers = new Set(filteredPayments.map(p => cleanRut(p.rutCond1) || p.nomCond1)).size;

    return {
      totalMonto,
      totalViajes,
      promedio,
      uniqueDrivers
    };
  }, [filteredPayments]);

  // Exportar a Excel
  const handleExportExcel = () => {
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
      'Owners': p.owners || '',
      'Linea Negocio': p.lineaNegocio || '',
      'regiones': p.regiones || '',
      'Tipo Pago': p.tipoPago || '',
      'Tipo Calculo': p.tipoCalculo || '',
      'Segunda Vuelta': p.segundaVuelta || '',
      'Centralizado': p.centralizado || '',
      'Tipo Equipo': p.tipoEquipo || '',
      'Codigo Equipo': p.codigoEquipo || '',
      'Total Puntos Viaje': p.totalPuntosViaje || 0,
      'Total M3Viaje': p.totalM3Viaje || 0,
      'Total Cajas Viaje': p.totalCajasViaje || 0,
      'Valor Punto Conductor': p.valorPuntoConductor || 0,
      'Valor Punto Auxiliar': p.valorPuntoAuxiliar || 0,
      'Valor Ruta': p.valorRuta || 0,
      'Valor Destino Cond1': p.valorDestinoCond1 || 0,
      'Pago Cond1': p.pagoCond1 || 0,
      'Tiempo Espera Cond1': p.tiempoEsperaCond1 || 0,
      'Total': p.total || 0,
      'Tipo de Servicio': p.tipoServicio || 'Ruta',
      'Origen': p.origen || 'Excel'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pago Dotacion');
    XLSX.writeFile(wb, `Pago_Dotacion_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Archivo Excel descargado exitosamente');
  };

  const handleSaveEditMonto = async () => {
    if (!editingPayment) return;
    const newMonto = parseFloat(String(editMontoValue).replace(/[^\d.-]/g, '')) || 0;
    await updatePayment(editingPayment.id, { total: newMonto, pagoCond1: newMonto });
    setEditingPayment(null);
    setEditMontoValue('');
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 max-w-7xl mx-auto space-y-6">
      {/* Título de Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <DollarSign size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Pago dotación</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Carga masiva por planilla Excel, match automático con Disponibilización y registro manual de pagos de viajes
              </p>
            </div>
          </div>
        </div>

        {/* Botón de Exportar */}
        {paymentsList.length > 0 && (
          <Button
            type="button"
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 rounded-xl shadow-xs cursor-pointer"
          >
            <Download size={14} />
            Exportar Excel ({filteredPayments.length})
          </Button>
        )}
      </div>

      {/* Selector de Pestañas / Sub-navegación */}
      <div className="flex space-x-2 border-b border-slate-200 overflow-x-auto pb-2 scrollbar-thin">
        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'resumen' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('resumen')}
        >
          📋 Registros y Resumen ({paymentsList.length})
          {activeTab === 'resumen' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'masiva' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('masiva')}
        >
          📤 Carga Masiva (Excel)
          {activeTab === 'masiva' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-black text-xs transition-colors whitespace-nowrap relative cursor-pointer ${
            activeTab === 'manual' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          ✍️ Cargar Viaje Manual
          {activeTab === 'manual' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
      </div>

      {/* ========================================== */}
      {/* PESTAÑA 1: REGISTROS Y RESUMEN */}
      {/* ========================================== */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Total Pagado</span>
              <p className="text-2xl font-black text-blue-900 mt-1">{formatCLP(kpiData.totalMonto)}</p>
              <span className="text-[10px] text-blue-500 font-medium">Monto acumulado en el filtro</span>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 rounded-2xl border border-emerald-100 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Total de Viajes</span>
              <p className="text-2xl font-black text-emerald-900 mt-1">{kpiData.totalViajes}</p>
              <span className="text-[10px] text-emerald-600 font-medium">Viajes registrados</span>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50/50 p-4 rounded-2xl border border-purple-100 shadow-2xs">
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">Promedio por Viaje</span>
              <p className="text-2xl font-black text-purple-900 mt-1">{formatCLP(kpiData.promedio)}</p>
              <span className="text-[10px] text-purple-500 font-medium">Valor promedio de pago</span>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-2xl border border-amber-100 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Dotación Única</span>
              <p className="text-2xl font-black text-amber-900 mt-1">{kpiData.uniqueDrivers}</p>
              <span className="text-[10px] text-amber-600 font-medium">Conductores / auxiliares con pago</span>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar por conductor, RUT, ruta, transportista..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="w-40">
              <select
                value={filterPeriodo}
                onChange={(e) => setFilterPeriodo(e.target.value)}
                className="w-full py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value="">Todos los periodos</option>
                {availablePeriodos.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <select
                value={filterServiceType}
                onChange={(e) => setFilterServiceType(e.target.value)}
                className="w-full py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value="">Todos los servicios</option>
                {SERVICE_TYPE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {(filterSearch || filterPeriodo || filterServiceType) && (
              <button
                type="button"
                onClick={() => {
                  setFilterSearch('');
                  setFilterPeriodo('');
                  setFilterServiceType('');
                }}
                className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Tabla de Registros */}
          {filteredPayments.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
              <div className="w-12 h-12 mx-auto bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                <FileText size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-700">No se encontraron registros de pago</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Carga un archivo Excel con la planilla de viajes o utiliza el apartado de carga manual para ingresar nuevos pagos.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Button onClick={() => setActiveTab('masiva')} className="text-xs h-8">
                  Cargar Excel
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('manual')} className="text-xs h-8">
                  Ingresar Manual
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100/90 text-slate-700 font-black border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Fecha</th>
                    <th className="px-3 py-3">Ruta</th>
                    <th className="px-3 py-3">Conductor</th>
                    <th className="px-3 py-3">RUT</th>
                    <th className="px-3 py-3">Tipo Servicio</th>
                    <th className="px-3 py-3">Transportista</th>
                    <th className="px-3 py-3 text-right">Puntos</th>
                    <th className="px-3 py-3 text-right">Monto / Total</th>
                    <th className="px-3 py-3 text-center">Origen</th>
                    <th className="px-3 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPayments.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-slate-800">{row.fechaDespacho || '-'}</td>
                      <td className="px-3 py-2.5 font-black text-blue-700">{row.rutas || '-'}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{row.nomCond1 || row.cond1 || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px]">{row.rutCond1 || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          row.tipoServicio === 'Ruta'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          {row.tipoServicio || 'Ruta'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{row.transportistas || '-'}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-600">{row.totalPuntosViaje || 1}</td>
                      <td className="px-3 py-2.5 text-right font-black text-emerald-700 text-sm">
                        {formatCLP(row.total)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          row.origen === 'Manual'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {row.origen || 'Excel'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
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
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`¿Estás seguro de eliminar el registro de pago para ${row.nomCond1} (Ruta ${row.rutas})?`)) {
                                deletePayment(row.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Eliminar registro"
                          >
                            <Trash2 size={14} />
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
      )}

      {/* ========================================== */}
      {/* PESTAÑA 2: CARGA MASIVA DE EXCEL */}
      {/* ========================================== */}
      {activeTab === 'masiva' && (
        <div className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <FileText size={16} className="text-blue-600" />
              Estructura Oficial requerida para el archivo Excel:
            </h3>
            <p className="text-xs text-slate-500">
              El archivo debe contener las siguientes 28 columnas:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {OFFICIAL_PAYMENT_COLUMNS.map(col => (
                <span key={col} className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono font-medium">
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Zona de Dropzone */}
          <div 
            {...getRootProps()} 
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex justify-center mb-3 text-blue-500">
              <UploadCloud size={44} />
            </div>
            <p className="text-sm font-bold text-slate-700">Arrastra aquí la planilla Excel de pago dotación</p>
            <p className="text-xs text-slate-400 mt-1">O haz clic para seleccionar archivo (.xlsx, .xls)</p>
          </div>

          {/* Vista previa antes de confirmar */}
          {parsedExcelRows.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    Vista Previa ({parsedExcelRows.length} filas leídas del Excel)
                  </h3>
                  <p className="text-xs text-slate-500">Verifica los datos antes de guardarlos definitivamente en la base de datos.</p>
                </div>
                <Button 
                  onClick={handleSaveParsedExcel} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4"
                >
                  Guardar {parsedExcelRows.length} registros
                </Button>
              </div>

              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Ruta</th>
                      <th className="px-3 py-2">Conductor</th>
                      <th className="px-3 py-2">RUT</th>
                      <th className="px-3 py-2">Transportista</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedExcelRows.slice(0, 50).map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">{r.fechaDespacho}</td>
                        <td className="px-3 py-2 font-bold text-blue-600">{r.rutas}</td>
                        <td className="px-3 py-2">{r.nomCond1}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.rutCond1}</td>
                        <td className="px-3 py-2">{r.transportistas}</td>
                        <td className="px-3 py-2 text-right font-black text-emerald-600">{formatCLP(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedExcelRows.length > 50 && (
                <p className="text-[11px] text-slate-400 text-center">Mostrando las primeras 50 filas de {parsedExcelRows.length}.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* PESTAÑA 3: CARGA MANUAL DE VIAJES */}
      {/* ========================================== */}
      {activeTab === 'manual' && (
        <form onSubmit={handleSubmitManual} className="max-w-2xl mx-auto space-y-5 bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-800">Registrar Viaje y Pago Manual</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              La dotación proviene del módulo de Asistencia y las rutas del catálogo oficial de Briefing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fecha */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de Despacho</label>
              <input
                type="text"
                value={manualForm.fechaDespacho}
                onChange={(e) => setManualForm({ ...manualForm, fechaDespacho: e.target.value })}
                placeholder="DD-MM-YYYY (ej: 02-11-2026)"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                required
              />
            </div>

            {/* Tipo de Servicio */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Servicio</label>
              <select
                value={manualForm.tipoServicio}
                onChange={(e) => setManualForm({ ...manualForm, tipoServicio: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              >
                {SERVICE_TYPE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dotación desde Asistencia */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Dotación (Personal activo de Asistencia)
            </label>
            <select
              value={manualForm.staffId}
              onChange={(e) => setManualForm({ ...manualForm, staffId: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              required
            >
              <option value="" disabled>-- Selecciona un colaborador de asistencia --</option>
              {staffOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Ruta desde Briefing */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ruta u Operación (Catálogo oficial de Briefing)
            </label>
            <select
              value={manualForm.ruta}
              onChange={(e) => setManualForm({ ...manualForm, ruta: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              required
            >
              <option value="" disabled>-- Selecciona ruta u operación del briefing --</option>
              {briefingRouteOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Monto a Pagar ($ CLP)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={manualForm.monto}
                onChange={(e) => setManualForm({ ...manualForm, monto: e.target.value })}
                placeholder="Ej: 45000"
                className="w-full pl-8 pr-3 py-2 text-sm font-black text-emerald-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Observación libre */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Observación o Detalle (Opcional)</label>
            <input
              type="text"
              value={manualForm.observacion}
              onChange={(e) => setManualForm({ ...manualForm, observacion: e.target.value })}
              placeholder="Detalle de ruta, justificación de servicio extra, etc."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 h-10 font-bold">
              {isLoading ? 'Registrando...' : 'Registrar Pago y Viaje'}
            </Button>
          </div>
        </form>
      )}

      {/* ========================================== */}
      {/* MODAL DE RESOLUCIÓN DE COINCIDENCIAS / CONFLICTOS */}
      {/* "¿Deseas mantener ambas o cambiar el monto?" */}
      {/* ========================================== */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle size={22} />
                <h3 className="text-base font-black text-slate-800">
                  Coincidencias encontradas con Disponibilización
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsConflictModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>
                Los siguientes viajes en el Excel ya coinciden con una ruta y conductor asignados para la misma fecha en Disponibilización.
              </p>
              <p className="font-bold text-slate-800">
                ¿Deseas mantener ambas asignaciones o cambiar/actualizar el monto con el valor del Excel?
              </p>
            </div>

            {/* Acciones globales */}
            <div className="flex items-center gap-2 pt-1 pb-1">
              <button
                type="button"
                onClick={() => {
                  const updated = {};
                  matchConflicts.forEach(c => { updated[c.rowId] = 'cambiar'; });
                  setConflictDecisions(updated);
                  toast.info('Se seleccionó "Cambiar el monto" para todas las coincidencias');
                }}
                className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
              >
                Cambiar todos los montos con valor del Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = {};
                  matchConflicts.forEach(c => { updated[c.rowId] = 'mantener'; });
                  setConflictDecisions(updated);
                  toast.info('Se seleccionó "Mantener ambas" para todas las coincidencias');
                }}
                className="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
              >
                Mantener ambas en todos
              </button>
            </div>

            {/* Tabla de coincidencias */}
            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Ruta</th>
                    <th className="px-3 py-2.5">Conductor</th>
                    <th className="px-3 py-2.5 text-right">Monto Excel</th>
                    <th className="px-3 py-2.5 text-right">Monto Registrado</th>
                    <th className="px-3 py-2.5 text-center">Decisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchConflicts.map((c) => {
                    const currentDecision = conflictDecisions[c.rowId] || 'cambiar';
                    return (
                      <tr key={c.rowId} className="hover:bg-amber-50/40">
                        <td className="px-3 py-2 font-bold text-slate-800">{c.fecha}</td>
                        <td className="px-3 py-2 font-black text-blue-700">{c.ruta}</td>
                        <td className="px-3 py-2 font-medium">{c.conductor}</td>
                        <td className="px-3 py-2 text-right font-black text-emerald-600">
                          {formatCLP(c.montoExcel)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-500">
                          {formatCLP(c.montoRegistrado)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                            <button
                              type="button"
                              onClick={() => setConflictDecisions({ ...conflictDecisions, [c.rowId]: 'cambiar' })}
                              className={`px-2 py-1 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                                currentDecision === 'cambiar'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Cambiar monto
                            </button>
                            <button
                              type="button"
                              onClick={() => setConflictDecisions({ ...conflictDecisions, [c.rowId]: 'mantener' })}
                              className={`px-2 py-1 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                                currentDecision === 'mantener'
                                  ? 'bg-slate-700 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Mantener ambas
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Acciones de pie */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setIsConflictModalOpen(false)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmConflicts}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4"
              >
                Confirmar y Procesar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL DE EDICIÓN RÁPIDA DE MONTO */}
      {/* ========================================== */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-800">Modificar Monto de Pago</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ruta {editingPayment.rutas} - {editingPayment.nomCond1} ({editingPayment.fechaDespacho})
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nuevo Monto ($ CLP)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={editMontoValue}
                onChange={(e) => setEditMontoValue(e.target.value)}
                className="w-full px-3 py-2 text-sm font-black text-emerald-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setEditingPayment(null)} className="text-xs h-8">
                Cancelar
              </Button>
              <Button onClick={handleSaveEditMonto} className="text-xs h-8 bg-blue-600 hover:bg-blue-700 font-bold">
                Guardar Monto
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
