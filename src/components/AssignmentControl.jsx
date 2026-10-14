import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Filter, Search, RefreshCw, User, Truck, MapPin, 
  ChevronUp, ChevronDown, ChevronRight, CheckCircle2, Circle, Check,
  Calendar, Layers, Trash2, ArrowRight, UserCheck, Shield, Sparkles,
  Save, Eye, Download, Send, AlertTriangle, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useStaffStore } from '../store/staffStore';
import { useFleetStore } from '../store/fleetStore';
import { usePlanningStore, ensureRowTransportista } from '../store/planningStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { Button } from './ui/Button';

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
  const { staffList, fetchStaff } = useStaffStore();
  const { fleetList, fetchFleet } = useFleetStore();
  const { attendanceList, fetchAttendanceByDateRange } = useAttendanceStore();
  const { 
    transmittedAssignments, 
    selectedDisponibilizarDate, 
    setSelectedDisponibilizarDate,
    updateAssignmentField,
    batchUpdateRows,
    assignStaffToRows,
    assignTruckToRows,
    assignRamplaToRows,
    clearSlotFromRows,
    saveDisponibilizacion
  } = usePlanningStore();

  const availableDates = useMemo(() => {
    const dates = Object.keys(transmittedAssignments);
    return dates.sort();
  }, [transmittedAssignments]);

  const activeDate = selectedDisponibilizarDate || availableDates[0] || '14-10-2026';

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
    if (!selectedDisponibilizarDate && availableDates.length > 0) {
      setSelectedDisponibilizarDate(availableDates[0]);
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

  // Filtro de estado documental para camiones (Requisito 3)
  const [truckDocFilter, setTruckDocFilter] = useState('todos'); // 'todos' | 'al_dia' | 'alertas'

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

  // Filas expandidas en el Resumen inferior (por clave Conductor:::Vuelta)
  const [expandedSummaryKeys, setExpandedSummaryKeys] = useState({});

  // Pop-up modal de advertencia al asignar dotación con novedad (Requisito 2)
  const [warningStaffModal, setWarningStaffModal] = useState({
    isOpen: false,
    staff: null,
    targetIds: [],
    targetRole: 'conductor',
    condition: ''
  });

  // Entidad enfocada (al pinchar en Dotación o Camión para ver solo sus rutas asignadas - Requisito 4)
  const [focusedEntity, setFocusedEntity] = useState(null);

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
  }, [staffList, sortVueltasAsc, staffSearch, viajesPorPersona, attendanceMap, staffAttendanceFilter]);

  // Camiones clasificados en 3 categorías con evaluación de salud documental (Requisito 3)
  const { camionesList, tractosList, semirremolquesList } = useMemo(() => {
    const activeTrucks = (fleetList || [])
      .filter(t => t && (t.status === 'Activo' || !t.status))
      .filter(t => {
        const search = (truckSearch || '').toLowerCase();
        const matches = (t.internal_number || '').toLowerCase().includes(search) || 
               (t.plate || '').toLowerCase().includes(search) ||
               (t.brand || '').toLowerCase().includes(search);
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
        return {
          ...t,
          identifier,
          viajes: vCount,
          health
        };
      });

    const camiones = [];
    const tractos = [];
    const semis = [];

    activeTrucks.forEach(t => {
      const typeLower = (t.type || '').toLowerCase();
      if (typeLower.includes('semirremolque') || typeLower.includes('semiremolque') || typeLower.includes('rampla')) {
        semis.push(t);
      } else if (typeLower.includes('tracto')) {
        tractos.push(t);
      } else {
        camiones.push(t);
      }
    });

    const sortByViajes = (a, b) => sortTrucksAsc ? a.viajes - b.viajes : b.viajes - a.viajes;
    return {
      camionesList: camiones.sort(sortByViajes),
      tractosList: tractos.sort(sortByViajes),
      semirremolquesList: semis.sort(sortByViajes)
    };
  }, [fleetList, sortTrucksAsc, truckSearch, viajesPorCamion, truckDocFilter]);

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

      if (matrixFilterCliente && !String(a.cliente).toLowerCase().includes(matrixFilterCliente.toLowerCase())) return false;
      if (matrixFilterEstado === 'Conductor asignado' && !a.conductor_name) return false;
      if (matrixFilterEstado === 'Sin conductor' && a.conductor_name) return false;
      if (matrixFilterEstado === 'Camion asignado' && !a.camion) return false;
      if (matrixFilterEstado === 'Sin camion' && a.camion) return false;
      return true;
    });
  }, [assignmentsForDate, selectedRutas, selectedTransportistas, matrixFilterCliente, matrixFilterEstado, focusedEntity]);

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

      // Filtro Cliente
      if (matrixFilterCliente && !String(row.cliente).toLowerCase().includes(matrixFilterCliente.toLowerCase())) return;

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
      const attLower = String(att).toLowerCase();
      if (attLower.includes('vacaci')) return 'Vacaciones';
      if (attLower.includes('licenc')) return 'Licencia Médica';
      if (attLower.includes('ausent')) return 'Ausente';
      if (attLower.includes('con goce')) return 'Permiso con goce';
      if (attLower.includes('sin goce')) return 'Permiso sin goce';
      if (attLower.includes('baja')) return 'Baja';
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
    const targetIds = selectedRowIds.length > 0 ? selectedRowIds : [];
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar el vehículo.');
      return;
    }
    assignTruckToRows(activeDate, targetIds, truck);
  };

  const handleAssignRampla = (truck) => {
    if (!truck) return;
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

  // Guardar con Validación y Pop-up
  const handlePreSave = () => {
    const incomplete = assignmentsForDate.filter(r => !r.conductor_name || !r.camion);
    if (incomplete.length > 0) {
      setIncompleteRoutesList(incomplete);
      setIsConfirmModalOpen(true);
    } else {
      executeSave();
    }
  };

  const executeSave = () => {
    setIsConfirmModalOpen(false);
    const ok = saveDisponibilizacion(activeDate);
    if (ok) {
      toast.success('¡Disponibilización guardada! Transmitida a Ruteo.', {
        action: {
          label: 'Ver en Ruteo',
          onClick: () => navigate('/ruteo')
        }
      });
    }
  };

  // Drag and drop handlers
  const handleDragStartStaff = (e, staff) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'staff', data: staff }));
  };

  const handleDragStartTruck = (e, truck, isRampla = false) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: isRampla ? 'rampla' : 'truck', data: truck }));
  };

  const handleDropOnRow = (e, rowId, slotPreference = 'conductor') => {
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
        const roleLower = (staff.role || '').toLowerCase();
        let targetSlot = slotPreference;
        if (slotPreference === 'conductor' && (roleLower.includes('auxiliar') || roleLower.includes('movilizador'))) {
          targetSlot = 'auxiliar';
        }
        handleRequestAssignStaff(staff, targetSlot, targetIds);
      } else if (parsed.type === 'truck' || parsed.type === 'rampla') {
        // En la columna Rampla o Camión se pueden arrastrar camiones indistintamente (Requisito 5)
        if (slotPreference === 'rampla') {
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

  return (
    <div className="flex flex-col h-full bg-slate-50 p-2 gap-2 overflow-hidden">
      
      {/* 1. BARRA SUPERIOR DE CONTROL */}
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        
        {/* Selector "Fecha a disponibilizar" */}
        <div className="flex items-center gap-2">
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

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500">
            <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-lg text-[11px]">
              {filteredAssignments.length} servicios
            </span>
            <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-lg text-[11px]">
              {totalLocales} locales
            </span>
            <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-lg text-[11px]">
              {totalM3} m³
            </span>
          </div>
        </div>

        {/* Filtros rápidos + Botón Guardar Disponibilización */}
        <div className="flex items-center gap-1.5 flex-wrap">
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

          {/* Filtro Asignación (Requisito 3: dice 'Asignación' en lugar de 'Todos') */}
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

          <Button 
            onClick={handlePreSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-7.5 px-3 flex items-center gap-1.5 shadow-sm rounded-xl"
            title="Guarda la disponibilización y valida si faltan asignaciones"
          >
            <Save size={13} />
            Guardar Disponibilización
          </Button>

          <Button 
            variant="outline" 
            onClick={() => navigate('/ruteo')}
            className="text-xs h-7.5 px-2 text-slate-600 hover:text-blue-700 flex items-center gap-1 rounded-xl"
          >
            <Layers size={13} />
            Ruteo
          </Button>
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
              className="bg-white/10 hover:bg-red-500/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-colors"
              title="Limpiar todas las asignaciones"
            >
              <Trash2 size={12} />
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
            {/* Filtro por condición de asistencia (Requisito 2) */}
            <select
              value={staffAttendanceFilter}
              onChange={e => setStaffAttendanceFilter(e.target.value)}
              className="w-full text-[9px] font-bold border border-slate-200 rounded p-1 bg-slate-50 text-slate-700 focus:outline-none"
              title="Filtrar por condición de asistencia"
            >
              <option value="todos">Todos los trabajadores</option>
              <option value="disponibles">Solo disponibles / aptos</option>
              <option value="novedades">Con novedades (Vac/Lic/Aus)</option>
            </select>
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-slate-400 font-mono">
                          {staff.rut || 'S/RUT'}
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
                    <th className="px-2.5 py-2">Fecha</th>
                    
                    {/* N° de vuelta al lado de Fecha, vacía inicialmente con lista 1 al 8 */}
                    <th className="px-2.5 py-2 text-center bg-amber-50/70 text-amber-900 border-x border-amber-200">
                      N° de vuelta
                    </th>

                    {/* N° de Ruta al lado de N° de vuelta */}
                    <th className="px-2.5 py-2 font-black text-slate-800 bg-slate-200/60 border-r border-slate-300">
                      N° de Ruta
                    </th>

                    <th className="px-2.5 py-2 text-blue-700 bg-blue-50/50">Conductor</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar 2</th>
                    <th className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50">Camión</th>
                    <th className="px-2.5 py-2 text-teal-700 bg-teal-50/40">Rampla</th>
                    <th className="px-2.5 py-2">Tipo de servicio</th>
                    <th className="px-2.5 py-2">Cliente</th>
                    <th className="px-2.5 py-2">Referencia</th>
                    <th className="px-2.5 py-2 text-center">Cantidad de Locales</th>
                    <th className="px-2.5 py-2 text-right">Metros cúbicos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAssignments.map((row) => {
                    const isSelected = selectedRowIds.includes(row.id);
                    return (
                      <tr 
                        key={row.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnRow(e, row.id)}
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

                        {/* 1. Fecha */}
                        <td className="px-2.5 py-2 font-semibold text-slate-600">{row.fecha}</td>

                        {/* 2. N° de vuelta (Ubicada al lado de Fecha, vacía inicialmente, lista 1 al 8) */}
                        <td className="px-2 py-2 text-center bg-amber-50/30 border-x border-amber-100">
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
                          </div>

                          {/* Comentario flotante con Destino, Dirección y Comuna (Permite interactuar y hacer scroll) */}
                          <div className="hidden group-hover/route:block hover:block absolute left-full top-0 pl-1.5 z-50">
                            <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-3 border border-slate-700 min-w-[300px] max-w-[400px] pointer-events-auto animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <MapPin size={13} className="text-red-400 shrink-0" />
                                  <span className="font-bold text-xs text-white">Ruta {row.ruta}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">{row.cliente}</span>
                              </div>

                              {row.paradas && row.paradas.length > 0 ? (
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1.5">
                                  {row.paradas.map((p, pIdx) => (
                                    <div key={p.id || pIdx} className="text-[11px] pb-1.5 border-b border-slate-800 last:border-0 last:pb-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-bold text-slate-100 truncate">
                                          {p.secuencia ? `${p.secuencia}. ` : ''}{p.destino}
                                        </span>
                                        {p.ambiente && (
                                          <span className={`px-1 py-0.2 rounded text-[9px] font-black shrink-0 ${
                                            p.ambiente === 'C' ? 'bg-sky-900 text-sky-200' :
                                            p.ambiente === 'R' ? 'bg-amber-900 text-amber-200' : 'bg-emerald-900 text-emerald-200'
                                          }`}>
                                            {p.ambiente}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-300 mt-0.5">
                                        <span className="text-slate-400">Dir: </span>{p.direccion || 'Sin dirección'}
                                      </div>
                                      <div className="text-[10px] text-slate-300">
                                        <span className="text-slate-400">Comuna: </span>
                                        <strong className="text-blue-300">{p.comuna || 'Sin comuna'}</strong>
                                      </div>
                                    </div>
                                  ))}
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
                          className="px-2.5 py-2 font-bold text-slate-800 max-w-[130px] truncate bg-blue-50/20"
                          title={row.conductor_name}
                          onDrop={(e) => handleDropOnRow(e, row.id, 'conductor')}
                        >
                          {row.conductor_name ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate">{row.conductor_name}</span>
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
                          className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20"
                          title={row.aux1_name}
                          onDrop={(e) => handleDropOnRow(e, row.id, 'auxiliar')}
                        >
                          {row.aux1_name ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="truncate font-medium">{row.aux1_name}</span>
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
                          className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20"
                          title={row.aux2_name}
                          onDrop={(e) => handleDropOnRow(e, row.id, 'auxiliar2')}
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
                          className="px-2.5 py-2 font-bold text-slate-800 bg-emerald-50/20 relative group/truck"
                          onDrop={(e) => handleDropOnRow(e, row.id, 'camion')}
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
                          className="px-2.5 py-2 bg-teal-50/20"
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

                        {/* 10. Tipo de servicio */}
                        <td className="px-2.5 py-2">
                          <select
                            value={row.tipo_servicio || 'Centralizado'}
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'tipo_servicio', e.target.value)}
                            className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${
                              SERVICE_COLORS[row.tipo_servicio] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <option value="Centralizado">Centralizado</option>
                            <option value="Distribución">Distribución</option>
                            <option value="Carga Consolidada">Carga Consolidada</option>
                            <option value="Carretera">Carretera</option>
                            <option value="CDKL">CDKL</option>
                            <option value="Servicios distribución">Servicios distribución</option>
                            <option value="Servicio especial">Servicio especial</option>
                          </select>
                        </td>

                        {/* 11. Cliente */}
                        <td className="px-2.5 py-2 font-medium text-slate-700 max-w-[150px] truncate" title={row.cliente}>
                          {row.cliente}
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
                      </tr>
                    );
                  })}

                  {filteredAssignments.length === 0 && (
                    <tr>
                      <td colSpan="14" className="px-4 py-12 text-center text-slate-500">
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
              const isFocused = focusedEntity?.type === 'truck' && (
                focusedEntity.identifier === truck.identifier ||
                focusedEntity.identifier === truck.plate ||
                (focusedEntity.plate && (focusedEntity.plate === truck.plate || truck.identifier.includes(focusedEntity.plate)))
              );
              
              // Color de la tarjeta de acuerdo al estado documental (Requisito 1: colores solo en las etiquetas)
              let cardBgClass = 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50';
              if (isFocused) {
                cardBgClass = 'bg-emerald-100/90 border-emerald-500 ring-2 ring-emerald-500 shadow-sm';
              } else if (isSelected) {
                cardBgClass = 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300 shadow-xs';
              }

              return (
                <div 
                  key={truck.id} 
                  draggable
                  onDragStart={(e) => handleDragStartTruck(e, truck, isSemirremolque)}
                  onClick={() => {
                    setSelectedTruckObject(isSelected ? null : truck);
                    if (truck.viajes > 0) {
                      handleToggleFocusTruck(truck);
                    }
                  }}
                  className={`p-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none ${cardBgClass}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1">
                      <div className="bg-slate-800 text-white text-[10px] font-black px-1.5 py-0.2 rounded tracking-wider">
                        {truck.internal_number || truck.plate}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {truck.plate}
                      </span>
                    </div>
                    {/* Badge de viajes basado en vueltas distintas - clickeable para filtrar (Requisito 4) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
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

                  <div className="text-[9px] text-slate-500 truncate">
                    {truck.brand || 'Equipo'} • {truck.type || 'General'}
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
                          if (isSemirremolque) {
                            handleAssignRampla(truck);
                          } else {
                            handleAssignTruck(truck);
                          }
                        }}
                        className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded shadow-xs ${
                          isSemirremolque ? 'bg-teal-600 hover:bg-teal-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        {isSemirremolque ? '+ Rampla' : '+ Camión'} ({selectedRowIds.length})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* POP-UP MODAL DE ADVERTENCIA AL GUARDAR */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-800">
                  ¿Está seguro que desea guardar esta información?
                </h3>
                <p className="text-xs text-slate-500">
                  Existen {incompleteRoutesList.length} servicio(s) sin Conductor y/o Camión asignado.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 my-4 max-h-48 overflow-y-auto space-y-1.5">
              {incompleteRoutesList.map(r => (
                <div key={r.id} className="text-xs flex items-center justify-between text-slate-700 bg-white p-2 rounded border border-slate-100">
                  <span className="font-bold">Ruta {r.ruta} - {r.cliente}</span>
                  <span className="text-[10px] text-amber-700 font-semibold">
                    {[!r.conductor_name && 'Sin Chofer', !r.camion && 'Sin Camión'].filter(Boolean).join(' / ')}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                onClick={executeSave}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
              >
                Sí, Guardar de todas formas
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

    </div>
  );
}
