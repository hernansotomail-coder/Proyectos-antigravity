import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Filter, Search, RefreshCw, User, Users, Truck, MapPin, 
  ChevronUp, ChevronDown, ChevronRight, CheckCircle2, Circle, Check,
  Calendar, Layers, Trash2, ArrowRight, UserCheck, Shield, Sparkles,
  Save, Eye, Download, Send, AlertTriangle, X, Scissors, History, CheckSquare, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { useStaffStore } from '../store/staffStore';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { usePlanningStore, ensureRowTransportista, sortDatesDescending, getMostRecentDate } from '../store/planningStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { getBriefingOperation } from './Briefing';

// Badge para columna Ambiente
export function AmbienteBadge({ ambiente }) {
  const amb = String(ambiente || 'S').trim().toUpperCase();
  if (amb === 'C') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs" title="Congelado (C)">
        C
      </span>
    );
  }
  if (amb === 'R') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" title="Refrigerado (R)">
        R
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs" title="Seco (S)">
      S
    </span>
  );
}

// Helper para verificar si un vehículo está bloqueado en Disponibilización (Requisito 4)
export const isTruckStatusBlocked = (truck) => {
  if (!truck) return false;
  const rawStatus = String(truck.status || '').trim();
  if (!rawStatus) return false;
  const stLower = rawStatus.toLowerCase();

  // Si está en "Activo" o "Disponible", está 100% habilitado para uso
  if (stLower === 'activo' || stLower === 'disponible') return false;

  // Estados de bloqueo explícitos para cualquier vehículo (propio o externo):
  // Taller, Mantención, De Baja, Por documentación, Inactivo, Bloqueado
  const isExplicitBlocked = 
    stLower.includes('taller') || 
    stLower.includes('baja') || 
    stLower.includes('doc') || 
    stLower.includes('inactiv') ||
    stLower.includes('bloque') ||
    stLower.includes('mantenc');

  if (isExplicitBlocked) return true;

  // Flota externa operativa: si es vehículo externo (por tipo_flota, empresa_externa,
  // prefijo 'externo' o nombre de empresa de transportes en el status) y no tiene un motivo
  // explícito de bloqueo arriba, está completamente habilitado
  const isExt = isVehicleExternal(truck) || 
                stLower.startsWith('externo') || 
                stLower.startsWith('transportes') ||
                (truck.empresa_externa && String(truck.empresa_externa).trim() !== '');

  if (isExt) return false;

  // Para flota propia: si no es 'activo' ni 'disponible' y tiene un estado no operacional, queda bloqueado
  return true;
};

// COMPONENTE MULTI-SELECT DROPDOWN COMPACTO (Requisito 2)
function CompactMultiSelect({ label, options, selectedValues, onChange, placeholder = 'Todos' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(opt => String(opt).toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  const toggleOption = (opt) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const buttonText = useMemo(() => {
    if (selectedValues.length === 0) return `${label}: ${placeholder}`;
    if (selectedValues.length === options.length && options.length > 0) return `${label}: Todos (${options.length})`;
    if (selectedValues.length === 1) return `${label}: ${selectedValues[0]}`;
    return `${label}: ${selectedValues.length} sel.`;
  }, [selectedValues, options, label, placeholder]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1 px-2.5 py-1 text-xs rounded-lg border transition-all text-left h-7.5 ${
          selectedValues.length > 0 
            ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold shadow-2xs' 
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
        }`}
      >
        <span className="truncate max-w-[110px]">{buttonText}</span>
        <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100 text-[11px]">
            <span className="font-bold text-slate-800">{label}</span>
            <div className="flex items-center gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() => onChange([...options])}
                className="text-blue-600 hover:text-blue-800 font-semibold"
              >
                Todos
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-slate-500 hover:text-red-600 font-semibold"
              >
                Limpiar
              </button>
            </div>
          </div>

          {options.length > 5 && (
            <div className="relative mb-1">
              <Search className="absolute left-2 top-1.5 text-slate-400" size={11} />
              <input
                type="text"
                placeholder={`Buscar...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-6 pr-1.5 py-0.5 text-[10px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.map((opt) => {
              const isChecked = selectedValues.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] cursor-pointer select-none transition-colors ${
                    isChecked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOption(opt)}
                    className="rounded text-blue-600 focus:ring-blue-500 h-3 w-3 shrink-0"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-2">Sin opciones</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Colores para tipos de servicio
const SERVICE_COLORS = {
  'Centralizado': 'bg-blue-100 text-blue-700 border-blue-200',
  'Carga Consolidada': 'bg-purple-100 text-purple-700 border-purple-200',
  'Carretera': 'bg-amber-100 text-amber-700 border-amber-200',
  'CDKL': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Servicios distribución': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Servicio especial': 'bg-rose-100 text-rose-700 border-rose-200',
  'Distribución': 'bg-sky-100 text-sky-700 border-sky-200'
};

// Configuración de colores y estilos de Asistencia para Dotación (Requisito 2)
const ATTENDANCE_STYLES = {
  'Vacaciones': {
    badge: 'Vacaciones',
    cardClass: 'bg-yellow-50/90 border-yellow-300 ring-1 ring-yellow-400/50',
    badgeClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold',
    isAlert: true
  },
  'Licencia': {
    badge: 'Licencia Médica',
    cardClass: 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/50',
    badgeClass: 'bg-orange-100 text-orange-800 border border-orange-300 font-bold',
    isAlert: true
  },
  'Licencia Médica': {
    badge: 'Licencia Médica',
    cardClass: 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/50',
    badgeClass: 'bg-orange-100 text-orange-800 border border-orange-300 font-bold',
    isAlert: true
  },
  'Ausente': {
    badge: 'Ausente',
    cardClass: 'bg-red-50/90 border-red-300 ring-1 ring-red-400/50',
    badgeClass: 'bg-red-100 text-red-800 border border-red-300 font-bold',
    isAlert: true
  },
  'Permiso con goce': {
    badge: 'Permiso C/G',
    cardClass: 'bg-purple-50/90 border-purple-300 ring-1 ring-purple-400/50',
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-300 font-bold',
    isAlert: true
  },
  'Permiso sin goce': {
    badge: 'Permiso S/G',
    cardClass: 'bg-pink-50/90 border-pink-300 ring-1 ring-pink-400/50',
    badgeClass: 'bg-pink-100 text-pink-800 border border-pink-300 font-bold',
    isAlert: true
  },
  'Baja': {
    badge: 'Baja',
    cardClass: 'bg-slate-100 border-slate-300 opacity-60',
    badgeClass: 'bg-slate-200 text-slate-700',
    isAlert: true
  }
};

// Cálculo de vencimientos y colores de documentos de Flota (Requisito 3)
const getDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const targetDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDocumentStatus = (days) => {
  if (days === null) return 'N/A';
  if (days < 0) return 'red'; // Vencido
  if (days <= 15) return 'orange'; // 0 a 15 dias
  if (days <= 30) return 'yellow'; // 16 a 30 dias
  return 'green'; // > 30 dias
};

const getTruckDocumentHealth = (truck) => {
  const rtDays = getDaysDiff(truck.rt_date);
  const gasesDays = getDaysDiff(truck.gases_date);
  const pcDays = getDaysDiff(truck.pc_date);
  const soapDays = getDaysDiff(truck.soap_date);
  const carnesDays = getDaysDiff(truck.carnes_date);

  const docs = [
    { name: 'REV. TÉC.', status: getDocumentStatus(rtDays), days: rtDays },
    { name: 'GASES', status: getDocumentStatus(gasesDays), days: gasesDays },
    { name: 'PC', status: getDocumentStatus(pcDays), days: pcDays },
    { name: 'SOAP', status: getDocumentStatus(soapDays), days: soapDays },
    { name: 'CARNES', status: getDocumentStatus(carnesDays), days: carnesDays }
  ];

  const alertDocs = docs.filter(d => d.status === 'red' || d.status === 'orange' || d.status === 'yellow');
  
  let worst = 'green';
  if (docs.some(d => d.status === 'red')) worst = 'red';
  else if (docs.some(d => d.status === 'orange')) worst = 'orange';
  else if (docs.some(d => d.status === 'yellow')) worst = 'yellow';

  return { worst, alertDocs, docs };
};

export default function AssignmentControl() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { staffList, fetchStaff } = useStaffStore();
  const { fleetList, fetchFleet } = useFleetStore();
  const { attendanceList, fetchAttendanceByDateRange } = useAttendanceStore();
  const { 
    transmittedAssignments, 
    selectedDisponibilizarDate, 
    setSelectedDisponibilizarDate,
    savedRuteoByDate,
    savedRuteoBaseline,
    savedHistoryList,
    updateAssignmentField,
    batchUpdateRows,
    assignStaffToRows,
    assignTruckToRows,
    assignRamplaToRows,
    clearSlotFromRows,
    deleteAssignmentRows,
    saveDisponibilizacion,
    recordChangeAudit,
    aperturarRutaEnDisponibilizacion,
    addExtraServices,
    initPlanningFromDb
  } = usePlanningStore();

  useEffect(() => {
    initPlanningFromDb?.();
  }, [initPlanningFromDb]);

  const availableDates = useMemo(() => {
    const dates = Object.keys(transmittedAssignments || {});
    return sortDatesDescending(dates);
  }, [transmittedAssignments]);

  const activeDate = (selectedDisponibilizarDate && availableDates.includes(selectedDisponibilizarDate))
    ? selectedDisponibilizarDate
    : (availableDates[0] || '28-10-2026');

  // Fecha en formato YYYY-MM-DD para consultar en tabla attendance
  const isoActiveDate = useMemo(() => {
    if (!activeDate) return '';
    const parts = activeDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return activeDate;
  }, [activeDate]);

  useEffect(() => {
    fetchStaff();
    fetchFleet();
  }, [fetchStaff, fetchFleet]);

  useEffect(() => {
    if (isoActiveDate && isoActiveDate.includes('-')) {
      const parts = isoActiveDate.split('-');
      if (parts.length === 3) {
        const startOfMonth = `${parts[0]}-${parts[1]}-01`;
        const endOfMonth = `${parts[0]}-${parts[1]}-31`;
        fetchAttendanceByDateRange(startOfMonth, endOfMonth);
      }
    }
  }, [isoActiveDate, fetchAttendanceByDateRange]);

  useEffect(() => {
    if (availableDates.length > 0) {
      if (!selectedDisponibilizarDate || !availableDates.includes(selectedDisponibilizarDate) || selectedDisponibilizarDate === '14-10-2026') {
        setSelectedDisponibilizarDate(availableDates[0]);
      }
    }
  }, [availableDates, selectedDisponibilizarDate, setSelectedDisponibilizarDate]);

  // Mapa de estado de asistencia para la fecha activa (staff_id -> service_type)
  const attendanceMap = useMemo(() => {
    const map = {};
    if (!attendanceList || attendanceList.length === 0 || !isoActiveDate) return map;
    attendanceList.forEach(rec => {
      if (rec.date === isoActiveDate) {
        map[rec.staff_id] = rec.service_type;
      }
    });
    return map;
  }, [attendanceList, isoActiveDate]);

  // Tabs y estados
  const [activeTabStaff, setActiveTabStaff] = useState('conductores'); // 'conductores' | 'auxiliares'
  const [activeTabTrucks, setActiveTabTrucks] = useState('camiones'); // 'camiones' | 'tractos' | 'semirremolques'
  
  // Filtro de estado de asistencia para dotación (Requisito 2)
  const [staffAttendanceFilter, setStaffAttendanceFilter] = useState('todos'); // 'todos' | 'disponibles' | 'novedades'
  const [staffTipoFilter, setStaffTipoFilter] = useState('todos'); // 'todos' | 'Propia' | 'Externo'

  // Filtro de estado documental para camiones (Requisito 3)
  const [truckDocFilter, setTruckDocFilter] = useState('todos'); // 'todos' | 'al_dia' | 'alertas'
  const [truckTipoFilter, setTruckTipoFilter] = useState('todos'); // 'todos' | 'propia' | 'externa'

  const [sortVueltasAsc, setSortVueltasAsc] = useState(false);
  const [sortTrucksAsc, setSortTrucksAsc] = useState(false);
  
  const [selectedStaffMember, setSelectedStaffMember] = useState(null);
  const [selectedTruckObject, setSelectedTruckObject] = useState(null);
  
  const [staffSearch, setStaffSearch] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  
  // Multi-selection de filas
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [quickVuelta, setQuickVuelta] = useState('1');

  // Filtros de búsqueda en la matriz (Requisitos 2 y 3)
  const [selectedRutas, setSelectedRutas] = useState([]);
  const [selectedTransportistas, setSelectedTransportistas] = useState([]);
  const [matrixFilterCliente, setMatrixFilterCliente] = useState('');
  const [matrixFilterEstado, setMatrixFilterEstado] = useState('Todos');

  // Ordenamiento de columnas en Disponibilización General (Requisito 4)
  const [matrixSortCol, setMatrixSortCol] = useState(null);
  const [matrixSortDir, setMatrixSortDir] = useState('asc'); // 'asc' | 'desc'

  const handleSortMatrix = (colKey) => {
    if (matrixSortCol === colKey) {
      setMatrixSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setMatrixSortCol(colKey);
      setMatrixSortDir('asc');
    }
  };

  // Opciones únicas para Multi-selects (Requisito 2)
  const availableRutas = useMemo(() => {
    const setR = new Set();
    (transmittedAssignments[activeDate] || []).forEach(r => {
      if (r.ruta) setR.add(String(r.ruta).trim());
    });
    return Array.from(setR).sort((a, b) => {
      const nA = parseInt(a, 10);
      const nB = parseInt(b, 10);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      return a.localeCompare(b);
    });
  }, [transmittedAssignments, activeDate]);

  const availableTransportistas = useMemo(() => {
    const setT = new Set();
    (transmittedAssignments[activeDate] || []).forEach(r => {
      const trans = ensureRowTransportista(r);
      if (trans && trans !== 'Sin Transportista') setT.add(trans);
    });
    return Array.from(setT).sort();
  }, [transmittedAssignments, activeDate]);

  // Pop-up modal de confirmación al guardar
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [incompleteRoutesList, setIncompleteRoutesList] = useState([]);

  // Pop-up modal de Auditoría de Cambios al Guardar Disponibilización (Requisito 2)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditData, setAuditData] = useState({
    changes: [],
    incompleteList: [],
    usuario: '',
    horaAntigua: '',
    horaModificada: ''
  });

  // Modal "Aperturar Ruta" en Disponibilización (Requisito 1)
  const [isAperturarModalOpen, setIsAperturarModalOpen] = useState(false);
  const [aperturarSourceId, setAperturarSourceId] = useState('');
  const [aperturarNewRouteNumber, setAperturarNewRouteNumber] = useState('');
  const [aperturarNewRouteName, setAperturarNewRouteName] = useState('');
  const [aperturarNewTransportista, setAperturarNewTransportista] = useState('');
  const [aperturarSelectedParadaIds, setAperturarSelectedParadaIds] = useState([]);
  const [aperturarFilterAmbiente, setAperturarFilterAmbiente] = useState('TODOS');

  // Filas expandidas en el Resumen inferior (por clave Conductor:::Vuelta)
  const [expandedSummaryKeys, setExpandedSummaryKeys] = useState({});

  // Pop-up modal de Vehículo Bloqueado en Disponibilización (Requisito 4)
  const [blockedTruckModal, setBlockedTruckModal] = useState({
    isOpen: false,
    truck: null,
    reason: ''
  });

  const handleShowBlockedModal = (truck) => {
    if (!truck) return;
    const reason = truck.status || 'No Activo';
    setBlockedTruckModal({
      isOpen: true,
      truck,
      reason
    });
    toast.error(`Vehículo bloqueado: ${truck.internal_number || truck.plate} se encuentra en estado "${reason}" y no puede ser utilizado.`);
  };

  // Pop-up modal de advertencia al asignar dotación con novedad (Requisito 2)
  const [warningStaffModal, setWarningStaffModal] = useState({
    isOpen: false,
    staff: null,
    targetIds: [],
    targetRole: 'conductor',
    condition: ''
  });

  // Modal de Servicios Extras (Requisito 5)
  const [isExtraServicesModalOpen, setIsExtraServicesModalOpen] = useState(false);
  const [extraServiceRows, setExtraServiceRows] = useState([
    {
      id: 1,
      fecha: activeDate || '28-10-2026',
      conductor_name: '',
      conductor_rut: '',
      aux1_name: '',
      aux1_rut: '',
      camion: '',
      tipo_equipo: 'Camión',
      rampla: '',
      servicio: 'Retiro camión',
      nota: ''
    }
  ]);

  const handleOpenExtraServicesModal = () => {
    setExtraServiceRows([
      {
        id: Date.now(),
        fecha: activeDate || '28-10-2026',
        conductor_name: '',
        conductor_rut: '',
        aux1_name: '',
        aux1_rut: '',
        camion: '',
        tipo_equipo: 'Camión',
        rampla: '',
        servicio: 'Retiro camión',
        nota: ''
      }
    ]);
    setIsExtraServicesModalOpen(true);
  };

  const handleAddExtraServiceRow = () => {
    setExtraServiceRows(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        fecha: activeDate || '28-10-2026',
        conductor_name: '',
        conductor_rut: '',
        aux1_name: '',
        aux1_rut: '',
        camion: '',
        tipo_equipo: 'Camión',
        rampla: '',
        servicio: 'Retiro camión',
        nota: ''
      }
    ]);
  };

  const handleRemoveExtraServiceRow = (rowId) => {
    if (extraServiceRows.length === 1) {
      toast.warning('Debe haber al menos una fila de servicio.');
      return;
    }
    setExtraServiceRows(prev => prev.filter(r => r.id !== rowId));
  };

  const handleUpdateExtraServiceRow = (rowId, field, value) => {
    setExtraServiceRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: value };
      if (field === 'conductor_name') {
        const found = staffList.find(s => s.name === value);
        if (found) updated.conductor_rut = found.rut || '';
      }
      if (field === 'aux1_name') {
        const found = staffList.find(s => s.name === value);
        if (found) updated.aux1_rut = found.rut || '';
      }
      if (field === 'camion') {
        const found = fleetList.find(t => {
          const id = t.internal_number ? `${t.internal_number} (${t.plate})` : t.plate;
          return id === value || t.plate === value || t.internal_number === value;
        });
        if (found) updated.tipo_equipo = found.type || 'Camión';
      }
      return updated;
    }));
  };

  const handleConfirmSaveExtraServices = () => {
    const invalid = extraServiceRows.filter(r => !r.conductor_name || !r.camion || !r.servicio);
    if (invalid.length > 0) {
      toast.error('Completa los campos obligatorios: Conductor, Camión y Servicio en todas las filas.');
      return;
    }

    const payload = extraServiceRows.map((r, idx) => ({
      fecha: r.fecha || activeDate,
      conductor_name: r.conductor_name,
      conductor_rut: r.conductor_rut || '',
      aux1_name: r.aux1_name || '',
      aux1_rut: r.aux1_rut || '',
      camion: r.camion,
      tipo_equipo: r.tipo_equipo || 'Camión',
      rampla: r.rampla || '',
      servicio: r.servicio === 'Otro' ? (r.nota || 'Servicio especial') : (r.nota && r.servicio !== 'SPID' ? `${r.servicio} - ${r.nota}` : r.servicio),
      cliente: r.servicio === 'SPID' ? 'SPID' : (r.servicio || 'Servicio Extra'),
      operacion: r.servicio === 'SPID' ? 'SPID' : (r.servicio || 'Servicios Extras'),
      ruta: r.servicio === 'SPID' ? `SPID-EXTRA-${idx + 1}` : `EXTRA-${idx + 1}`,
      nota: r.nota || ''
    }));

    const ok = addExtraServices(payload);
    if (ok) {
      setIsExtraServicesModalOpen(false);
      toast.success('Servicios extras guardados y transmitidos al Histórico de Disponibilización exitosamente.', {
        action: {
          label: 'Ver Histórico',
          onClick: () => navigate('/history')
        }
      });
    }
  };

  // Entidad enfocada (al pinchar en Dotación o Camión para ver solo sus rutas asignadas - Requisito 4)
  const [focusedEntity, setFocusedEntity] = useState(null);

  // Modal de confirmación para eliminar rutas (individual y lote)
  const [routeToDelete, setRouteToDelete] = useState(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const handleConfirmDeleteSingle = () => {
    if (!routeToDelete) return;
    deleteAssignmentRows(activeDate, [routeToDelete.id]);
    setSelectedRowIds(prev => prev.filter(id => id !== routeToDelete.id));
    setRouteToDelete(null);
  };

  const handleConfirmDeleteBatch = () => {
    if (!selectedRowIds || selectedRowIds.length === 0) return;
    deleteAssignmentRows(activeDate, selectedRowIds);
    setSelectedRowIds([]);
    setIsBatchDeleteModalOpen(false);
  };

  // Asignaciones actuales de la fecha activa
  const assignmentsForDate = useMemo(() => {
    return transmittedAssignments[activeDate] || [];
  }, [transmittedAssignments, activeDate]);

  // CÁLCULO DE VIAJES (Basado en la cantidad de "N° de vuelta" distintas asignadas)
  const viajesPorPersona = useMemo(() => {
    const map = {};
    assignmentsForDate.forEach(a => {
      const v = String(a.n_vuelta || '').trim();
      const personList = [a.conductor_name, a.aux1_name, a.aux2_name].filter(Boolean);
      personList.forEach(name => {
        if (!map[name]) map[name] = new Set();
        if (v) map[name].add(v);
        else map[name].add(`v-fallback-${a.id}`);
      });
    });
    const result = {};
    Object.keys(map).forEach(name => {
      result[name] = map[name].size;
    });
    return result;
  }, [assignmentsForDate]);

  const viajesPorCamion = useMemo(() => {
    const map = {};
    assignmentsForDate.forEach(a => {
      const v = String(a.n_vuelta || '').trim();
      if (a.camion) {
        if (!map[a.camion]) map[a.camion] = new Set();
        if (v) map[a.camion].add(v);
        else map[a.camion].add(`v-fallback-${a.id}`);
      }
      if (a.rampla) {
        if (!map[a.rampla]) map[a.rampla] = new Set();
        if (v) map[a.rampla].add(v);
        else map[a.rampla].add(`v-fallback-${a.id}`);
      }
    });
    const result = {};
    Object.keys(map).forEach(id => {
      result[id] = map[id].size;
    });
    return result;
  }, [assignmentsForDate]);

  // Dotación activa filtrada y clasificada con Asistencia (Requisito 2)
  const { conductores, auxiliares } = useMemo(() => {
    const activeStaff = (staffList || []).filter(s => {
      if (!s) return false;
      const isActive = s.status === 'Activo' || !s.status;
      const sName = (s.name || '').toLowerCase();
      const sRut = (s.rut || '').toLowerCase();
      const search = (staffSearch || '').toLowerCase();
      if (!isActive || (!sName.includes(search) && !sRut.includes(search))) return false;

      // Filtro por tipo de dotación (Propia / Externo)
      if (staffTipoFilter !== 'todos') {
        const staffTipo = (s.tipo_dotacion || 'Propia').toLowerCase();
        if (staffTipo !== staffTipoFilter.toLowerCase()) return false;
      }

      // Filtro de condición de asistencia para descartar no disponibles
      const att = attendanceMap[s.id];
      const isUnavailable = att && ATTENDANCE_STYLES[att]?.isAlert;
      if (staffAttendanceFilter === 'disponibles' && isUnavailable) return false;
      if (staffAttendanceFilter === 'novedades' && !isUnavailable) return false;

      return true;
    });
    
    const conds = activeStaff.filter(s => (s.role || '').toLowerCase().includes('conductor')).map(c => ({
      ...c, 
      viajes: (c.name ? viajesPorPersona[c.name] : 0) || 0,
      attStatus: attendanceMap[c.id] || null
    }));
    const auxs = activeStaff.filter(s => {
      const r = (s.role || '').toLowerCase();
      return r.includes('auxiliar') || r.includes('movilizador') || !r.includes('conductor');
    }).map(a => ({
      ...a, 
      viajes: (a.name ? viajesPorPersona[a.name] : 0) || 0,
      attStatus: attendanceMap[a.id] || null
    }));

    const sortByViajes = (a, b) => sortVueltasAsc ? a.viajes - b.viajes : b.viajes - a.viajes;
    return {
      conductores: conds.sort(sortByViajes),
      auxiliares: auxs.sort(sortByViajes)
    };
  }, [staffList, sortVueltasAsc, staffSearch, viajesPorPersona, attendanceMap, staffAttendanceFilter, staffTipoFilter]);

  // Camiones clasificados en 3 categorías con evaluación de salud documental y bloqueo por estado (Requisito 4)
  const { camionesList, tractosList, semirremolquesList } = useMemo(() => {
    const activeTrucks = (fleetList || [])
      .filter(t => {
        if (!t) return false;

        // Requisito 3: Para los camiones disponibles y métricas, solo considerar Región 'RM' en Gestión Flota
        const rReg = String(t.region || '').trim().toUpperCase();
        const isRM = rReg === 'RM' || rReg.includes('METROPOLITAN');
        if (!isRM) return false;

        // Filtro por tipo de flota (Propia / Externa / Todos)
        if (truckTipoFilter !== 'todos') {
          const isExt = isVehicleExternal(t);
          if (truckTipoFilter === 'externa' && !isExt) return false;
          if (truckTipoFilter === 'propia' && isExt) return false;
        }

        const search = (truckSearch || '').toLowerCase();
        const matches = (t.internal_number || '').toLowerCase().includes(search) || 
               (t.plate || '').toLowerCase().includes(search) ||
               (t.brand || '').toLowerCase().includes(search) ||
               (t.empresa_externa || '').toLowerCase().includes(search);
        if (!matches) return false;

        const health = getTruckDocumentHealth(t);
        if (truckDocFilter === 'al_dia' && health.worst !== 'green') return false;
        if (truckDocFilter === 'alertas' && health.worst === 'green') return false;
        return true;
      })
      .map(t => {
        const identifier = t.internal_number ? `${t.internal_number} (${t.plate})` : t.plate;
        const vCount = viajesPorCamion[identifier] || viajesPorCamion[t.plate] || viajesPorCamion[t.internal_number] || 0;
        const health = getTruckDocumentHealth(t);
        const isBlocked = isTruckStatusBlocked(t);
        return {
          ...t,
          identifier,
          viajes: vCount,
          health,
          isBlocked,
          blockReason: isBlocked ? (t.status || 'Bloqueado') : null
        };
      });

    const camiones = [];
    const tractos = [];
    const semis = [];

    activeTrucks.forEach(t => {
      const typeLower = (t.type || '').toLowerCase();
      const intUpper = (t.internal_number || '').trim().toUpperCase();

      // 1. Semirremolques / Ramplas: Prefijo S o R en el interno (ej: S287, R101) o tipo que incluya rampla/semirremolque
      const isSemirremolque = 
        intUpper.startsWith('S') || 
        intUpper.startsWith('R') || 
        typeLower.includes('semirremolque') || 
        typeLower.includes('semiremolque') || 
        typeLower.includes('rampla');

      if (isSemirremolque) {
        semis.push(t);
        return;
      }

      // 2. Tractos: Prefijo T en el interno (ej: T589, T1365) o tipo que incluya tracto.
      // Excluir estrictamente si tiene prefijo de camión/externo (C, VL, TL) o tipo explícito de camión/camioneta.
      const hasTruckPrefix = intUpper.startsWith('C') || intUpper.startsWith('VL') || intUpper.startsWith('TL');
      const isExplicitTruck = typeLower.includes('camion') || typeLower.includes('camión') || typeLower.includes('camioneta');

      const isTracto = (intUpper.startsWith('T') || typeLower.includes('tracto')) && !hasTruckPrefix && !isExplicitTruck;

      if (isTracto) {
        tractos.push(t);
        return;
      }

      // 3. Camiones y Camionetas: todo el resto (C..., VL..., TL..., camión, camioneta)
      camiones.push(t);
    });

    const sortByViajes = (a, b) => sortTrucksAsc ? a.viajes - b.viajes : b.viajes - a.viajes;
    return {
      camionesList: camiones.sort(sortByViajes),
      tractosList: tractos.sort(sortByViajes),
      semirremolquesList: semis.sort(sortByViajes)
    };
  }, [fleetList, sortTrucksAsc, truckSearch, viajesPorCamion, truckDocFilter, truckTipoFilter]);

  // Filas filtradas de la matriz (Soporta filtro por focusedEntity - Requisito 4)
  const filteredAssignments = useMemo(() => {
    return assignmentsForDate.filter(a => {
      // Filtro por entidad enfocada (si se pinchó en Dotación o Camión para ver solo sus rutas asignadas)
      if (focusedEntity) {
        if (focusedEntity.type === 'staff') {
          const sName = focusedEntity.name;
          const match = a.conductor_name === sName || a.aux1_name === sName || a.aux2_name === sName;
          if (!match) return false;
        } else if (focusedEntity.type === 'truck') {
          const tId = focusedEntity.identifier;
          const plate = focusedEntity.plate;
          const matchCam = (a.camion && (a.camion === tId || a.camion.includes(tId) || (plate && a.camion.includes(plate)))) ||
                           (a.rampla && (a.rampla === tId || a.rampla.includes(tId) || (plate && a.rampla.includes(plate))));
          if (!matchCam) return false;
        }
      }

      // Multi-filtro Ruta (Requisito 2)
      if (selectedRutas.length > 0 && !selectedRutas.includes(String(a.ruta).trim())) {
        return false;
      }

      // Multi-filtro Transportista (Requisito 2)
      if (selectedTransportistas.length > 0) {
        const trans = ensureRowTransportista(a);
        if (!selectedTransportistas.includes(trans)) {
          return false;
        }
      }

      if (matrixFilterCliente) {
        const opName = getBriefingOperation(a);
        const search = matrixFilterCliente.toLowerCase();
        if (!String(a.cliente || '').toLowerCase().includes(search) && !opName.toLowerCase().includes(search)) {
          return false;
        }
      }
      if (matrixFilterEstado === 'Conductor asignado' && !a.conductor_name) return false;
      if (matrixFilterEstado === 'Sin conductor' && a.conductor_name) return false;
      if (matrixFilterEstado === 'Camion asignado' && !a.camion) return false;
      if (matrixFilterEstado === 'Sin camion' && a.camion) return false;
      return true;
    });
  }, [assignmentsForDate, selectedRutas, selectedTransportistas, matrixFilterCliente, matrixFilterEstado, focusedEntity]);

  // Ordenamiento de columnas en Disponibilización General (Requisito 4)
  const sortedFilteredAssignments = useMemo(() => {
    if (!matrixSortCol) return filteredAssignments;

    return [...filteredAssignments].sort((a, b) => {
      let valA = a[matrixSortCol];
      let valB = b[matrixSortCol];

      let cmp = 0;
      if (matrixSortCol === 'locales' || matrixSortCol === 'n_vuelta') {
        const numA = parseInt(valA, 10) || 0;
        const numB = parseInt(valB, 10) || 0;
        cmp = numA - numB;
      } else if (matrixSortCol === 'm3' || matrixSortCol === 'peso') {
        const numA = parseFloat(valA) || 0;
        const numB = parseFloat(valB) || 0;
        cmp = numA - numB;
      } else if (matrixSortCol === 'ruta') {
        cmp = String(valA || '').localeCompare(String(valB || ''), undefined, { numeric: true, sensitivity: 'base' });
      } else if (matrixSortCol === 'cliente') {
        const cliA = getBriefingOperation(a) || a.cliente || '';
        const cliB = getBriefingOperation(b) || b.cliente || '';
        cmp = cliA.localeCompare(cliB, undefined, { sensitivity: 'base' });
      } else {
        cmp = String(valA || '').localeCompare(String(valB || ''), undefined, { sensitivity: 'base' });
      }

      return matrixSortDir === 'desc' ? -cmp : cmp;
    });
  }, [filteredAssignments, matrixSortCol, matrixSortDir]);

  // RESUMEN AGRUPADO POR CONDUCTOR + N° DE VUELTA
  // "lo que no tienen 'Conductor' no debería aparecer en esta tabla resumen hasta que tenga"
  const groupedSummary = useMemo(() => {
    const map = new Map();

    assignmentsForDate.forEach(row => {
      if (!row.conductor_name || row.conductor_name.trim() === '') return;

      // Filtro por entidad enfocada (Requisito 4)
      if (focusedEntity) {
        if (focusedEntity.type === 'staff') {
          const sName = focusedEntity.name;
          const match = row.conductor_name === sName || row.aux1_name === sName || row.aux2_name === sName;
          if (!match) return;
        } else if (focusedEntity.type === 'truck') {
          const tId = focusedEntity.identifier;
          const plate = focusedEntity.plate;
          const matchCam = (row.camion && (row.camion === tId || row.camion.includes(tId) || (plate && row.camion.includes(plate)))) ||
                           (row.rampla && (row.rampla === tId || row.rampla.includes(tId) || (plate && row.rampla.includes(plate))));
          if (!matchCam) return;
        }
      }

      // Multi-filtro Ruta (Requisito 2)
      if (selectedRutas.length > 0 && !selectedRutas.includes(String(row.ruta).trim())) return;

      // Multi-filtro Transportista (Requisito 2)
      if (selectedTransportistas.length > 0) {
        const trans = ensureRowTransportista(row);
        if (!selectedTransportistas.includes(trans)) return;
      }

      // Filtro Cliente (con compatibilidad de Operación Briefing)
      if (matrixFilterCliente) {
        const opName = getBriefingOperation(row);
        const search = matrixFilterCliente.toLowerCase();
        if (!String(row.cliente || '').toLowerCase().includes(search) && !opName.toLowerCase().includes(search)) {
          return;
        }
      }

      const vueltaKey = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';
      const groupKey = `${row.conductor_name}:::${vueltaKey}`;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          groupKey,
          conductor_name: row.conductor_name,
          conductor_rut: row.conductor_rut || '',
          n_vuelta: row.n_vuelta || '',
          vueltaLabel: vueltaKey,
          camion: row.camion || '',
          auxiliares: [row.aux1_name, row.aux2_name].filter(Boolean),
          totalM3: 0,
          totalPeso: 0,
          totalLocales: 0,
          totalCajas: 0,
          rutas: []
        });
      }

      const g = map.get(groupKey);
      g.totalM3 += parseFloat(row.m3) || 0;
      g.totalPeso += parseFloat(row.peso) || 0;
      g.totalLocales += parseInt(row.locales, 10) || 0;
      g.totalCajas += parseInt(row.cantCJ, 10) || 0;
      if (row.camion && !g.camion) g.camion = row.camion;
      if (row.aux1_name && !g.auxiliares.includes(row.aux1_name)) g.auxiliares.push(row.aux1_name);
      if (row.aux2_name && !g.auxiliares.includes(row.aux2_name)) g.auxiliares.push(row.aux2_name);

      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [assignmentsForDate, focusedEntity, selectedRutas, selectedTransportistas, matrixFilterCliente]);

  const toggleExpandSummary = (groupKey) => {
    setExpandedSummaryKeys(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Toggle de enfoque para ver solo rutas de una Dotación o Camión (Requisito 4)
  const handleToggleFocusStaff = (staff) => {
    const sName = typeof staff === 'string' ? staff : staff?.name;
    if (!sName) return;
    if (focusedEntity?.type === 'staff' && focusedEntity?.name === sName) {
      setFocusedEntity(null);
      toast.info('Filtro removido. Mostrando todas las rutas.');
    } else {
      setFocusedEntity({
        type: 'staff',
        name: sName
      });
      // Expandir automáticamente el resumen
      setExpandedSummaryKeys(prev => {
        const next = { ...prev };
        assignmentsForDate.forEach(r => {
          if (r.conductor_name === sName || r.aux1_name === sName || r.aux2_name === sName) {
            const vKey = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
            next[`${r.conductor_name}:::${vKey}`] = true;
          }
        });
        return next;
      });
      toast.success(`Filtrando solo rutas de: ${sName}`);
    }
  };

  const handleToggleFocusTruck = (truck) => {
    const tId = typeof truck === 'string' 
      ? truck 
      : (truck?.identifier || (truck?.internal_number ? `${truck.internal_number} (${truck.plate})` : truck?.plate));
    const plate = typeof truck === 'string' ? '' : (truck?.plate || '');
    if (!tId) return;

    if (focusedEntity?.type === 'truck' && focusedEntity?.identifier === tId) {
      setFocusedEntity(null);
      toast.info('Filtro removido. Mostrando todas las rutas.');
    } else {
      setFocusedEntity({
        type: 'truck',
        identifier: tId,
        plate
      });
      // Expandir automáticamente el resumen
      setExpandedSummaryKeys(prev => {
        const next = { ...prev };
        assignmentsForDate.forEach(r => {
          if ((r.camion && (r.camion === tId || r.camion.includes(tId))) || (r.rampla && (r.rampla === tId || r.rampla.includes(tId)))) {
            const vKey = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
            next[`${r.conductor_name}:::${vKey}`] = true;
          }
        });
        return next;
      });
      toast.success(`Filtrando solo rutas del camión: ${tId}`);
    }
  };

  // Seleccionar todas las filas
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRowIds(filteredAssignments.map(a => a.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]
    );
  };

  // Validación de advertencia de dotación (Vacaciones, Licencia Médica, Ausente, Permiso con goce, Permiso sin goce o Baja - Requisito 2)
  const checkStaffWarningCondition = (staff) => {
    if (!staff) return null;
    const sStatus = String(staff.status || '').trim().toLowerCase();
    if (sStatus === 'baja' || sStatus === 'inactivo' || sStatus === 'desvinculado' || sStatus === 'finiquitado') {
      return 'Baja';
    }
    const att = attendanceMap[staff.id] || staff.attStatus;
    if (att) {
      const attLower = String(att).trim().toLowerCase();
      // Si el estado es Trabajado o Disponible, no es una novedad ni alerta
      if (attLower.includes('trabaj') || attLower.includes('disponib')) {
        return null;
      }
      if (attLower.includes('vacaci')) return 'Vacaciones';
      if (attLower.includes('licenc')) return 'Licencia Médica';
      if (attLower.includes('ausent')) return 'Ausente';
      if (attLower.includes('con goce')) return 'Permiso con goce';
      if (attLower.includes('sin goce')) return 'Permiso sin goce';
      if (attLower === 'baja' || attLower === 'de baja' || attLower.startsWith('baja ')) return 'Baja';
      if (ATTENDANCE_STYLES[att]?.isAlert) return ATTENDANCE_STYLES[att].badge || att;
    }
    return null;
  };

  // Solicitar asignación de dotación con verificación de novedad (Requisito 2)
  const handleRequestAssignStaff = (staff, targetRole, explicitTargetIds = null) => {
    if (!staff) return;
    const targetIds = explicitTargetIds || (selectedRowIds.length > 0 ? selectedRowIds : []);
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar.');
      return;
    }

    const condition = checkStaffWarningCondition(staff);
    if (condition) {
      setWarningStaffModal({
        isOpen: true,
        staff,
        targetIds,
        targetRole,
        condition
      });
    } else {
      assignStaffToRows(activeDate, targetIds, staff, targetRole);
    }
  };

  const confirmAssignStaffWithWarning = () => {
    if (warningStaffModal.staff && warningStaffModal.targetIds.length > 0) {
      assignStaffToRows(
        activeDate,
        warningStaffModal.targetIds,
        warningStaffModal.staff,
        warningStaffModal.targetRole
      );
    }
    setWarningStaffModal({ isOpen: false, staff: null, targetIds: [], targetRole: 'conductor', condition: '' });
  };

  // Helper para asignar con autocompletado de RUT
  const handleAssignStaff = (staff, targetRole) => {
    handleRequestAssignStaff(staff, targetRole);
  };

  // Helper para asignar Camión o Rampla
  const handleAssignTruck = (truck) => {
    if (!truck) return;
    if (isTruckStatusBlocked(truck)) {
      handleShowBlockedModal(truck);
      return;
    }
    const targetIds = selectedRowIds.length > 0 ? selectedRowIds : [];
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar el vehículo.');
      return;
    }
    assignTruckToRows(activeDate, targetIds, truck);
  };

  const handleAssignRampla = (truck) => {
    if (!truck) return;
    if (isTruckStatusBlocked(truck)) {
      handleShowBlockedModal(truck);
      return;
    }
    const targetIds = selectedRowIds.length > 0 ? selectedRowIds : [];
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar la rampla.');
      return;
    }
    assignRamplaToRows(activeDate, targetIds, truck);
  };

  // Asignar vuelta masiva a seleccionados
  const handleAssignBatchVuelta = (vueltaNum) => {
    if (selectedRowIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas para asignar la vuelta.');
      return;
    }
    batchUpdateRows(activeDate, selectedRowIds, { n_vuelta: String(vueltaNum) });
    toast.success(`Vuelta ${vueltaNum} asignada a ${selectedRowIds.length} fila(s)`);
  };

  // APERTURAR RUTA MODAL HANDLERS EN DISPONIBILIZACIÓN (Requisito 1)
  const handleOpenAperturarModal = (preselectedRow = null) => {
    const source = preselectedRow || assignmentsForDate[0] || null;
    if (source) {
      setAperturarSourceId(source.id);
      setAperturarNewRouteNumber(`${source.ruta}-B`);
      setAperturarNewRouteName(`${source.cliente || `Ruta ${source.ruta}`} (Aperturada)`);
      setAperturarNewTransportista(source.transportista || '');
      setAperturarSelectedParadaIds([]);
      setAperturarFilterAmbiente('TODOS');
    } else {
      setAperturarSourceId('');
      setAperturarNewRouteNumber('');
      setAperturarNewRouteName('');
      setAperturarNewTransportista('');
      setAperturarSelectedParadaIds([]);
      setAperturarFilterAmbiente('TODOS');
    }
    setIsAperturarModalOpen(true);
  };

  const currentAperturarSource = useMemo(() => {
    return assignmentsForDate.find(r => r.id === aperturarSourceId) || assignmentsForDate[0] || null;
  }, [assignmentsForDate, aperturarSourceId]);

  const toggleSelectAperturarParada = (paradaId) => {
    setAperturarSelectedParadaIds(prev => 
      prev.includes(paradaId) ? prev.filter(id => id !== paradaId) : [...prev, paradaId]
    );
  };

  const handleSelectAllAperturarParadas = () => {
    if (!currentAperturarSource?.paradas) return;
    const allIds = currentAperturarSource.paradas.map((p, idx) => p.id || `${currentAperturarSource.ruta}-${idx}`);
    setAperturarSelectedParadaIds(allIds);
  };

  const handleClearAllAperturarParadas = () => {
    setAperturarSelectedParadaIds([]);
  };

  const handleSelectAperturarParadasByAmbiente = (amb) => {
    if (!currentAperturarSource?.paradas) return;
    const matchingIds = currentAperturarSource.paradas
      .filter(p => !amb || amb === 'TODOS' || p.ambiente === amb)
      .map((p, idx) => p.id || `${currentAperturarSource.ruta}-${idx}`);
    setAperturarSelectedParadaIds(prev => Array.from(new Set([...prev, ...matchingIds])));
  };

  const handleConfirmAperturar = () => {
    if (!currentAperturarSource) {
      toast.error('Selecciona una ruta de origen');
      return;
    }
    if (!aperturarNewRouteNumber.trim()) {
      toast.error('Ingresa una nueva numeración para la ruta (Ej: 1611-B)');
      return;
    }
    if (aperturarSelectedParadaIds.length === 0) {
      toast.error('Debes seleccionar al menos una fila/parada para mover a la nueva ruta');
      return;
    }

    const ok = aperturarRutaEnDisponibilizacion(
      activeDate,
      currentAperturarSource.id,
      aperturarNewRouteNumber.trim(),
      aperturarNewRouteName.trim(),
      aperturarNewTransportista.trim(),
      aperturarSelectedParadaIds
    );

    if (ok) {
      setIsAperturarModalOpen(false);
    }
  };

  // AUDITORÍA Y GUARDADO CON POP-UP ALERT (Requisito 2 y 3)
  const handlePreSave = () => {
    const currentRows = assignmentsForDate;
    if (currentRows.length === 0) {
      toast.warning(`No hay datos en la fecha ${activeDate} para guardar.`);
      return;
    }

    // Usar savedRuteoBaseline como punto de comparación fiel (el estado previo al inicio de las modificaciones)
    const prevSavedRows = savedRuteoBaseline?.[activeDate] || savedRuteoByDate?.[activeDate] || [];
    const prevSavedEntry = (savedHistoryList || []).find(h => h.fecha === activeDate);
    const horaAntigua = prevSavedEntry?.savedAt || 'Guardado inicial (09:00:00)';
    const horaModificada = new Date().toLocaleString('es-CL');
    const usuario = user?.name || user?.username || 'Hernán Soto';

    const incomplete = currentRows.filter(r => !r.conductor_name || !r.camion);

    // Comparar cada fila contra el baseline para detectar cambios reales
    const changes = [];
    currentRows.forEach(row => {
      const prev = prevSavedRows.find(p => p.id === row.id || String(p.ruta).trim() === String(row.ruta).trim());
      
      const condAnt = prev?.conductor_name ? prev.conductor_name.trim() : 'Sin Asignar';
      const condMod = row.conductor_name ? row.conductor_name.trim() : 'Sin Asignar';
      
      const auxAnt = [prev?.aux1_name, prev?.aux2_name].filter(Boolean).map(s => s.trim()).join(', ') || 'Sin Asignar';
      const auxMod = [row.aux1_name, row.aux2_name].filter(Boolean).map(s => s.trim()).join(', ') || 'Sin Asignar';
      
      const camAnt = prev?.camion ? prev.camion.trim() : 'Sin Asignar';
      const camMod = row.camion ? row.camion.trim() : 'Sin Asignar';
      
      const vAnt = prev?.n_vuelta ? `Vuelta ${prev.n_vuelta}` : 'Sin Vuelta';
      const vMod = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';

      const isDiff = !prev || condAnt !== condMod || auxAnt !== auxMod || camAnt !== camMod || vAnt !== vMod;

      changes.push({
        id: `ch-${activeDate}-${row.ruta}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        fechaPlanificacion: activeDate,
        fechaHoraModificacion: horaModificada,
        horaAntigua,
        horaModificada,
        usuario,
        ruta: row.ruta,
        destino: row.cliente || `Ruta ${row.ruta}`,
        conductorAntiguo: condAnt,
        conductorModificado: condMod,
        auxiliarAntiguo: auxAnt,
        auxiliarModificado: auxMod,
        camionAntiguo: camAnt,
        camionModificado: camMod,
        vueltaAntigua: vAnt,
        vueltaModificada: vMod,
        isDiff
      });
    });

    setAuditData({
      changes,
      incompleteList: incomplete,
      usuario,
      horaAntigua,
      horaModificada
    });

    setIsAuditModalOpen(true);
  };

  const confirmAuditAndSave = () => {
    // Filtrar solo las filas que efectivamente sufrieron modificaciones respecto a la base anterior
    const entriesToRecord = auditData.changes.filter(c => c.isDiff);
    
    if (entriesToRecord.length > 0) {
      recordChangeAudit(entriesToRecord);
    }
    
    saveDisponibilizacion(activeDate);
    setIsAuditModalOpen(false);

    toast.success('¡Disponibilización guardada y registrada en Histórico de cambios!', {
      action: {
        label: 'Ver Histórico',
        onClick: () => navigate('/change-history')
      }
    });
  };

  // Drag and drop handlers
  const handleDragStartStaff = (e, staff) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'staff', data: staff }));
  };

  const handleDragStartTruck = (e, truck, isRampla = false) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: isRampla ? 'rampla' : 'truck', data: truck }));
  };

  const handleDropOnRow = (e, rowId, slotPreference = 'auto') => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      
      const targetIds = selectedRowIds.includes(rowId) && selectedRowIds.length > 1
        ? selectedRowIds 
        : [rowId];

      if (parsed.type === 'staff') {
        const staff = parsed.data;
        let targetSlot = slotPreference;
        if (targetSlot === 'auto' || !targetSlot) {
          // Si se soltó sobre la fila en general, inferir por el rol o pestaña activa
          const staffRole = (staff.role || '').toLowerCase();
          if (staffRole.includes('auxiliar') || staffRole.includes('movilizador') || activeTabStaff === 'auxiliares') {
            const currentRow = assignmentsForDate.find(r => r.id === rowId);
            if (currentRow && currentRow.aux1_name && !currentRow.aux2_name) {
              targetSlot = 'auxiliar2';
            } else {
              targetSlot = 'auxiliar';
            }
          } else {
            targetSlot = 'conductor';
          }
        }
        handleRequestAssignStaff(staff, targetSlot, targetIds);
      } else if (parsed.type === 'truck' || parsed.type === 'rampla') {
        if (isTruckStatusBlocked(parsed.data)) {
          handleShowBlockedModal(parsed.data);
          return;
        }
        let slot = slotPreference;
        if (slot === 'auto' || !slot) {
          const truckType = (parsed.data?.type || '').toLowerCase();
          const truckInt = (parsed.data?.internal_number || '').trim().toUpperCase();
          if (parsed.type === 'rampla' || truckInt.startsWith('S') || truckInt.startsWith('R') || truckType.includes('semirremolque') || truckType.includes('rampla')) {
            slot = 'rampla';
          } else {
            slot = 'camion';
          }
        }
        if (slot === 'rampla') {
          assignRamplaToRows(activeDate, targetIds, parsed.data);
        } else {
          assignTruckToRows(activeDate, targetIds, parsed.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Totales
  const totalM3 = filteredAssignments.reduce((acc, curr) => acc + (parseFloat(curr.m3) || 0), 0).toFixed(2);
  const totalLocales = filteredAssignments.reduce((acc, curr) => acc + (parseInt(curr.locales, 10) || 0), 0);
  const totalPeso = filteredAssignments.reduce((acc, curr) => acc + (parseFloat(curr.peso) || 0), 0).toFixed(2);
  const totalVueltas = filteredAssignments.length;

  // Tarjetas de dotaciones por Cargo y camiones por Tipo de Vehículo ocupados vs disponibles (Requisito 3)
  const occupancyStats = useMemo(() => {
    const isRM = (t) => {
      const r = String(t?.region || '').trim().toUpperCase();
      return r === 'RM' || r.includes('METROPOLITAN');
    };

    const isStaffExt = (s) => (s?.tipo_dotacion || '').toLowerCase() === 'externo' || !!s?.empresa_externa || (s?.rut && String(s.rut).startsWith('EXT-'));

    // Normalización de roles (Requisito 1: Auxiliar Rampla dentro de Auxiliar, Movilizadores unificados, Conductor a Conductor B)
    const normalizeRole = (rawRole) => {
      if (!rawRole) return 'Sin Cargo';
      const r = String(rawRole).trim();
      const lower = r.toLowerCase();
      if (lower.includes('moviliz') || lower.includes('movilidad')) return 'Movilizador';
      if (lower.includes('auxiliar rampla')) return 'Auxiliar';
      if (lower === 'conductor' || lower.includes('conductor 1/1')) return 'Conductor B';
      return r;
    };

    const activeStaff = (staffList || []).filter(s => s && (s.status === 'Activo' || !s.status));
    const activeFleetRM = (fleetList || []).filter(f => f && f.status !== 'Baja' && f.status !== 'Dado de baja' && isRM(f));

    // Totales de Dotación Propia por Cargo
    const staffByRoleTotals = {};
    let totalExtStaff = 0;

    activeStaff.forEach(s => {
      if (isStaffExt(s)) {
        totalExtStaff++;
      } else {
        const rawRole = (s.role || s.cargo || 'Sin Cargo').trim();
        const role = normalizeRole(rawRole);
        staffByRoleTotals[role] = (staffByRoleTotals[role] || 0) + 1;
      }
    });

    // Totales de Camiones Propios RM por Tipo de Vehículo
    const fleetByTypeTotals = {};
    let totalExtFleet = 0;

    activeFleetRM.forEach(f => {
      if (isVehicleExternal(f)) {
        totalExtFleet++;
      } else {
        const type = (f.type || 'Camión').trim();
        fleetByTypeTotals[type] = (fleetByTypeTotals[type] || 0) + 1;
      }
    });

    // Ocupación a partir de assignmentsForDate
    const occStaffByRoleSet = {};
    const occStaffExtSet = new Set();
    const occCamionByTypeSet = {};
    const occCamionExtSet = new Set();

    (assignmentsForDate || []).forEach(r => {
      // Camiones (solo RM)
      if (r.camion && !r.camion.toLowerCase().includes('sin cami') && r.camion.trim() !== '') {
        const rawCam = r.camion.trim();
        const matchParen = rawCam.match(/^([^(]+)(?:\(([^)]+)\))?/);
        const cCode = (matchParen ? matchParen[1] : rawCam).trim().toLowerCase();
        const cPlate = (matchParen && matchParen[2] ? matchParen[2] : (r.patente || '')).trim().toLowerCase();
        
        const foundTruck = fleetList.find(f => {
          const fCode = (f.internal_number || '').trim().toLowerCase();
          const fPlate = (f.plate || '').trim().toLowerCase();
          if (cCode && fCode && (fCode === cCode || cCode.startsWith(fCode) || fCode.startsWith(cCode))) return true;
          if (cPlate && fPlate && fPlate === cPlate) return true;
          return false;
        });

        // Solo considerar camiones de Región RM (Requisito 3)
        if (foundTruck && !isRM(foundTruck)) {
          return;
        }

        const isExt = foundTruck 
          ? isVehicleExternal(foundTruck)
          : (r.tipo_flota === 'Externa' || !!r.empresa_externa || isVehicleExternal({ internal_number: cCode, plate: cPlate, transportista: r.transportista }));

        const truckKey = cPlate || cCode || rawCam;
        if (isExt) {
          occCamionExtSet.add(truckKey);
        } else {
          const type = (foundTruck?.type || r.tipo_equipo || 'Camión').trim();
          if (!occCamionByTypeSet[type]) occCamionByTypeSet[type] = new Set();
          occCamionByTypeSet[type].add(truckKey);
        }
      }

      // Dotaciones (Conductores y Auxiliares) por Cargo
      [r.conductor_name, r.aux1_name, r.aux2_name].forEach(name => {
        if (!name || name.toLowerCase().includes('sin ') || name.trim() === '') return;
        const cleanName = name.trim();
        const foundStaff = staffList.find(s => s.name && s.name.trim().toLowerCase() === cleanName.toLowerCase());
        const isExt = foundStaff 
          ? isStaffExt(foundStaff)
          : (cleanName.toUpperCase().startsWith('EXT-') || (r.tipo_flota === 'Externa'));

        if (isExt) {
          occStaffExtSet.add(cleanName.toLowerCase());
        } else {
          const rawRole = (foundStaff?.role || foundStaff?.cargo || 'Conductor B').trim();
          const role = normalizeRole(rawRole);
          if (!occStaffByRoleSet[role]) occStaffByRoleSet[role] = new Set();
          occStaffByRoleSet[role].add(cleanName.toLowerCase());
        }
      });
    });

    // Desglose de dotación propia por cargo
    const preferredRoleOrder = ['Conductor A4', 'Conductor B', 'Conductor A5', 'Auxiliar', 'Movilizador', 'Conductor / Auxiliar'];
    const otherRoles = Object.keys(staffByRoleTotals).filter(r => !preferredRoleOrder.includes(r));
    const orderedRoles = [...preferredRoleOrder, ...otherRoles].filter(r => (staffByRoleTotals[r] || 0) > 0 || (occStaffByRoleSet[r]?.size || 0) > 0);

    const staffRolesBreakdown = orderedRoles.map(role => {
      const occ = occStaffByRoleSet[role]?.size || 0;
      const tot = Math.max(occ, staffByRoleTotals[role] || 0);
      return {
        role,
        occupied: occ,
        total: tot,
        free: Math.max(0, tot - occ)
      };
    });

    // Desglose de camiones propios RM por tipo de vehículo
    const preferredTruckTypes = ['Camión', 'Tracto', 'Camioneta', 'Semirremolque'];
    const otherTypes = Object.keys(fleetByTypeTotals).filter(t => !preferredTruckTypes.includes(t));
    const orderedTypes = [...preferredTruckTypes, ...otherTypes].filter(t => (fleetByTypeTotals[t] || 0) > 0 || (occCamionByTypeSet[t]?.size || 0) > 0);

    const truckTypesBreakdown = orderedTypes.map(type => {
      const occ = occCamionByTypeSet[type]?.size || 0;
      const tot = Math.max(occ, fleetByTypeTotals[type] || 0);
      return {
        type,
        occupied: occ,
        total: tot,
        free: Math.max(0, tot - occ)
      };
    });

    const occExtTrucks = occCamionExtSet.size;
    const totExtTrucks = Math.max(occExtTrucks, totalExtFleet);

    const occExtStaff = occStaffExtSet.size;
    const totExtStaff = Math.max(occExtStaff, totalExtStaff);

    return {
      staffRolesBreakdown,
      truckTypesBreakdown,
      externosStaff: {
        occupied: occExtStaff,
        total: totExtStaff,
        free: Math.max(0, totExtStaff - occExtStaff)
      },
      externosFleet: {
        occupied: occExtTrucks,
        total: totExtTrucks,
        free: Math.max(0, totExtTrucks - occExtTrucks)
      }
    };
  }, [assignmentsForDate, staffList, fleetList]);

  return (
    <div className="flex flex-col h-full bg-slate-50 p-2 gap-2 overflow-hidden">
      
      {/* 1. BARRA SUPERIOR DE CONTROL */}
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-2.5 flex flex-col gap-2 shrink-0">
        
        {/* Fila Superior: Controles a la izquierda y Botones de acción al extremo derecho */}
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          {/* Controles: Fecha a disponibilizar + Filtros Rápidos */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector "Fecha a disponibilizar" */}
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl">
              <Calendar size={16} className="text-blue-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-blue-800 uppercase tracking-wide">
                  Fecha a disponibilizar
                </span>
                <select 
                  value={activeDate}
                  onChange={e => setSelectedDisponibilizarDate(e.target.value)}
                  className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                >
                  {availableDates.length > 0 ? (
                    availableDates.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))
                  ) : (
                    <option value={activeDate}>{activeDate}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Multi-Filtro Ruta (Requisito 2) */}
            <CompactMultiSelect 
              label="Ruta"
              options={availableRutas}
              selectedValues={selectedRutas}
              onChange={setSelectedRutas}
              placeholder="Todas"
            />

            {/* Multi-Filtro Transportista (Requisito 2) */}
            <CompactMultiSelect 
              label="Transp."
              options={availableTransportistas}
              selectedValues={selectedTransportistas}
              onChange={setSelectedTransportistas}
              placeholder="Todos"
            />

            <div className="relative">
              <Search className="absolute left-2 top-2 text-slate-400" size={12} />
              <input 
                type="text" 
                placeholder="Cliente..." 
                value={matrixFilterCliente}
                onChange={e => setMatrixFilterCliente(e.target.value)}
                className="pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-24 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 h-7.5"
              />
            </div>

            {/* Filtro Asignación */}
            <select
              value={matrixFilterEstado}
              onChange={e => setMatrixFilterEstado(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none h-7.5 font-medium"
              title="Filtrar por estado de asignación"
            >
              <option value="Todos">Asignación</option>
              <option value="Conductor asignado">Con Chofer</option>
              <option value="Sin conductor">Sin Chofer</option>
              <option value="Camion asignado">Con Camión</option>
              <option value="Sin camion">Sin Camión</option>
            </select>

            {(selectedRutas.length > 0 || selectedTransportistas.length > 0 || matrixFilterCliente || matrixFilterEstado !== 'Todos') && (
              <button
                onClick={() => {
                  setSelectedRutas([]);
                  setSelectedTransportistas([]);
                  setMatrixFilterCliente('');
                  setMatrixFilterEstado('Todos');
                }}
                className="text-[10px] text-red-600 hover:text-red-800 font-bold px-1.5 py-1 hover:bg-red-50 rounded"
                title="Limpiar todos los filtros"
              >
                × Limpiar
              </button>
            )}
          </div>

          {/* Botones de acción al extremo derecho (Requisito 1) */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <Button 
              onClick={() => handleOpenAperturarModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-7.5 px-3 flex items-center gap-1.5 shadow-sm rounded-xl cursor-pointer"
              title="Apertura / dividir una ruta quitando filas/paradas hacia una nueva numeración"
            >
              <Scissors size={13} />
              Apertura Ruta
            </Button>

            {/* Botón Registrar Servicio Extra */}
            <Button 
              onClick={() => handleOpenExtraServicesModal()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-7.5 px-3 flex items-center gap-1.5 shadow-sm rounded-xl cursor-pointer"
              title="Registrar servicios extras (Retiro camión, Taller, Vulcanización, Traspasos, Apoyo Centro, etc.)"
            >
              <Plus size={13} />
              Servicio Extra
            </Button>

            {/* Botón Guardar Disponibilización */}
            <Button 
              onClick={handlePreSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-7.5 px-3 flex items-center gap-1.5 shadow-sm rounded-xl cursor-pointer"
              title="Guarda la disponibilización y valida si faltan asignaciones"
            >
              <Save size={13} />
              Guardar Disponibilización
            </Button>
          </div>
        </div>

        {/* Fila Inferior: Tarjetas resumen extendidas en el extremo completo (Requisito 1) */}
        <div className="w-full flex items-center gap-1.5 text-xs text-slate-500 overflow-x-auto pt-1.5 border-t border-slate-100 scrollbar-thin">
          <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-lg text-[11px] whitespace-nowrap shrink-0">
            {totalLocales} locales
          </span>
          <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-lg text-[11px] whitespace-nowrap shrink-0">
            {totalM3} m³
          </span>

          {/* Separación de Dotación Propia por Cargo */}
          {occupancyStats.staffRolesBreakdown.map(item => (
            <span 
              key={item.role}
              className="bg-blue-50 text-blue-700 border border-blue-200/60 font-bold px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap flex items-center gap-1 cursor-help shrink-0" 
              title={`${item.role}: ${item.occupied} ocupados / ${item.total} totales (${item.free} por ocupar)`}
            >
              <Users size={11} className="text-blue-600" />
              {item.occupied}/{item.total} {item.role}
            </span>
          ))}

          {/* Dotación Externa */}
          <span 
            className="bg-purple-50 text-purple-700 border border-purple-200/60 font-bold px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap flex items-center gap-1 cursor-help shrink-0" 
            title={`Dotación Externa: ${occupancyStats.externosStaff.occupied} ocupados / ${occupancyStats.externosStaff.total} totales (${occupancyStats.externosStaff.free} por ocupar)`}
          >
            <Users size={11} className="text-purple-600" />
            {occupancyStats.externosStaff.occupied}/{occupancyStats.externosStaff.total} Externos
          </span>

          {/* Separación de Camiones Propios RM por Tipo de Vehículo */}
          {occupancyStats.truckTypesBreakdown.map(item => (
            <span 
              key={item.type}
              className="bg-sky-50 text-sky-700 border border-sky-200/60 font-bold px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap flex items-center gap-1 cursor-help shrink-0" 
              title={`${item.type} (RM): ${item.occupied} ocupados / ${item.total} totales (${item.free} disponibles)`}
            >
              <Truck size={11} className="text-sky-600" />
              {item.occupied}/{item.total} {item.type}
            </span>
          ))}

          {/* Camiones Flota Externa (RM) */}
          <span 
            className="bg-amber-50 text-amber-800 border border-amber-200/60 font-bold px-2 py-0.5 rounded-lg text-[11px] whitespace-nowrap flex items-center gap-1 cursor-help shrink-0" 
            title={`Flota Externa (RM): ${occupancyStats.externosFleet.occupied} ocupados / ${occupancyStats.externosFleet.total} totales (${occupancyStats.externosFleet.free} disponibles)`}
          >
            <Truck size={11} className="text-amber-600" />
            {occupancyStats.externosFleet.occupied}/{occupancyStats.externosFleet.total} Flota Externa
          </span>
        </div>
      </header>

      {/* Floating Toolbar when rows are selected */}
      {selectedRowIds.length > 0 && (
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-xl shadow-md p-2 px-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="font-bold text-xs">
              {selectedRowIds.length} fila(s) seleccionada(s)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick Vuelta selector */}
            <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-lg">
              <span className="text-[10px] font-bold text-blue-200">N° Vuelta:</span>
              <select
                value={quickVuelta}
                onChange={(e) => setQuickVuelta(e.target.value)}
                className="bg-slate-800 text-white text-[11px] font-black rounded px-1 py-0.5 focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button
                onClick={() => handleAssignBatchVuelta(quickVuelta)}
                className="bg-blue-500 hover:bg-blue-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded"
              >
                Asignar
              </button>
            </div>

            {selectedStaffMember && (
              <>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'conductor')}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <User size={12} />
                  Chofer: {(selectedStaffMember?.name || '').split(' ')[0] || 'Asignado'}
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  Aux 1
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar2')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  Aux 2
                </button>
              </>
            )}

            {selectedTruckObject && (
              <>
                <button
                  onClick={() => handleAssignTruck(selectedTruckObject)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <Truck size={12} />
                  Camión: {selectedTruckObject.internal_number || selectedTruckObject.plate}
                </button>
                {/* Permite asignar Semirremolque a Rampla */}
                <button
                  onClick={() => handleAssignRampla(selectedTruckObject)}
                  className="bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  Rampla
                </button>
              </>
            )}

            <button
              onClick={() => {
                clearSlotFromRows(activeDate, selectedRowIds, 'conductor');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar2');
                clearSlotFromRows(activeDate, selectedRowIds, 'camion');
                clearSlotFromRows(activeDate, selectedRowIds, 'rampla');
                clearSlotFromRows(activeDate, selectedRowIds, 'vuelta');
              }}
              className="bg-white/10 hover:bg-amber-500/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-colors"
              title="Limpiar asignaciones (desasigna dotación y camión sin eliminar la ruta)"
            >
              Limpiar asignaciones
            </button>

            <button
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
              title="Eliminar rutas seleccionadas de la Disponibilización"
            >
              <Trash2 size={12} />
              Eliminar ({selectedRowIds.length})
            </button>

            <button
              onClick={() => setSelectedRowIds([])}
              className="bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-colors"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* THREE-PANEL LAYOUT */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        
        {/* PANEL IZQUIERDO: Dotación (Reducido a 17%) */}
        <div className="w-[17%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
              <User size={13} className="text-blue-600" /> Dotación
            </h2>
            <button 
              onClick={() => setSortVueltasAsc(!sortVueltasAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por viajes"
            >
              {sortVueltasAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          
          <div className="flex border-b border-slate-100 bg-slate-50/30">
            <button 
              className={`flex-1 py-1 text-[10px] font-bold text-center transition-colors ${activeTabStaff === 'conductores' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTabStaff('conductores')}
            >
              Chofer ({conductores.length})
            </button>
            <button 
              className={`flex-1 py-1 text-[10px] font-bold text-center transition-colors ${activeTabStaff === 'auxiliares' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTabStaff('auxiliares')}
            >
              Aux ({auxiliares.length})
            </button>
          </div>

          <div className="p-1 border-b border-slate-100 bg-white space-y-1">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 text-slate-400" size={11} />
              <input 
                type="text" 
                placeholder="Nombre o RUT..." 
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full pl-5 pr-1.5 py-0.5 text-[10px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
            {/* Filtros de asistencia y tipo de dotación */}
            <div className="grid grid-cols-2 gap-1">
              <select
                value={staffAttendanceFilter}
                onChange={e => setStaffAttendanceFilter(e.target.value)}
                className="w-full text-[9px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
                title="Filtrar por condición de asistencia"
              >
                <option value="todos">Asistencia: Todos</option>
                <option value="disponibles">Solo disponibles</option>
                <option value="novedades">Con novedades</option>
              </select>
              <select
                value={staffTipoFilter}
                onChange={e => setStaffTipoFilter(e.target.value)}
                className="w-full text-[9px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
                title="Filtrar por tipo de dotación"
              >
                <option value="todos">Tipo: Todos</option>
                <option value="Propia">Solo Propia</option>
                <option value="Externo">Solo Externo</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1 space-y-1">
            {(activeTabStaff === 'conductores' ? conductores : auxiliares).map(staff => {
              const isSelected = selectedStaffMember?.id === staff.id;
              const isFocused = focusedEntity?.type === 'staff' && focusedEntity?.name === staff.name;
              const attStyle = staff.attStatus ? ATTENDANCE_STYLES[staff.attStatus] : null;

              let cardBgClass = 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50';
              if (isFocused) {
                cardBgClass = 'bg-blue-100/90 border-blue-500 ring-2 ring-blue-500 shadow-sm';
              } else if (isSelected) {
                cardBgClass = 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-xs';
              }

              return (
                <div 
                  key={staff.id} 
                  draggable
                  onDragStart={(e) => handleDragStartStaff(e, staff)}
                  onClick={() => {
                    setSelectedStaffMember(isSelected ? null : staff);
                    if (staff.viajes > 0) {
                      handleToggleFocusStaff(staff);
                    }
                  }}
                  className={`p-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none ${cardBgClass}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-1">
                      <p className="text-[11px] font-bold text-slate-800 truncate" title={staff.name}>
                        {staff.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[9px] text-slate-400 font-mono">
                          {staff.rut || 'S/RUT'}
                        </span>
                        <span 
                          className={`px-1 py-0.2 rounded text-[8px] font-semibold ${
                            staff.tipo_dotacion === 'Externo'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-600 border border-blue-200'
                          }`}
                          title={`Tipo dotación: ${staff.tipo_dotacion || 'Propia'}`}
                        >
                          {staff.tipo_dotacion === 'Externo' ? 'Ext' : 'Prop'}
                        </span>
                        {attStyle && (
                          <span 
                            className={`px-1 py-0.2 rounded text-[8px] font-black ${attStyle.badgeClass}`}
                            title={`Asistencia: ${attStyle.badge}`}
                          >
                            {attStyle.badge}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Badge de viajes - Clickeable para filtrar rutas asignadas (Requisito 4) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (staff.viajes > 0) {
                          handleToggleFocusStaff(staff);
                        }
                      }}
                      title={staff.viajes > 0 ? "Haz clic para ver solo sus rutas asignadas" : "Sin rutas asignadas"}
                      className={`shrink-0 px-1.5 py-0.2 rounded-full text-[9px] font-black transition-all ${
                        isFocused 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : staff.viajes > 0 
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer' 
                            : 'bg-slate-100 text-slate-500 cursor-default'
                      }`}
                    >
                      {staff.viajes === 1 ? '1 viaje' : `${staff.viajes} viajes`}
                    </button>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestAssignStaff(staff, activeTabStaff === 'conductores' ? 'conductor' : 'auxiliar');
                        }}
                        className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded shadow-xs ${
                          attStyle?.isAlert ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        + Asignar ({selectedRowIds.length})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL CENTRAL: Matriz Disponibilización General (66%) */}
        <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
          
          {/* Banner de filtro por Dotación o Camión enfocado (Requisito 4) */}
          {focusedEntity && (
            <div className="bg-blue-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-blue-200" />
                <span>
                  Mostrando solo rutas asignadas a {focusedEntity.type === 'staff' ? 'la dotación' : 'el camión'}:{' '}
                  <strong className="underline tracking-wide">{focusedEntity.name || focusedEntity.identifier}</strong>
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setFocusedEntity(null)}
                className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                title="Quitar filtro y ver todas las rutas"
              >
                <X size={11} /> Ver todas las rutas
              </button>
            </div>
          )}
          
          {/* Matriz Superior: Disponibilización General */}
          <div className="flex-[3] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-xs">
                  Disponibilización General — {activeDate}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                "N° de vuelta" (1 al 8) al lado de Fecha. Arrastra dotación o camiones.
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10 shadow-sm border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="px-2 py-2 text-center w-7">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll}
                        checked={filteredAssignments.length > 0 && selectedRowIds.length === filteredAssignments.length}
                        className="rounded text-blue-600 focus:ring-blue-500"
                        title="Seleccionar todas"
                      />
                    </th>
                    {/* N° de vuelta, vacía inicialmente con lista 1 al 8 */}
                    <th 
                      onClick={() => handleSortMatrix('n_vuelta')}
                      className="px-2.5 py-2 text-center bg-amber-50/70 text-amber-900 border-r border-amber-200 cursor-pointer select-none hover:bg-amber-100 transition-colors"
                      title="Clic para ordenar por N° de vuelta"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>N° de vuelta</span>
                        <span className={`text-[10px] ${matrixSortCol === 'n_vuelta' ? 'text-amber-800 font-bold' : 'text-amber-400 opacity-60'}`}>
                          {matrixSortCol === 'n_vuelta' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* N° de Ruta al lado de N° de vuelta */}
                    <th 
                      onClick={() => handleSortMatrix('ruta')}
                      className="px-2.5 py-2 font-black text-slate-800 bg-slate-200/60 border-r border-slate-300 cursor-pointer select-none hover:bg-slate-300/70 transition-colors"
                      title="Clic para ordenar por N° de Ruta"
                    >
                      <div className="flex items-center gap-1">
                        <span>N° de Ruta</span>
                        <span className={`text-[10px] ${matrixSortCol === 'ruta' ? 'text-blue-700 font-bold' : 'text-slate-400 opacity-60'}`}>
                          {matrixSortCol === 'ruta' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('conductor_name')}
                      className="px-2.5 py-2 text-blue-700 bg-blue-50/50 cursor-pointer select-none hover:bg-blue-100/70 transition-colors"
                      title="Clic para ordenar por Conductor"
                    >
                      <div className="flex items-center gap-1">
                        <span>Conductor</span>
                        <span className={`text-[10px] ${matrixSortCol === 'conductor_name' ? 'text-blue-800 font-bold' : 'text-blue-400 opacity-60'}`}>
                          {matrixSortCol === 'conductor_name' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('aux1_name')}
                      className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50 cursor-pointer select-none hover:bg-indigo-100/70 transition-colors"
                      title="Clic para ordenar por Auxiliar"
                    >
                      <div className="flex items-center gap-1">
                        <span>Auxiliar</span>
                        <span className={`text-[10px] ${matrixSortCol === 'aux1_name' ? 'text-indigo-800 font-bold' : 'text-indigo-400 opacity-60'}`}>
                          {matrixSortCol === 'aux1_name' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('aux2_name')}
                      className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50 cursor-pointer select-none hover:bg-indigo-100/70 transition-colors"
                      title="Clic para ordenar por Auxiliar 2"
                    >
                      <div className="flex items-center gap-1">
                        <span>Auxiliar 2</span>
                        <span className={`text-[10px] ${matrixSortCol === 'aux2_name' ? 'text-indigo-800 font-bold' : 'text-indigo-400 opacity-60'}`}>
                          {matrixSortCol === 'aux2_name' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('camion')}
                      className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50 cursor-pointer select-none hover:bg-emerald-100/70 transition-colors"
                      title="Clic para ordenar por Camión"
                    >
                      <div className="flex items-center gap-1">
                        <span>Camión</span>
                        <span className={`text-[10px] ${matrixSortCol === 'camion' ? 'text-emerald-800 font-bold' : 'text-emerald-400 opacity-60'}`}>
                          {matrixSortCol === 'camion' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('rampla')}
                      className="px-2.5 py-2 text-teal-700 bg-teal-50/40 cursor-pointer select-none hover:bg-teal-100/70 transition-colors"
                      title="Clic para ordenar por Rampla"
                    >
                      <div className="flex items-center gap-1">
                        <span>Rampla</span>
                        <span className={`text-[10px] ${matrixSortCol === 'rampla' ? 'text-teal-800 font-bold' : 'text-teal-400 opacity-60'}`}>
                          {matrixSortCol === 'rampla' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('cliente')}
                      className="px-2.5 py-2 cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                      title="Clic para ordenar por Cliente"
                    >
                      <div className="flex items-center gap-1">
                        <span>Cliente</span>
                        <span className={`text-[10px] ${matrixSortCol === 'cliente' ? 'text-blue-600 font-bold' : 'text-slate-400 opacity-60'}`}>
                          {matrixSortCol === 'cliente' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('referencia')}
                      className="px-2.5 py-2 cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                      title="Clic para ordenar por Referencia"
                    >
                      <div className="flex items-center gap-1">
                        <span>Referencia</span>
                        <span className={`text-[10px] ${matrixSortCol === 'referencia' ? 'text-blue-600 font-bold' : 'text-slate-400 opacity-60'}`}>
                          {matrixSortCol === 'referencia' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('locales')}
                      className="px-2.5 py-2 text-center cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                      title="Clic para ordenar por Cantidad de Locales"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Cantidad de Locales</span>
                        <span className={`text-[10px] ${matrixSortCol === 'locales' ? 'text-blue-600 font-bold' : 'text-slate-400 opacity-60'}`}>
                          {matrixSortCol === 'locales' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSortMatrix('m3')}
                      className="px-2.5 py-2 text-right cursor-pointer select-none hover:bg-slate-200/60 transition-colors"
                      title="Clic para ordenar por Metros cúbicos"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Metros cúbicos</span>
                        <span className={`text-[10px] ${matrixSortCol === 'm3' ? 'text-blue-600 font-bold' : 'text-slate-400 opacity-60'}`}>
                          {matrixSortCol === 'm3' ? (matrixSortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th className="px-2 py-2 text-center w-12 text-slate-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sortedFilteredAssignments.map((row) => {
                    const isSelected = selectedRowIds.includes(row.id);
                    return (
                      <tr 
                        key={row.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnRow(e, row.id, 'auto')}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-2 py-2 text-center">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => handleSelectRow(row.id)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                        </td>

                        {/* N° de vuelta (vacía inicialmente, lista 1 al 8) */}
                        <td className="px-2 py-2 text-center bg-amber-50/30 border-r border-amber-100">
                          <select
                            value={row.n_vuelta || ''}
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'n_vuelta', e.target.value)}
                            className="text-xs font-black text-slate-800 border border-amber-300 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          >
                            <option value="">—</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                            <option value="8">8</option>
                          </select>
                        </td>

                        {/* 3. N° de Ruta (Al lado de N° de vuelta) con comentario flotante (Requisito 4) */}
                        <td className="px-2.5 py-2 font-black text-slate-800 text-sm bg-slate-50/50 border-r border-slate-200 relative group/route">
                          <div className="flex items-center gap-1 cursor-pointer">
                            <span className="border-b border-dotted border-slate-400 group-hover/route:text-blue-700 transition-colors">
                              {row.ruta}
                            </span>
                            {row.paradas && row.paradas.length > 0 && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({row.paradas.length})
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAperturarModal(row);
                              }}
                              className="opacity-0 group-hover/route:opacity-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-0.5 rounded transition-all ml-0.5"
                              title="Aperturar / dividir paradas de esta ruta"
                            >
                              <Scissors size={11} />
                            </button>
                          </div>

                          {/* Comentario flotante con Destino, Dirección y Comuna (Permite interactuar y hacer scroll) */}
                          <div className="hidden group-hover/route:block hover:block absolute left-full top-0 pl-1.5 z-50">
                            <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-3 border border-slate-700 min-w-[320px] max-w-[430px] pointer-events-auto animate-in fade-in zoom-in-95">
                              {(() => {
                                const paradasList = row.paradas || [];
                                const distinctAmbientes = Array.from(
                                  new Set(paradasList.map(p => String(p.ambiente || '').trim().toUpperCase()).filter(Boolean))
                                ).sort();
                                return (
                                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <MapPin size={13} className="text-red-400 shrink-0" />
                                      <span className="font-bold text-xs text-white">Ruta {row.ruta}</span>
                                      {distinctAmbientes.length > 0 && (
                                        <div className="flex items-center gap-1 ml-1">
                                          {distinctAmbientes.map(amb => (
                                            <span
                                              key={amb}
                                              className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                                                amb === 'C'
                                                  ? 'bg-sky-500/30 text-sky-200 border border-sky-400/50'
                                                  : amb === 'R'
                                                    ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                                                    : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50'
                                              }`}
                                              title={`Ambiente de la ruta: ${amb === 'C' ? 'Congelado' : amb === 'R' ? 'Refrigerado' : 'Seco'}`}
                                            >
                                              {amb}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{row.cliente}</span>
                                  </div>
                                );
                              })()}

                              {row.paradas && row.paradas.length > 0 ? (
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1.5">
                                  {row.paradas.map((p, pIdx) => {
                                    const amb = String(p.ambiente || 'S').trim().toUpperCase();
                                    const badgeStyle = 
                                      amb === 'C' 
                                        ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40 shadow-xs' 
                                        : amb === 'R' 
                                          ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40 shadow-xs' 
                                          : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 shadow-xs';
                                    const ambLabel = amb === 'C' ? 'Congelado' : amb === 'R' ? 'Refrigerado' : 'Seco';

                                    return (
                                      <div key={p.id || pIdx} className="text-[11px] pb-1.5 border-b border-slate-800 last:border-0 last:pb-0">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-bold text-slate-100 truncate">
                                            {p.secuencia ? `${p.secuencia}. ` : ''}{p.destino}
                                          </span>
                                          <span 
                                            className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 tracking-wider ${badgeStyle}`}
                                            title={`Ambiente: ${ambLabel} (${amb})`}
                                          >
                                            {amb}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-300 mt-0.5">
                                          <span className="text-slate-400">Dir: </span>{p.direccion || 'Sin dirección'}
                                        </div>
                                        <div className="text-[10px] text-slate-300 flex items-center justify-between gap-2">
                                          <div>
                                            <span className="text-slate-400">Comuna: </span>
                                            <strong className="text-blue-300">{p.comuna || 'Sin comuna'}</strong>
                                          </div>
                                          {(p.volumen > 0 || p.peso > 0 || p.cantCJ > 0) && (
                                            <div className="text-[9px] text-slate-400 flex items-center gap-1.5 shrink-0">
                                              {p.volumen > 0 && <span>{Number(p.volumen).toFixed(3)} m³</span>}
                                              {p.peso > 0 && <span>{Number(p.peso).toFixed(1)} kg</span>}
                                              {p.cantCJ > 0 && <span>{p.cantCJ} CJ</span>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-300 space-y-1">
                                  <div><span className="text-slate-400">Destino: </span>{row.cliente || 'Centralizado'}</div>
                                  <div><span className="text-slate-400">Dirección: </span>Centro de Distribución</div>
                                  <div><span className="text-slate-400">Comuna: </span><strong className="text-blue-300">Santiago</strong></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 4. Conductor */}
                        <td 
                          className="px-2.5 py-2 font-bold text-slate-800 max-w-[130px] truncate bg-blue-50/20 transition-colors hover:bg-blue-100/40"
                          title={row.conductor_name}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnRow(e, row.id, 'conductor');
                          }}
                        >
                          {row.conductor_name ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate flex items-center gap-1">
                                <span className="truncate">{row.conductor_name}</span>
                                {staffList.find(s => s.name === row.conductor_name)?.tipo_dotacion === 'Externo' && (
                                  <span className="px-1 py-0.2 rounded text-[7px] font-black bg-purple-100 text-purple-700 border border-purple-200 shrink-0" title="Dotación Externa">
                                    EXT
                                  </span>
                                )}
                              </span>
                              <button 
                                onClick={() => updateAssignmentField(activeDate, row.id, 'conductor_name', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar conductor"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— Vacío —</span>
                          )}
                        </td>

                        {/* 5. Auxiliar */}
                        <td 
                          className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20 transition-colors hover:bg-indigo-100/40"
                          title={row.aux1_name}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnRow(e, row.id, 'auxiliar');
                          }}
                        >
                          {row.aux1_name ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate font-medium flex items-center gap-1">
                                <span className="truncate">{row.aux1_name}</span>
                                {staffList.find(s => s.name === row.aux1_name)?.tipo_dotacion === 'Externo' && (
                                  <span className="px-1 py-0.2 rounded text-[7px] font-black bg-purple-100 text-purple-700 border border-purple-200 shrink-0" title="Dotación Externa">
                                    EXT
                                  </span>
                                )}
                              </span>
                              <button 
                                onClick={() => updateAssignmentField(activeDate, row.id, 'aux1_name', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar auxiliar"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— Vacío —</span>
                          )}
                        </td>

                        {/* 6. Auxiliar 2 */}
                        <td 
                          className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20 transition-colors hover:bg-indigo-100/40"
                          title={row.aux2_name}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnRow(e, row.id, 'auxiliar2');
                          }}
                        >
                          {row.aux2_name ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate font-medium">{row.aux2_name}</span>
                              <button 
                                onClick={() => updateAssignmentField(activeDate, row.id, 'aux2_name', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar auxiliar 2"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— Vacío —</span>
                          )}
                        </td>

                        {/* 7. Camión (Con Tipo de equipo en hover - Requisito 5) */}
                        <td 
                          className="px-2.5 py-2 font-bold text-slate-800 bg-emerald-50/20 relative group/truck transition-colors hover:bg-emerald-100/40"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnRow(e, row.id, 'camion');
                          }}
                        >
                          {row.camion ? (
                            <div className="flex items-center justify-between gap-1">
                              <span 
                                className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black text-[11px] cursor-help inline-flex items-center gap-1"
                                title={`Tipo de equipo: ${row.tipo_equipo || 'No especificado'}`}
                              >
                                {row.camion}
                              </span>
                              <button 
                                onClick={() => updateAssignmentField(activeDate, row.id, 'camion', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar camión"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— Vacío —</span>
                          )}

                          {/* Tooltip flotante mostrando Tipo de equipo al pasar cursor (Requisito 5) */}
                          {row.tipo_equipo && (
                            <div className="hidden group-hover/truck:flex absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap items-center gap-1.5 pointer-events-none animate-in fade-in zoom-in-95">
                              <Truck size={13} className="text-emerald-400" />
                              <span>Tipo de equipo: <strong className="text-emerald-300 font-bold">{row.tipo_equipo}</strong></span>
                            </div>
                          )}
                        </td>

                        {/* 9. Rampla (Asignable por arrastrar camión, semirremolque o texto - Requisito 5) */}
                        <td 
                          className="px-2.5 py-2 bg-teal-50/20 transition-colors hover:bg-teal-100/40"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnRow(e, row.id, 'rampla');
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <input 
                              type="text" 
                              value={row.rampla || ''} 
                              onChange={(e) => updateAssignmentField(activeDate, row.id, 'rampla', e.target.value)}
                              placeholder="Arrastrar..."
                              className="w-20 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                            {row.rampla && (
                              <button
                                type="button"
                                onClick={() => updateAssignmentField(activeDate, row.id, 'rampla', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar rampla"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 11. Cliente */}
                        <td className="px-2.5 py-2 font-medium text-slate-700 max-w-[150px] truncate" title={getBriefingOperation(row) || row.cliente}>
                          {getBriefingOperation(row) || row.cliente}
                        </td>

                        {/* 12. Referencia */}
                        <td className="px-2.5 py-2">
                          <input 
                            type="text" 
                            value={row.referencia || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'referencia', e.target.value)}
                            placeholder="Comentario..."
                            className="w-20 px-1 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 13. Cantidad de Locales */}
                        <td className="px-2.5 py-2 text-center font-bold">
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                            {row.locales || 0}
                          </span>
                        </td>

                        {/* 14. Metros cubicos */}
                        <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-700">
                          {row.m3 || 0}
                        </td>

                        {/* 15. Acción Eliminar Ruta */}
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setRouteToDelete(row)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                            title={`Eliminar Ruta ${row.ruta} de Disponibilización`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredAssignments.length === 0 && (
                    <tr>
                      <td colSpan="15" className="px-4 py-12 text-center text-slate-500">
                        No hay servicios para la fecha {activeDate}. Ve al menú <span className="font-bold text-blue-600">Planificación &gt; Asignación diaria</span> para cargar y transmitir la planilla de ruteo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA INFERIOR: RESUMEN DE ASIGNACIÓN POR RUTA */}
          {/* Formato compacto: Conductor + Camión + N° de vuelta + resumen m³, Peso, Locales + acordeón expandible */}
          <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-1.5 px-2 border-b border-slate-100 bg-blue-50/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-blue-700" />
                <h3 className="font-bold text-blue-900 text-xs">
                  Resumen de Asignación por Ruta — {activeDate}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span>Viajes planificados: <strong className="text-slate-800">{groupedSummary.length}</strong></span>
                <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
                <span>Peso: <strong className="text-amber-700">{totalPeso} kg</strong></span>
                <span>Total m³: <strong className="text-emerald-700 font-mono font-bold">{totalM3}</strong></span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-1.5 space-y-1">
              {groupedSummary.map((group) => {
                const isExpanded = !!expandedSummaryKeys[group.groupKey];
                const isFocusedGroup = focusedEntity && (
                  (focusedEntity.type === 'staff' && (focusedEntity.name === group.conductor_name || group.auxiliares.includes(focusedEntity.name))) ||
                  (focusedEntity.type === 'truck' && (focusedEntity.identifier === group.camion || group.camion.includes(focusedEntity.identifier)))
                );

                return (
                  <div key={group.groupKey} className={`border rounded-lg overflow-hidden bg-white shadow-2xs transition-all ${
                    isFocusedGroup ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-200'
                  }`}>
                    
                    {/* Fila Resumen Principal Compacta */}
                    <div 
                      onClick={() => toggleExpandSummary(group.groupKey)}
                      className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-2.5 py-1.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-[11px] gap-2 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-blue-600">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        
                        {/* Dotación (Clickeable para aislar solo sus rutas asignadas - Requisito 4) */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFocusStaff(group.conductor_name);
                          }}
                          className="flex items-center gap-1 cursor-pointer hover:bg-blue-100/60 p-0.5 rounded transition-colors"
                          title="Haz clic para ver solo las rutas asignadas a este conductor"
                        >
                          <span className="font-black text-slate-800 text-xs">
                            {group.conductor_name}
                          </span>
                          {group.conductor_rut && (
                            <span className="text-slate-400 font-mono text-[9px]">
                              ({group.conductor_rut})
                            </span>
                          )}
                        </div>

                        {/* Auxiliar al lado de Conductor (Clickeable para aislar rutas - Requisito 4) */}
                        {group.auxiliares && group.auxiliares.length > 0 && (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFocusStaff(group.auxiliares[0]);
                            }}
                            className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                            title="Haz clic para ver solo las rutas asignadas a este auxiliar"
                          >
                            <User size={10} className="text-indigo-600" />
                            Aux: {group.auxiliares.join(', ')}
                          </span>
                        )}

                        {/* Camión (Clickeable para aislar rutas del camión - Requisito 4) */}
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (group.camion && group.camion !== 'Sin camión') {
                              handleToggleFocusTruck(group.camion);
                            }
                          }}
                          className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                          title="Haz clic para ver solo las rutas asignadas a este camión"
                        >
                          <Truck size={10} />
                          {group.camion || 'Sin camión'}
                        </span>

                        {/* N° de vuelta */}
                        <span className="bg-amber-100 text-amber-800 font-black px-1.5 py-0.2 rounded text-[10px]">
                          {group.vueltaLabel}
                        </span>

                        {/* Rutas contenidas */}
                        <span className="text-slate-400 text-[10px]">
                          [{group.rutas.map(r => `Ruta ${r.ruta}`).join(', ')}]
                        </span>
                      </div>

                      {/* Resumen al costado: m³, Peso, Locales */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-600">
                          Locales: <strong className="text-indigo-700">{group.totalLocales}</strong>
                        </span>
                        <span className="text-slate-600">
                          Peso: <strong className="text-amber-700">{group.totalPeso} kg</strong>
                        </span>
                        <span className="text-slate-600 font-mono font-black text-emerald-700 text-xs">
                          {group.totalM3} m³
                        </span>
                      </div>
                    </div>

                    {/* DESGLOSE AL DESPLEGAR: Todo lo asignado en esa vuelta, separado por N° de Ruta */}
                    {isExpanded && (
                      <div className="p-2 bg-slate-50/30 space-y-2">
                        {group.rutas.map(r => {
                          const paradas = r.paradas || [];
                          return (
                            <div key={`subroute-${r.id}`} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                              {/* Sub-header compacto de la ruta */}
                              <div className="bg-slate-100/70 px-2.5 py-1 border-b border-slate-200 flex items-center justify-between text-[11px] flex-wrap gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="bg-slate-800 text-white font-bold px-1.5 py-0.2 rounded text-[9px]">
                                    N° de Ruta {r.ruta}
                                  </span>
                                  <span className="font-bold text-slate-800 text-xs">{r.cliente}</span>
                                  {(r.aux1_name || r.aux2_name) && (
                                    <span className="bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.2 rounded text-[9px]">
                                      Aux: {[r.aux1_name, r.aux2_name].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2.5 text-[10px]">
                                  <span>{paradas.length} paradas</span>
                                  <span>{r.locales} locales</span>
                                  <span>{r.peso} kg</span>
                                  <span className="font-mono font-bold text-emerald-700">{r.m3} m³</span>
                                </div>
                              </div>

                              {/* Tabla compacta de paradas / destinos */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[10px] whitespace-nowrap">
                                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 text-[9px]">
                                    <tr>
                                      <th className="px-2 py-0.5 w-8">Sec</th>
                                      <th className="px-2 py-0.5">Destino</th>
                                      <th className="px-2 py-0.5">Dirección</th>
                                      <th className="px-2 py-0.5">Comuna</th>
                                      <th className="px-2 py-0.5">Horario</th>
                                      <th className="px-2 py-0.5 text-right">m³</th>
                                      <th className="px-2 py-0.5 text-right">Peso</th>
                                      <th className="px-2 py-0.5 text-right">CJ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {paradas.map((p, pIdx) => (
                                      <tr key={pIdx} className="hover:bg-slate-50">
                                        <td className="px-2 py-0.5 text-slate-500 font-bold">{p.secuencia || pIdx + 1}</td>
                                        <td className="px-2 py-0.5 font-bold text-slate-800">{p.destino}</td>
                                        <td className="px-2 py-0.5 text-slate-500">{p.direccion}</td>
                                        <td className="px-2 py-0.5 text-slate-600">{p.comuna}</td>
                                        <td className="px-2 py-0.5 text-slate-500 font-mono">
                                          {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                                        </td>
                                        <td className="px-2 py-0.5 text-right font-mono font-bold text-slate-700">{p.volumen}</td>
                                        <td className="px-2 py-0.5 text-right font-mono text-slate-600">{p.peso}</td>
                                        <td className="px-2 py-0.5 text-right font-mono text-slate-600">{p.cantCJ}</td>
                                      </tr>
                                    ))}
                                    {paradas.length === 0 && (
                                      <tr>
                                        <td colSpan="8" className="px-2 py-1.5 text-center text-slate-400 italic">
                                          Destino directo sin paradas adicionales.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {groupedSummary.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs italic">
                  Asigna un Conductor en la matriz superior para visualizar el resumen agrupado por vuelta y el detalle de paradas.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* PANEL DERECHO: Camiones (Reducido a 17%, separado en 3 pestañas: Camión/Camioneta, Tracto, Semirremolque) */}
        <div className="w-[17%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
              <Truck size={13} className="text-emerald-600" /> Camiones
            </h2>
            <button 
              onClick={() => setSortTrucksAsc(!sortTrucksAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por viajes"
            >
              {sortTrucksAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          
          {/* Pestañas de Camiones: Camión/Camioneta | Tracto | Semirremolque */}
          <div className="flex border-b border-slate-100 bg-slate-50/30 text-[9px] font-bold">
            <button 
              className={`flex-1 py-1 text-center transition-colors truncate ${activeTabTrucks === 'camiones' ? 'border-b-2 border-emerald-600 text-emerald-700 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTabTrucks('camiones')}
              title="Camiones y Camionetas"
            >
              Camión ({camionesList.length})
            </button>
            <button 
              className={`flex-1 py-1 text-center transition-colors truncate ${activeTabTrucks === 'tractos' ? 'border-b-2 border-emerald-600 text-emerald-700 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTabTrucks('tractos')}
              title="Tractos"
            >
              Tracto ({tractosList.length})
            </button>
            <button 
              className={`flex-1 py-1 text-center transition-colors truncate ${activeTabTrucks === 'semirremolques' ? 'border-b-2 border-emerald-600 text-emerald-700 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTabTrucks('semirremolques')}
              title="Semirremolques / Ramplas"
            >
              Rampla ({semirremolquesList.length})
            </button>
          </div>

          <div className="p-1 border-b border-slate-100 bg-white space-y-1">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 text-slate-400" size={11} />
              <input 
                type="text" 
                placeholder="Patente o N°..." 
                value={truckSearch}
                onChange={e => setTruckSearch(e.target.value)}
                className="w-full pl-5 pr-1.5 py-0.5 text-[10px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50"
              />
            </div>
            {/* Filtro por estado documental (Requisito 3) */}
            <select
              value={truckDocFilter}
              onChange={e => setTruckDocFilter(e.target.value)}
              className="w-full text-[9px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
              title="Filtrar por estado documental (REV. TÉC., GASES, PC, SOAP, CARNES)"
            >
              <option value="todos">Todos los equipos</option>
              <option value="al_dia">Al día (Sin alertas)</option>
              <option value="alertas">Con alertas o vencidos</option>
            </select>
            {/* Filtro por origen de flota (Propia / Externa) */}
            <select
              value={truckTipoFilter}
              onChange={e => setTruckTipoFilter(e.target.value)}
              className="w-full text-[9px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
              title="Filtrar por origen de flota (Propia vs Externa)"
            >
              <option value="todos">Flota: Todas (Propia + Externa)</option>
              <option value="propia">Solo Flota Propia</option>
              <option value="externa">Solo Flota Externa</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-1 space-y-1">
            {(
              activeTabTrucks === 'camiones' 
                ? camionesList 
                : activeTabTrucks === 'tractos' 
                  ? tractosList 
                  : semirremolquesList
            ).map(truck => {
              const isSelected = selectedTruckObject?.id === truck.id;
              const isSemirremolque = activeTabTrucks === 'semirremolques';
              const isBlocked = !!truck.isBlocked;
              const isFocused = focusedEntity?.type === 'truck' && (
                focusedEntity.identifier === truck.identifier ||
                focusedEntity.identifier === truck.plate ||
                (focusedEntity.plate && (focusedEntity.plate === truck.plate || truck.identifier.includes(focusedEntity.plate)))
              );
              
              // Color de la tarjeta: destacar si está bloqueado por taller, documental, baja, etc. (Requisito 4)
              let cardBgClass = 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50';
              if (isBlocked) {
                cardBgClass = 'bg-red-50/80 border-red-300 hover:border-red-400 hover:bg-red-100/60 shadow-xs';
              } else if (isFocused) {
                cardBgClass = 'bg-emerald-100/90 border-emerald-500 ring-2 ring-emerald-500 shadow-sm';
              } else if (isSelected) {
                cardBgClass = 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300 shadow-xs';
              }

              return (
                <div 
                  key={truck.id} 
                  draggable={!isBlocked}
                  onDragStart={(e) => {
                    if (isBlocked) {
                      e.preventDefault();
                      handleShowBlockedModal(truck);
                      return;
                    }
                    handleDragStartTruck(e, truck, isSemirremolque);
                  }}
                  onClick={() => {
                    if (isBlocked) {
                      handleShowBlockedModal(truck);
                      return;
                    }
                    setSelectedTruckObject(isSelected ? null : truck);
                    if (truck.viajes > 0) {
                      handleToggleFocusTruck(truck);
                    }
                  }}
                  className={`p-1.5 rounded-lg border transition-all select-none ${
                    isBlocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                  } ${cardBgClass}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1">
                      <div className={`${isBlocked ? 'bg-red-700' : 'bg-slate-800'} text-white text-[10px] font-black px-1.5 py-0.2 rounded tracking-wider flex items-center gap-1`}>
                        {isBlocked && <span>🚫</span>}
                        <span>{truck.internal_number || truck.plate}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {truck.plate}
                      </span>
                      {isBlocked ? (
                        <span 
                          className="text-[8px] font-black px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-300 uppercase truncate max-w-[100px]" 
                          title={`Vehículo bloqueado: ${truck.status}`}
                        >
                          {truck.status}
                        </span>
                      ) : isVehicleExternal(truck) && (
                        <span 
                          className="text-[8px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200 uppercase truncate max-w-[85px]" 
                          title={`Flota Externa: ${truck.empresa_externa || 'Tercero'}`}
                        >
                          {truck.empresa_externa || 'EXTERNO'}
                        </span>
                      )}
                    </div>
                    {/* Badge de viajes basado en vueltas distintas - clickeable para filtrar (Requisito 4) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBlocked) {
                          handleShowBlockedModal(truck);
                          return;
                        }
                        if (truck.viajes > 0) {
                          handleToggleFocusTruck(truck);
                        }
                      }}
                      title={truck.viajes > 0 ? (isFocused ? "Quitar filtro de rutas" : "Haz clic para ver solo sus rutas asignadas") : "Sin rutas asignadas"}
                      className={`shrink-0 px-1.5 py-0.2 rounded-full text-[9px] font-black transition-all ${
                        isFocused
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : truck.viajes > 0 
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer' 
                            : 'bg-slate-100 text-slate-500 cursor-default'
                      }`}
                    >
                      {truck.viajes === 1 ? '1 viaje' : `${truck.viajes} viajes`}
                    </button>
                  </div>

                  <div className="text-[9px] text-slate-500 truncate flex items-center justify-between">
                    <span>{truck.brand || 'Equipo'} • {truck.type || 'General'}</span>
                    {isBlocked && (
                      <span className="text-[8px] font-bold text-red-600 bg-red-50 px-1 rounded">
                        NO DISPONIBLE
                      </span>
                    )}
                  </div>

                  {/* Etiquetas de alerta de documentos (REV. TÉC., GASES, PC, SOAP, CARNES) */}
                  {truck.health?.alertDocs?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-slate-200/60">
                      {truck.health.alertDocs.map(d => (
                        <span 
                          key={d.name}
                          className={`text-[8px] font-black px-1 py-0.2 rounded border ${
                            d.status === 'red' 
                              ? 'bg-red-100 text-red-800 border-red-200' 
                              : d.status === 'orange' 
                                ? 'bg-orange-100 text-orange-800 border-orange-200' 
                                : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          }`}
                          title={`${d.name}: ${d.status === 'red' ? 'VENCIDO' : `Vence en ${d.days} días`}`}
                        >
                          {d.name} {d.status === 'red' ? 'VENC' : `${d.days}d`}
                        </span>
                      ))}
                    </div>
                  )}

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isBlocked) {
                            handleShowBlockedModal(truck);
                            return;
                          }
                          if (isSemirremolque) {
                            handleAssignRampla(truck);
                          } else {
                            handleAssignTruck(truck);
                          }
                        }}
                        className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded shadow-xs ${
                          isBlocked
                            ? 'bg-red-500 hover:bg-red-600'
                            : isSemirremolque 
                            ? 'bg-teal-600 hover:bg-teal-700' 
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        {isBlocked ? '🚫 Bloqueado' : isSemirremolque ? '+ Rampla' : '+ Camión'} ({selectedRowIds.length})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* POP-UP MODAL DE AUDITORÍA Y ALERTA AL GUARDAR DISPONIBILIZACIÓN (Requisito 2) */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    Auditoría y Registro de Modificaciones — Disponibilización
                  </h3>
                  <p className="text-xs text-slate-500">
                    Revisa las modificaciones detectadas antes de sincronizar con Ruteo y el Histórico de Cambios.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsAuditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Audit Metadata Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Usuario Modificador</span>
                <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-0.5">
                  <User size={13} className="text-blue-600" />
                  {auditData.usuario}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fecha Planificación</span>
                <span className="text-xs font-black text-blue-700 flex items-center gap-1 mt-0.5">
                  <Calendar size={13} />
                  {activeDate}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hora Anterior</span>
                <span className="text-[11px] font-mono text-slate-600 truncate block mt-0.5" title={auditData.horaAntigua}>
                  {auditData.horaAntigua}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Hora Modificada</span>
                <span className="text-[11px] font-mono font-bold text-emerald-800 truncate block mt-0.5" title={auditData.horaModificada}>
                  {auditData.horaModificada}
                </span>
              </div>
            </div>

            {/* Incomplete warning banner if any */}
            {auditData.incompleteList.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3 flex items-start gap-2.5 text-amber-900 shrink-0">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold">
                    ¿Está seguro que desea guardar esta información?
                  </p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Existen <strong className="font-bold">{auditData.incompleteList.length} ruta(s)</strong> sin Conductor y/o Camión asignado (
                    {auditData.incompleteList.map(r => `Ruta ${r.ruta}`).join(', ')}).
                  </p>
                </div>
              </div>
            )}

            {/* Comparison Table */}
            <div className="flex-1 overflow-hidden border border-slate-200 rounded-xl flex flex-col min-h-0 bg-white shadow-inner">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold shrink-0">
                <span>Detalle de Rutas y Asignaciones ({auditData.changes.length} servicios)</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {auditData.changes.filter(c => c.isDiff).length} modificadas / {auditData.changes.length} totales
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="px-2.5 py-2">Ruta</th>
                      <th className="px-2.5 py-2">Destino / Cliente</th>
                      <th className="px-2.5 py-2">Conductor (Antiguo ➔ Modificado)</th>
                      <th className="px-2.5 py-2">Auxiliar (Antiguo ➔ Modificado)</th>
                      <th className="px-2.5 py-2">Camión (Antiguo ➔ Modificado)</th>
                      <th className="px-2.5 py-2 text-center">N° Vuelta</th>
                      <th className="px-2.5 py-2">Usuario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {auditData.changes.map((item) => {
                      const isCondDiff = item.conductorAntiguo !== item.conductorModificado;
                      const isAuxDiff = item.auxiliarAntiguo !== item.auxiliarModificado;
                      const isCamDiff = item.camionAntiguo !== item.camionModificado;
                      const isVueltaDiff = item.vueltaAntigua !== item.vueltaModificada;

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isDiff ? 'bg-blue-50/20' : ''}`}>
                          <td className="px-2.5 py-2 font-black text-slate-900 font-mono">
                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-xs">
                              {item.ruta}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 font-semibold text-slate-700 max-w-[160px] truncate" title={item.destino}>
                            {item.destino}
                          </td>
                          
                          {/* Conductor Antiguo vs Modificado */}
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-slate-400 line-through text-[10px] max-w-[110px] truncate" title={`Antiguo: ${item.conductorAntiguo}`}>
                                {item.conductorAntiguo}
                              </span>
                              <span className="text-slate-300">➔</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[130px] truncate ${
                                isCondDiff 
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300' 
                                  : 'text-slate-700'
                              }`} title={`Modificado: ${item.conductorModificado}`}>
                                {item.conductorModificado}
                              </span>
                            </div>
                          </td>

                          {/* Auxiliar Antiguo vs Modificado */}
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-slate-400 line-through text-[10px] max-w-[100px] truncate" title={`Antiguo: ${item.auxiliarAntiguo}`}>
                                {item.auxiliarAntiguo}
                              </span>
                              <span className="text-slate-300">➔</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[120px] truncate ${
                                isAuxDiff 
                                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' 
                                  : 'text-slate-700'
                              }`} title={`Modificado: ${item.auxiliarModificado}`}>
                                {item.auxiliarModificado}
                              </span>
                            </div>
                          </td>

                          {/* Camión Antiguo vs Modificado */}
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-slate-400 line-through text-[10px] max-w-[90px] truncate" title={`Antiguo: ${item.camionAntiguo}`}>
                                {item.camionAntiguo}
                              </span>
                              <span className="text-slate-300">➔</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[110px] truncate ${
                                isCamDiff 
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                                  : 'text-slate-700'
                              }`} title={`Modificado: ${item.camionModificado}`}>
                                {item.camionModificado}
                              </span>
                            </div>
                          </td>

                          {/* Vuelta */}
                          <td className="px-2.5 py-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-[11px]">
                              {isVueltaDiff && (
                                <>
                                  <span className="text-slate-400 line-through text-[10px]">{item.vueltaAntigua}</span>
                                  <span className="text-slate-300">➔</span>
                                </>
                              )}
                              <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                                isVueltaDiff ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-slate-700'
                              }`}>
                                {item.vueltaModificada}
                              </span>
                            </div>
                          </td>

                          <td className="px-2.5 py-2 text-slate-600 font-semibold text-[11px]">
                            {item.usuario}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0 mt-3">
              <span className="text-[11px] text-slate-500">
                Se guardará una copia de auditoría en <strong className="text-slate-700 font-bold">Histórico de cambios</strong>.
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAuditModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmAuditAndSave}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Save size={14} />
                  Confirmar y Guardar Cambios
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL APERTURAR RUTA EN DISPONIBILIZACIÓN (Requisito 1) */}
      {isAperturarModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Scissors size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Aperturar / Dividir Ruta en Disponibilización</h3>
                  <p className="text-xs text-slate-500">
                    Selecciona una ruta, quita filas/paradas y crea una nueva ruta lista para asignar dotación y camión.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsAperturarModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
              
              {/* Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Ruta de Origen</label>
                  <select
                    value={aperturarSourceId}
                    onChange={(e) => {
                      setAperturarSourceId(e.target.value);
                      const r = assignmentsForDate.find(x => x.id === e.target.value);
                      if (r) {
                        setAperturarNewRouteNumber(`${r.ruta}-B`);
                        setAperturarNewRouteName(`${r.cliente || `Ruta ${r.ruta}`} (Aperturada)`);
                        setAperturarNewTransportista(r.transportista || '');
                        setAperturarSelectedParadaIds([]);
                        setAperturarFilterAmbiente('TODOS');
                      }
                    }}
                    className="w-full text-xs font-bold border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {assignmentsForDate.map(r => (
                      <option key={r.id} value={r.id}>
                        Ruta {r.ruta} - {r.cliente} ({r.paradas?.length || 0} paradas)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-blue-700 uppercase">Nueva Numeración *</label>
                  <input
                    type="text"
                    value={aperturarNewRouteNumber}
                    onChange={(e) => setAperturarNewRouteNumber(e.target.value)}
                    placeholder="Ej: 1611-B o 1700"
                    className="w-full text-xs font-black border border-blue-300 rounded-lg p-1.5 bg-white text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nombre / Cliente</label>
                  <input
                    type="text"
                    value={aperturarNewRouteName}
                    onChange={(e) => setAperturarNewRouteName(e.target.value)}
                    placeholder="Cliente de la nueva ruta"
                    className="w-full text-xs border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Transportista</label>
                  <input
                    type="text"
                    value={aperturarNewTransportista}
                    onChange={(e) => setAperturarNewTransportista(e.target.value)}
                    placeholder="Ej: T300 o T405"
                    className="w-full text-xs border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Table of Paradas to transfer */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    Selecciona las filas / paradas a transferir a la nueva Ruta {aperturarNewRouteNumber || '...'}:
                  </span>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {/* Filtro por Ambiente */}
                    <div className="flex items-center gap-1 text-[10px] bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 font-semibold px-1">Ver:</span>
                      {['TODOS', 'C', 'R', 'S'].map(amb => (
                        <button
                          key={amb}
                          type="button"
                          onClick={() => setAperturarFilterAmbiente(amb)}
                          className={`px-1.5 py-0.5 rounded font-black transition-colors ${
                            aperturarFilterAmbiente === amb 
                              ? 'bg-white text-blue-700 shadow-2xs' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {amb}
                        </button>
                      ))}
                    </div>

                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleSelectAllAperturarParadas}
                      className="text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAperturarParadasByAmbiente('C')}
                      className="text-sky-700 hover:text-sky-900 font-bold"
                      title="Seleccionar paradas de Congelado (C)"
                    >
                      +Solo C
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAperturarParadasByAmbiente('R')}
                      className="text-amber-700 hover:text-amber-900 font-bold"
                      title="Seleccionar paradas de Refrigerado (R)"
                    >
                      +Solo R
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAperturarParadasByAmbiente('S')}
                      className="text-emerald-700 hover:text-emerald-900 font-bold"
                      title="Seleccionar paradas de Seco (S)"
                    >
                      +Solo S
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearAllAperturarParadas}
                      className="text-slate-500 hover:text-red-600 font-semibold"
                    >
                      Deseleccionar
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 text-[11px]">
                      <tr>
                        <th className="px-2.5 py-1.5 w-8 text-center">✓</th>
                        <th className="px-2 py-1.5">Sec</th>
                        <th className="px-2 py-1.5 text-center">Ambiente</th>
                        <th className="px-2 py-1.5">Destino</th>
                        <th className="px-2 py-1.5">Dirección</th>
                        <th className="px-2 py-1.5">Comuna</th>
                        <th className="px-2 py-1.5">Horario</th>
                        <th className="px-2 py-1.5 text-right">m³</th>
                        <th className="px-2 py-1.5 text-right">Peso (kg)</th>
                        <th className="px-2 py-1.5 text-right">CJ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(currentAperturarSource?.paradas || [])
                        .filter(p => aperturarFilterAmbiente === 'TODOS' || p.ambiente === aperturarFilterAmbiente)
                        .map((p, pIdx) => {
                          const pId = p.id || `${currentAperturarSource.ruta}-${pIdx}`;
                          const isChecked = aperturarSelectedParadaIds.includes(pId);
                          return (
                            <tr 
                              key={pId} 
                              onClick={() => toggleSelectAperturarParada(pId)}
                              className={`cursor-pointer transition-colors ${
                                isChecked ? 'bg-blue-50/90 font-medium' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2.5 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectAperturarParada(pId)}
                                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-2 py-1 font-mono text-slate-500 text-[11px]">{p.secuencia}</td>
                              <td className="px-2 py-1 text-center">
                                <AmbienteBadge ambiente={p.ambiente} />
                              </td>
                              <td className="px-2 py-1 font-bold text-slate-800">{p.destino}</td>
                              <td className="px-2 py-1 text-slate-500 max-w-[150px] truncate">{p.direccion}</td>
                              <td className="px-2 py-1 text-slate-600">{p.comuna}</td>
                              <td className="px-2 py-1 text-slate-500 font-mono text-[11px]">
                                {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono font-bold text-emerald-700">{p.volumen}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-600">{p.peso}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-600">{p.cantCJ}</td>
                            </tr>
                          );
                        })}
                      {(currentAperturarSource?.paradas || []).length === 0 && (
                        <tr>
                          <td colSpan="10" className="p-4 text-center text-slate-400 italic">
                            Esta ruta no tiene paradas registradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Counter / Balance preview */}
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-2.5 mt-2 flex items-center justify-between text-xs text-blue-900 flex-wrap gap-2">
                  <div>
                    <span className="font-semibold">A transferir a Ruta {aperturarNewRouteNumber || 'Nueva'}: </span>
                    <strong className="text-blue-800 font-bold">{aperturarSelectedParadaIds.length} parada(s)</strong>
                  </div>
                  <div>
                    <span className="font-semibold">Quedarán en Ruta {currentAperturarSource?.ruta}: </span>
                    <strong className="text-slate-800 font-bold">
                      {Math.max(0, (currentAperturarSource?.paradas?.length || 0) - aperturarSelectedParadaIds.length)} parada(s)
                    </strong>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <Button 
                variant="outline" 
                onClick={() => setIsAperturarModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmAperturar}
                disabled={aperturarSelectedParadaIds.length === 0 || !aperturarNewRouteNumber.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Scissors size={14} />
                Confirmar y Crear Ruta {aperturarNewRouteNumber || ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL DE ADVERTENCIA AL ASIGNAR DOTACIÓN CON NOVEDAD O BAJA (Requisito 2) */}
      {warningStaffModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={26} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 leading-tight">
                  ¿Está seguro que desea asignar a esta dotación?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  El trabajador presenta una novedad de asistencia o estado no disponible.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Trabajador:</span>
                <span className="text-xs font-black text-slate-900 text-right">{warningStaffModal.staff?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">RUT:</span>
                <span className="text-xs font-mono font-bold text-slate-700">{warningStaffModal.staff?.rut || 'S/RUT'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Condición / Estado:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
                  {warningStaffModal.condition}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-xs font-semibold text-slate-500">Filas / Rol a asignar:</span>
                <span className="text-xs font-bold text-blue-700">
                  {warningStaffModal.targetIds?.length || 1} servicio(s) como {warningStaffModal.targetRole}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              El trabajador figura con novedad <strong className="text-red-700 font-bold">{warningStaffModal.condition}</strong> en Asistencia o Dotación. 
              Si confirma, quedará asignado a las rutas seleccionadas.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button 
                variant="outline" 
                onClick={() => setWarningStaffModal({ isOpen: false, staff: null, targetIds: [], targetRole: 'conductor', condition: '' })}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                onClick={confirmAssignStaffWithWarning}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm"
              >
                Sí, asignar de todas formas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL PARA AGREGAR SERVICIOS EXTRAS (Requisito 5) */}
      {isExtraServicesModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full p-5 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Plus size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    Registrar Servicios Extras — Disponibilización
                  </h3>
                  <p className="text-xs text-slate-500">
                    Completa las filas de servicios operativos adicionales (Taller, Vulcanización, Traspasos, etc.) y transmítelos al Histórico.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsExtraServicesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Datalists para autocompletado y escritura libre */}
            <datalist id="conductores-extra-datalist">
              {staffList.filter(s => (s.role || '').toLowerCase().includes('conductor')).map(s => (
                <option key={s.id} value={s.name}>{s.name} ({s.rut || 'S/RUT'})</option>
              ))}
            </datalist>

            <datalist id="auxiliares-extra-datalist">
              {staffList.filter(s => !(s.role || '').toLowerCase().includes('conductor')).map(s => (
                <option key={s.id} value={s.name}>{s.name} ({s.rut || 'S/RUT'})</option>
              ))}
            </datalist>

            <datalist id="camiones-extra-datalist">
              {fleetList.map(t => {
                const id = t.internal_number ? `${t.internal_number} (${t.plate})` : t.plate;
                return <option key={t.id} value={id}>{id} - {t.type || 'Camión'}</option>;
              })}
            </datalist>

            <datalist id="ramplas-extra-datalist">
              {fleetList.filter(t => (t.type || '').toLowerCase().includes('semirremolque') || (t.type || '').toLowerCase().includes('rampla')).map(t => {
                const id = t.internal_number || t.plate;
                return <option key={t.id} value={id}>{id}</option>;
              })}
            </datalist>

            {/* Tabla interactiva de filas de servicios extras */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl my-3 bg-slate-50/40 p-2 min-h-0">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="px-2 py-2 w-7 text-center">#</th>
                    <th className="px-2.5 py-2 w-28">Fecha</th>
                    <th className="px-2.5 py-2">Conductor *</th>
                    <th className="px-2.5 py-2">Auxiliar</th>
                    <th className="px-2.5 py-2">Camión *</th>
                    <th className="px-2.5 py-2 w-28">Rampla (opcional)</th>
                    <th className="px-2.5 py-2">Servicio *</th>
                    <th className="px-2.5 py-2">Anotación / Detalle</th>
                    <th className="px-2 py-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {extraServiceRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Fecha */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          value={row.fecha}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'fecha', e.target.value)}
                          placeholder="DD-MM-YYYY"
                          className="w-24 px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </td>

                      {/* Conductor */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          list="conductores-extra-datalist"
                          value={row.conductor_name}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'conductor_name', e.target.value)}
                          placeholder="Elegir o escribir chofer..."
                          className="w-48 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium"
                        />
                      </td>

                      {/* Auxiliar */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          list="auxiliares-extra-datalist"
                          value={row.aux1_name}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'aux1_name', e.target.value)}
                          placeholder="Auxiliar opcional..."
                          className="w-40 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </td>

                      {/* Camión */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          list="camiones-extra-datalist"
                          value={row.camion}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'camion', e.target.value)}
                          placeholder="Elegir camión..."
                          className="w-36 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium"
                        />
                      </td>

                      {/* Rampla */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          list="ramplas-extra-datalist"
                          value={row.rampla}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'rampla', e.target.value)}
                          placeholder="Rampla..."
                          className="w-28 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </td>

                      {/* Servicio Dropdown */}
                      <td className="px-2 py-1.5">
                        <select
                          value={row.servicio}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'servicio', e.target.value)}
                          className="px-2 py-1 text-xs font-bold border border-indigo-300 rounded-lg bg-indigo-50/50 text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="Retiro camión">Retiro camión</option>
                          <option value="Servicio de taller">Servicio de taller</option>
                          <option value="Servicio de vulcanización">Servicio de vulcanización</option>
                          <option value="Traspasos">Traspasos</option>
                          <option value="Apoyo Centro">Apoyo Centro</option>
                          <option value="SPID">SPID</option>
                          <option value="Otro">Otro (anotar personalización)</option>
                        </select>
                      </td>

                      {/* Anotación libre */}
                      <td className="px-2 py-1.5">
                        <input 
                          type="text"
                          value={row.nota}
                          onChange={(e) => handleUpdateExtraServiceRow(row.id, 'nota', e.target.value)}
                          placeholder="Anotar detalle opcional..."
                          className="w-48 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        />
                      </td>

                      {/* Eliminar fila */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraServiceRow(row.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Eliminar fila"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botón para agregar más filas */}
            <div className="flex items-center justify-between pb-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddExtraServiceRow}
                className="flex items-center gap-1.5 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
              >
                <Plus size={14} />
                + Agregar otra fila de servicio
              </Button>
              <span className="text-xs text-slate-400">
                {extraServiceRows.length} fila(s) de servicio
              </span>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <span className="text-[11px] text-slate-500">
                Se guardará con la fecha indicada y quedará registrado en <strong className="text-slate-700">Histórico de Disponibilización</strong>.
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsExtraServicesModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConfirmSaveExtraServices}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                >
                  <Save size={14} />
                  Guardar y Transmitir a Histórico
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN: ELIMINAR RUTA INDIVIDUAL */}
      {routeToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Eliminar Ruta</h3>
                <p className="text-xs text-slate-500">Fecha: {activeDate}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              ¿Estás seguro de eliminar la <strong>Ruta {routeToDelete.ruta}</strong> ({routeToDelete.cliente})? Esta acción eliminará el servicio de la Disponibilización del {activeDate}.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRouteToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Sí, eliminar ruta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN: ELIMINAR RUTAS EN LOTE */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Eliminar Rutas Seleccionadas</h3>
                <p className="text-xs text-slate-500">Fecha: {activeDate}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              ¿Estás seguro de eliminar las <strong>{selectedRowIds.length}</strong> rutas seleccionadas de la Disponibilización del {activeDate}?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBatch}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Sí, eliminar {selectedRowIds.length} rutas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: VEHÍCULO BLOQUEADO EN DISPONIBILIZACIÓN (Requisito 4) */}
      {blockedTruckModal.isOpen && blockedTruckModal.truck && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200 shadow-xs">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-1">
              Vehículo Bloqueado para Asignación
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Este vehículo no está disponible para operar en la Disponibilización diaria.
            </p>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-5 text-left space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-semibold">N° Interno:</span>
                <span className="font-mono font-black text-slate-800">{blockedTruckModal.truck.internal_number || 'S/N'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-semibold">Patente:</span>
                <span className="font-mono font-black text-slate-800">{blockedTruckModal.truck.plate}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-semibold">Motivo / Estado:</span>
                <span className="font-black text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-300 uppercase">
                  {blockedTruckModal.reason}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic mb-5">
              Para desbloquearlo y asignarlo a una ruta, debes cambiar su estado a <strong className="text-emerald-700">"Activo"</strong> desde el menú <strong className="text-slate-700">Gestión de Flota</strong>.
            </p>

            <Button
              onClick={() => setBlockedTruckModal({ isOpen: false, truck: null, reason: '' })}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-10 rounded-xl shadow-sm"
            >
              Entendido
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
