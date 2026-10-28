import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Droplets, UploadCloud, Search, Calendar, FileSpreadsheet, 
  CheckCircle2, AlertCircle, Edit2, Trash2, X, Download, 
  Check, Filter, ArrowRight, ShieldCheck, Sparkles, RefreshCw,
  Truck, ChevronDown, Building2, Layers, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { Button } from './ui/Button';
import { matchVehicleByCode, normalizeVehicleCode } from '../lib/vehicleMatcher';
import { downloadFleetWashesCertTemplate, downloadFleetWashesRecordsTemplate } from '../lib/excelTemplates';

// Helpers para normalizar texto
const normalizeText = (txt) => {
  return String(txt || '').toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[._\-/\s]/g, "");
};

// Formateador robusto de fechas de Excel
export const parseExcelDateValue = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const isUtcMidnight = val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0;
    const y = isUtcMidnight ? val.getUTCFullYear() : val.getFullYear();
    const m = String((isUtcMidnight ? val.getUTCMonth() : val.getMonth()) + 1).padStart(2, '0');
    const d = String(isUtcMidnight ? val.getUTCDate() : val.getDate()).padStart(2, '0');
    const hh = String(isUtcMidnight ? val.getUTCHours() : val.getHours()).padStart(2, '0');
    const mm = String(isUtcMidnight ? val.getUTCMinutes() : val.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}${hh !== '00' || mm !== '00' ? ` ${hh}:${mm}` : ''}`;
  }
  if (typeof val === 'number') {
    const dObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(dObj.getTime())) return null;
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    const hh = String(dObj.getUTCHours()).padStart(2, '0');
    const mm = String(dObj.getUTCMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}${hh !== '00' || mm !== '00' ? ` ${hh}:${mm}` : ''}`;
  }
  const str = String(val).trim();
  if (!str) return null;

  // DD/MM/YYYY o DD-MM-YYYY (con detección inteligente para evitar invertir día/mes)
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?))?/);
  if (dmyMatch) {
    let part1 = parseInt(dmyMatch[1], 10);
    let part2 = parseInt(dmyMatch[2], 10);
    let y = dmyMatch[3];
    let d, m;
    
    // Si la segunda parte es > 12 y la primera <= 12, viene como MM/DD/YYYY
    if (part2 > 12 && part1 <= 12) {
      m = String(part1).padStart(2, '0');
      d = String(part2).padStart(2, '0');
    } else {
      // Estándar chileno / internacional: DD/MM/YYYY
      d = String(part1).padStart(2, '0');
      m = String(part2).padStart(2, '0');
    }
    const time = dmyMatch[4] ? ` ${dmyMatch[4]}` : '';
    return `${d}/${m}/${y}${time}`;
  }

  // YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?))?/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    const time = ymdMatch[4] ? ` ${ymdMatch[4]}` : '';
    return `${d}/${m}/${y}${time}`;
  }

  return null;
};

// Helper para validar si un string es una fecha válida
export const isValidDateString = (val) => {
  if (!val) return false;
  return parseExcelDateValue(val) !== null;
};

// Helper para obtener la fecha de certificación válida de un camión (buscando en carnes_date o rt_date como fallback)
export const getTruckCertDate = (truck) => {
  if (!truck) return null;
  // 1. Si tiene ultima_certificacion y es una fecha válida
  if (truck.ultima_certificacion && isValidDateString(truck.ultima_certificacion)) {
    return extractDateOnly(truck.ultima_certificacion);
  }
  // 2. Fallback a carnes_date (Resolución Sanitaria / Carnes) si es fecha válida
  if (truck.carnes_date && isValidDateString(truck.carnes_date)) {
    return extractDateOnly(truck.carnes_date);
  }
  // 3. Fallback a rt_date (Revisión Técnica) si es fecha válida
  if (truck.rt_date && isValidDateString(truck.rt_date)) {
    return extractDateOnly(truck.rt_date);
  }
  return null;
};

// Extraer únicamente la parte de fecha DD/MM/YYYY para agrupar y filtrar
export const extractDateOnly = (val) => {
  if (!val) return '';
  const parsed = parseExcelDateValue(val);
  if (!parsed) return '';
  return parsed.split(' ')[0];
};

// Helper para convertir string de fecha a timestamp numérico para comparar rangos (Requisito 4)
export const parseDateStrToTime = (s) => {
  if (!s) return null;
  const clean = String(s).trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
    } else {
      // DD-MM-YYYY o DD/MM/YYYY
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
    }
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d.getTime();
};

// Componente de multi-selección de camiones con búsqueda y checkboxes (Requisito 2)
function TruckMultiSelect({ truckOptions, selectedTrucks, onChange }) {
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

  const filtered = useMemo(() => {
    if (!searchTerm) return truckOptions;
    const lower = searchTerm.toLowerCase();
    return truckOptions.filter(o => 
      o.label.toLowerCase().includes(lower) || 
      o.internal.toLowerCase().includes(lower) || 
      o.plate.toLowerCase().includes(lower)
    );
  }, [truckOptions, searchTerm]);

  const toggleOption = (val) => {
    if (selectedTrucks.includes(val)) {
      onChange(selectedTrucks.filter(v => v !== val));
    } else {
      onChange([...selectedTrucks, val]);
    }
  };

  const buttonText = useMemo(() => {
    if (selectedTrucks.length === 0) return 'Camiones: Todos';
    if (selectedTrucks.length === 1) {
      const found = truckOptions.find(o => o.value === selectedTrucks[0]);
      return `Camión: ${found ? found.label : selectedTrucks[0]}`;
    }
    return `Camiones: ${selectedTrucks.length} sel.`;
  }, [selectedTrucks, truckOptions]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition-all text-left h-9 ${
          selectedTrucks.length > 0 
            ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold shadow-2xs' 
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Truck size={14} className={selectedTrucks.length > 0 ? "text-emerald-700 shrink-0" : "text-slate-400 shrink-0"} />
          <span className="truncate max-w-[130px]">{buttonText}</span>
        </div>
        <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2.5 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 text-xs">
            <span className="font-bold text-slate-800">Filtrar por Camión</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => onChange(truckOptions.map(o => o.value))}
                className="text-emerald-600 hover:text-emerald-800 font-semibold"
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

          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={12} />
            <input
              type="text"
              placeholder="Buscar camión o patente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            />
          </div>

          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {filtered.map(opt => {
              const isChecked = selectedTrucks.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                    isChecked ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt.value)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
                    />
                    <span className="truncate">{opt.label}</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-normal shrink-0">{opt.type}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-3">No hay coincidencias</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function FleetWashes() {
  const { fleetList, fetchFleet, updateFleetWashes, updateSingleFleetWash, isLoading } = useFleetStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [certFilter, setCertFilter] = useState('Todos');
  const [selectedTrucks, setSelectedTrucks] = useState([]); // Multi-selección de camiones (Requisito 2)
  const [fleetTab, setFleetTab] = useState('propia'); // 'propia' | 'externa' | 'todas' (Requisito 2)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' }); // Ordenamiento de columnas (Requisito 1)

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: null, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // Conteo de flota propia y externa
  const propiaCount = useMemo(() => {
    return fleetList.filter(f => !isVehicleExternal(f)).length;
  }, [fleetList]);

  const externaCount = useMemo(() => {
    return fleetList.filter(f => isVehicleExternal(f)).length;
  }, [fleetList]);

  // Regiones únicas de flota (Requisito 3)
  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  // Opciones únicas de camiones para el multi-select (Requisito 2)
  const truckOptions = useMemo(() => {
    return fleetList
      .filter(f => {
        if (fleetTab === 'propia' && isVehicleExternal(f)) return false;
        if (fleetTab === 'externa' && !isVehicleExternal(f)) return false;
        return true;
      })
      .map(f => {
        const internal = (f.internal_number || '').trim();
        const plate = (f.plate || '').trim();
        const label = internal && plate ? `${internal} (${plate})` : internal || plate;
        return {
          value: internal || plate,
          internal,
          plate,
          label,
          type: f.type || 'Camión'
        };
      })
      .filter(opt => opt.value)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [fleetList, fleetTab]);

  // ------------------------------------------------------------------
  // 1. ESTADO: CARGA EXCEL 1 - CERTIFICACIONES (con selector de hoja)
  // ------------------------------------------------------------------
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certWorkbook, setCertWorkbook] = useState(null);
  const [certSheets, setCertSheets] = useState([]);
  const [selectedCertSheet, setSelectedCertSheet] = useState('');
  const [certColumns, setCertColumns] = useState([]);
  const [certInternalCol, setCertInternalCol] = useState('');
  const [certDateCol, setCertDateCol] = useState('');
  const [certRawRows, setCertRawRows] = useState([]);

  // ------------------------------------------------------------------
  // 2. ESTADO: CARGA EXCEL / CSV 2 - LAVADOS (Código de camión vs N° Interno)
  // ------------------------------------------------------------------
  const [isWashModalOpen, setIsWashModalOpen] = useState(false);
  const [washWorkbook, setWashWorkbook] = useState(null);
  const [washSheets, setWashSheets] = useState([]);
  const [selectedWashSheet, setSelectedWashSheet] = useState('');
  const [washColumns, setWashColumns] = useState([]);
  const [washCodeCol, setWashCodeCol] = useState('');
  const [washCreadoCol, setWashCreadoCol] = useState('');
  const [washPlateCol, setWashPlateCol] = useState('');
  const [washRawRows, setWashRawRows] = useState([]);

  // Opciones para seleccionar qué fecha o rango de "Creado" se desea cargar (Requisito 4)
  const [washDateFilterMode, setWashDateFilterMode] = useState('todas'); // 'todas', 'rango', 'especifica'
  const [selectedCreadoDate, setSelectedCreadoDate] = useState('todas');
  const [washDateRangeStart, setWashDateRangeStart] = useState('');
  const [washDateRangeEnd, setWashDateRangeEnd] = useState('');

  // Pantalla de registros no coincidentes para editar o eliminar (Requisito 2)
  const [isUnmatchedModalOpen, setIsUnmatchedModalOpen] = useState(false);
  const [unmatchedRows, setUnmatchedRows] = useState([]); // Array de items no coincidentes editables
  const [matchedWashUpdates, setMatchedWashUpdates] = useState([]); // Array de items que sí coincidieron

  // Fechas únicas disponibles en la columna "Creado" (orden descendente: más recientes primero)
  const availableCreadoDates = useMemo(() => {
    if (!washCreadoCol || washRawRows.length === 0) return [];
    const dateCounts = {};
    washRawRows.forEach(row => {
      const d = extractDateOnly(row[washCreadoCol]);
      if (d) {
        dateCounts[d] = (dateCounts[d] || 0) + 1;
      }
    });

    return Object.entries(dateCounts).map(([date, count]) => ({
      date,
      count,
      timestamp: parseDateStrToTime(date) || 0
    })).sort((a, b) => b.timestamp - a.timestamp);
  }, [washCreadoCol, washRawRows]);

  // Fechas ordenadas agrupadas por Mes y Año (desde el mes más reciente hacia atrás, y dentro de cada mes en orden cronológico) (Requisito 1)
  const groupedCreadoDates = useMemo(() => {
    if (availableCreadoDates.length === 0) return [];
    const groups = {};
    availableCreadoDates.forEach(item => {
      const parts = item.date.split(/[-/]/);
      let year = 2026;
      let month = 0;
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
        } else {
          year = parseInt(parts[2], 10);
          month = parseInt(parts[1], 10) - 1;
        }
      }
      const groupKey = `${year}-${String(month).padStart(2, '0')}`;
      const groupLabel = `${MONTH_NAMES[month] || 'Mes ' + (month + 1)} ${year}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          label: groupLabel,
          year,
          month,
          items: []
        };
      }
      groups[groupKey].items.push(item);
    });

    const sortedGroups = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    sortedGroups.forEach(g => {
      g.items.sort((a, b) => a.timestamp - b.timestamp);
    });
    return sortedGroups;
  }, [availableCreadoDates]);

  // Fechas ordenadas cronológicamente (más antigua primero) para selectores de rango
  const chronologicalCreadoDates = useMemo(() => {
    return [...availableCreadoDates].sort((a, b) => a.timestamp - b.timestamp);
  }, [availableCreadoDates]);

  // Función para determinar si una fila de lavado cumple con el filtro de fecha
  const isRowMatchingDateFilter = (row) => {
    if (!washCreadoCol) return true;
    if (washDateFilterMode === 'todas') return true;

    const rawVal = row[washCreadoCol];
    const d = extractDateOnly(rawVal);
    if (!d) return false;

    if (washDateFilterMode === 'especifica') {
      return d === selectedCreadoDate;
    }

    if (washDateFilterMode === 'rango') {
      const rowTime = parseDateStrToTime(d);
      if (rowTime === null) return false;
      const startTime = washDateRangeStart ? parseDateStrToTime(washDateRangeStart) : null;
      const endTime = washDateRangeEnd ? parseDateStrToTime(washDateRangeEnd) : null;

      if (startTime !== null && rowTime < startTime) return false;
      if (endTime !== null && rowTime > endTime) return false;
      return true;
    }

    return true;
  };

  // Cantidad de registros filtrados según el modo y fechas seleccionadas
  const filteredWashRowsCount = useMemo(() => {
    if (!washCreadoCol || washRawRows.length === 0) return 0;
    return washRawRows.filter(isRowMatchingDateFilter).length;
  }, [washRawRows, washCreadoCol, washDateFilterMode, selectedCreadoDate, washDateRangeStart, washDateRangeEnd]);

  // Estado para Edición Manual Individual
  const [editingTruck, setEditingTruck] = useState(null);
  const [editForm, setEditForm] = useState({ ultima_certificacion: '', fecha_ultimo_lavado: '' });

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Lista de N° Internos existentes en flota (para selectores de vinculación rápida)
  const fleetInternalsList = useMemo(() => {
    return fleetList
      .filter(f => f.internal_number)
      .map(f => ({
        internal: String(f.internal_number).trim(),
        plate: f.plate,
        type: f.type
      }))
      .sort((a, b) => a.internal.localeCompare(b.internal));
  }, [fleetList]);

  // Filtrado de la tabla principal de Lavados
  const filteredFleet = useMemo(() => {
    return fleetList.filter(f => {
      // 1. Filtrado por Pestaña de Flota (Propia vs Externa vs Todas) (Requisito 2)
      const isExternal = isVehicleExternal(f);
      if (fleetTab === 'propia' && isExternal) return false;
      if (fleetTab === 'externa' && !isExternal) return false;

      // Filtro multi-selección de camiones (Requisito 2)
      if (selectedTrucks.length > 0) {
        const matchesTruck = selectedTrucks.some(val => 
          val === f.internal_number || 
          val === f.plate || 
          val === `${f.internal_number} (${f.plate})` ||
          (f.internal_number && val.includes(f.internal_number)) ||
          (f.plate && val.includes(f.plate))
        );
        if (!matchesTruck) return false;
      }

      if (typeFilter !== 'Todos') {
        const t = (f.type || '').toLowerCase();
        if (typeFilter === 'Camiones' && (t.includes('tracto') || t.includes('rampla') || t.includes('semi'))) return false;
        if (typeFilter === 'Tractos' && !t.includes('tracto')) return false;
        if (typeFilter === 'Semirremolques' && (!t.includes('rampla') && !t.includes('semi'))) return false;
      }

      // Filtro por Región (Requisito 3)
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;

      const certDate = getTruckCertDate(f);
      if (certFilter === 'con_cert' && !certDate) return false;
      if (certFilter === 'sin_cert' && certDate) return false;
      if (certFilter === 'con_lavado' && !f.fecha_ultimo_lavado) return false;
      if (certFilter === 'sin_lavado' && f.fecha_ultimo_lavado) return false;

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const mInternal = f.internal_number?.toLowerCase().includes(lower);
        const mPlate = f.plate?.toLowerCase().includes(lower);
        const mBrand = f.brand?.toLowerCase().includes(lower);
        const mRegion = f.region?.toLowerCase().includes(lower);
        const mEmpresa = f.empresa_externa?.toLowerCase().includes(lower);
        if (!mInternal && !mPlate && !mBrand && !mRegion && !mEmpresa) return false;
      }

      return true;
    });
  }, [fleetList, fleetTab, typeFilter, regionFilter, certFilter, searchTerm, selectedTrucks]);

  // Ordenamiento de columnas (Requisito 1)
  const sortedFleet = useMemo(() => {
    if (!sortConfig.key) return filteredFleet;
    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    return [...filteredFleet].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      const emptyA = valA === null || valA === undefined || String(valA).trim() === '';
      const emptyB = valB === null || valB === undefined || String(valB).trim() === '';
      if (emptyA && emptyB) return 0;
      if (emptyA) return 1;
      if (emptyB) return -1;

      // Si es una fecha (como ultima_certificacion o fecha_ultimo_lavado)
      if (key === 'ultima_certificacion') {
        const timeA = parseDateStrToTime(getTruckCertDate(a)) || 0;
        const timeB = parseDateStrToTime(getTruckCertDate(b)) || 0;
        return (timeA - timeB) * factor;
      }
      if (key === 'fecha_ultimo_lavado') {
        const timeA = parseDateStrToTime(valA) || 0;
        const timeB = parseDateStrToTime(valB) || 0;
        return (timeA - timeB) * factor;
      }

      // Numérico
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
        return (numA - numB) * factor;
      }

      // Alfanumérico natural (ej: N° Interno)
      return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [filteredFleet, sortConfig]);

  // ------------------------------------------------------------------
  // MANEJADORES: CARGA 1 - CERTIFICACIONES
  // ------------------------------------------------------------------
  const onDropCertExcel = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        const sheets = workbook.SheetNames || [];
        if (sheets.length === 0) {
          toast.error('El archivo no contiene hojas');
          return;
        }

        setCertWorkbook(workbook);
        setCertSheets(sheets);
        const initialSheet = sheets[0];
        setSelectedCertSheet(initialSheet);
        processCertSheet(workbook, initialSheet);
        toast.success(`Archivo leído: ${sheets.length} hoja(s) encontradas. Por favor selecciona la hoja a consultar.`);
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar archivo de certificación');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processCertSheet = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (json.length === 0) {
      setCertColumns([]);
      setCertRawRows([]);
      toast.warning('La hoja seleccionada está vacía');
      return;
    }

    const cols = Object.keys(json[0] || {});
    setCertColumns(cols);
    setCertRawRows(json);

    // Auto-detectar "N° Interno"
    const detectedInternal = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('interno') || n === 'codigocamion' || n === 'codigo' || n === 'unidad';
    }) || cols[0] || '';
    setCertInternalCol(detectedInternal);

    // Auto-detectar lo que tenga por nombre "Ultima certificación" (Requisito 2)
    const detectedCert = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('ultimacertificacion') || n.includes('certificacion') || n.includes('fechacertificacion');
    }) || cols.find(c => normalizeText(c).includes('cert')) || cols[1] || '';
    setCertDateCol(detectedCert);
  };

  const handleCertSheetChange = (sheetName) => {
    setSelectedCertSheet(sheetName);
    if (certWorkbook) {
      processCertSheet(certWorkbook, sheetName);
    }
  };

  // Previsualización y conteo de certificaciones
  const certPreviewUpdates = useMemo(() => {
    if (!certInternalCol || !certDateCol || certRawRows.length === 0) return [];

    return certRawRows.map((row, idx) => {
      const internalVal = String(row[certInternalCol] || '').trim();
      const rawDateVal = row[certDateCol];
      const parsedDate = parseExcelDateValue(rawDateVal);

      const matchedFleet = matchVehicleByCode(internalVal, '', fleetList);

      return {
        rowIdx: idx + 1,
        internal_number: internalVal,
        matchedFleet,
        newCertDate: parsedDate,
        isMatched: !!matchedFleet && !!internalVal && !!parsedDate
      };
    });
  }, [certInternalCol, certDateCol, certRawRows, fleetList]);

  const certMatchedCount = useMemo(() => {
    return certPreviewUpdates.filter(u => u.isMatched).length;
  }, [certPreviewUpdates]);

  const handleApplyCertifications = async () => {
    const validUpdates = certPreviewUpdates
      .filter(u => u.isMatched)
      .map(u => ({
        internal_number: u.matchedFleet?.internal_number || u.internal_number,
        plate: u.matchedFleet?.plate,
        ultima_certificacion: u.newCertDate
      }));

    if (validUpdates.length === 0) {
      toast.warning('No se encontraron coincidencias para aplicar certificaciones');
      return;
    }

    const success = await updateFleetWashes(validUpdates);
    if (success) {
      toast.success(`Se actualizaron ${validUpdates.length} certificaciones exitosamente`);
      setIsCertModalOpen(false);
      setCertWorkbook(null);
      setCertRawRows([]);
    }
  };

  // ------------------------------------------------------------------
  // MANEJADORES: CARGA 2 - LAVADOS (Excel o CSV)
  // ------------------------------------------------------------------
  const onDropWashExcel = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Resetear filtros de fecha de Creado
    setWashDateFilterMode('todas');
    setSelectedCreadoDate('todas');
    setWashDateRangeStart('');
    setWashDateRangeEnd('');

    const fileName = (file.name || '').toLowerCase();
    const isCsv = fileName.endsWith('.csv') || (file.type && file.type.includes('csv'));

    try {
      let workbook;
      if (isCsv) {
        // Lectura robusta de archivo CSV (Requisito 1)
        const text = await file.text();
        const firstLine = text.split(/\r?\n/)[0] || '';
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;

        let delimiter = ',';
        if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
        else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

        workbook = XLSX.read(text, { type: 'string', FS: delimiter, cellDates: false, raw: true });
      } else {
        const buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
      }

      const sheets = workbook.SheetNames || [];
      if (sheets.length === 0) {
        toast.error('El archivo no contiene hojas ni registros legibles');
        return;
      }

      setWashWorkbook(workbook);
      setWashSheets(sheets);
      const initialSheet = sheets[0];
      setSelectedWashSheet(initialSheet);
      processWashSheet(workbook, initialSheet);
      toast.success(isCsv ? 'Archivo CSV de lavados cargado correctamente' : 'Archivo Excel de lavados cargado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar archivo de lavados');
    }
  };

  const processWashSheet = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (json.length === 0) {
      setWashColumns([]);
      setWashRawRows([]);
      toast.warning('La hoja de lavados está vacía');
      return;
    }

    const cols = Object.keys(json[0] || {});
    setWashColumns(cols);
    setWashRawRows(json);
    setWashDateFilterMode('todas');
    setSelectedCreadoDate('todas');
    setWashDateRangeStart('');
    setWashDateRangeEnd('');

    // Auto-detectar "Código de camión" (según imagen del usuario)
    const detectedCode = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('codigodecamion') || n.includes('codigocamion') || n.includes('codigo') || n.includes('interno');
    }) || cols[2] || cols[0];
    setWashCodeCol(detectedCode);

    // Auto-detectar "Creado" (según imagen del usuario para "Fecha Último Lavado")
    const detectedCreado = cols.find(c => {
      const n = normalizeText(c);
      return n === 'creado' || n.includes('creado') || n.includes('fechalavado');
    }) || cols[0];
    setWashCreadoCol(detectedCreado);

    // Auto-detectar "Patente de camión"
    const detectedPlate = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('patente') || n.includes('placa');
    }) || cols[3] || '';
    setWashPlateCol(detectedPlate);
  };

  const handleWashSheetChange = (sheetName) => {
    setSelectedWashSheet(sheetName);
    if (washWorkbook) {
      processWashSheet(washWorkbook, sheetName);
    }
  };

  // Procesar cruce de Código de camión con N° Interno
  const handleAnalyzeWashRecords = () => {
    if (!washCodeCol || !washCreadoCol || washRawRows.length === 0) {
      toast.warning('Por favor selecciona las columnas de Código de Camión y Creado');
      return;
    }

    // Filtrar por la fecha o rango de Creado seleccionado por el usuario (Requisito 4)
    const rowsToProcess = washRawRows.filter(isRowMatchingDateFilter);

    if (rowsToProcess.length === 0) {
      toast.warning('No hay registros en el archivo que coincidan con el filtro de fecha seleccionado');
      return;
    }

    const matched = [];
    const unmatched = [];

    // Agrupar por código de camión para conservar la fecha de Creado más reciente
    rowsToProcess.forEach((row, idx) => {
      const rawCode = String(row[washCodeCol] || '').trim();
      const rawCreado = row[washCreadoCol];
      const parsedCreado = parseExcelDateValue(rawCreado);
      const rawPlate = washPlateCol ? String(row[washPlateCol] || '').trim() : '';
      const rawServicio = row['Servicio'] || row['servicio'] || 'Lavado';

      if (!rawCode && !rawPlate) return;

      // Buscar relación con N° Interno de flota (o por Patente como alternativa)
      // Soporta formatos flexibles: C200, C-200, C 200, c200, C.200, etc.
      const foundVehicle = matchVehicleByCode(rawCode, rawPlate, fleetList);

      const itemData = {
        id: `wash-${idx}`,
        originalIndex: idx + 1,
        truckCode: rawCode,
        plate: rawPlate,
        creadoDate: parsedCreado,
        rawCreado: String(rawCreado),
        servicio: rawServicio,
        matchedVehicle: foundVehicle || null
      };

      if (foundVehicle) {
        matched.push(itemData);
      } else {
        unmatched.push(itemData);
      }
    });

    setMatchedWashUpdates(matched);

    if (unmatched.length > 0) {
      // Requisito 2: "si no encuentras relación necesito que despliegues una pantalla en donde pueda editar o eliminar información"
      setUnmatchedRows(unmatched);
      setIsUnmatchedModalOpen(true);
      toast.info(`Se detectaron ${unmatched.length} registros sin coincidencia en Flota para revisar`);
    } else {
      // Si todos coincidieron directamente
      applyFinalWashUpdates(matched);
    }
  };

  // Guardar cambios en registros no coincidentes (editar código / vincular a vehículo existente)
  const handleUpdateUnmatchedCode = (itemId, newCode) => {
    setUnmatchedRows(prev => prev.map(item => {
      if (item.id === itemId) {
        const found = matchVehicleByCode(newCode, item.plate, fleetList);
        return {
          ...item,
          truckCode: newCode,
          matchedVehicle: found || null
        };
      }
      return item;
    }));
  };

  // Eliminar registro no coincidente (Requisito 2)
  const handleDeleteUnmatchedRow = (itemId) => {
    setUnmatchedRows(prev => prev.filter(item => item.id !== itemId));
    toast.info('Registro descartado');
  };

  // Confirmar y aplicar lavados finales tras resolver o eliminar discrepancias
  const handleConfirmUnmatchedAndApply = () => {
    // Unir los que ya coincidían con los que el usuario corrigió y ahora sí coinciden
    const resolvedFromUnmatched = unmatchedRows.filter(u => u.matchedVehicle && u.creadoDate);
    const allValid = [...matchedWashUpdates, ...resolvedFromUnmatched];

    if (allValid.length === 0) {
      toast.warning('No hay registros válidos con coincidencia para aplicar');
      return;
    }

    applyFinalWashUpdates(allValid);
    setIsUnmatchedModalOpen(false);
  };

  const applyFinalWashUpdates = async (validItems) => {
    // Agrupar por vehículo para registrar la fecha más reciente de "Creado"
    const finalMap = {};

    validItems.forEach(item => {
      const internalKey = String(item.matchedVehicle.internal_number || item.matchedVehicle.plate).trim();
      // Guardar fecha de Creado en la columna "Fecha Último Lavado" (Requisito 2)
      finalMap[internalKey] = {
        internal_number: item.matchedVehicle.internal_number,
        plate: item.matchedVehicle.plate,
        fecha_ultimo_lavado: item.creadoDate
      };
    });

    const updatesArray = Object.values(finalMap);
    const success = await updateFleetWashes(updatesArray);

    if (success) {
      toast.success(`¡Fecha Último Lavado actualizada para ${updatesArray.length} vehículo(s)!`);
      setIsWashModalOpen(false);
      setWashWorkbook(null);
      setWashRawRows([]);
      setMatchedWashUpdates([]);
      setUnmatchedRows([]);
    }
  };

  // ------------------------------------------------------------------
  // EDICIÓN MANUAL INDIVIDUAL
  // ------------------------------------------------------------------
  const handleStartManualEdit = (truck) => {
    setEditingTruck(truck);
    setEditForm({
      ultima_certificacion: truck.ultima_certificacion || '',
      fecha_ultimo_lavado: truck.fecha_ultimo_lavado || ''
    });
  };

  const handleSaveManualEdit = async () => {
    if (!editingTruck) return;
    const key = editingTruck.internal_number || editingTruck.id;
    await updateSingleFleetWash(key, {
      ultima_certificacion: editForm.ultima_certificacion || null,
      fecha_ultimo_lavado: editForm.fecha_ultimo_lavado || null
    });
    setEditingTruck(null);
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const dataToExport = sortedFleet.map(f => ({
      'Tipo de Flota': isVehicleExternal(f) ? 'Externa' : 'Propia',
      ...(isVehicleExternal(f) ? { 'Empresa Externa': f.empresa_externa || '' } : {}),
      'N° Interno': f.internal_number || '',
      'Patente': f.plate || '',
      'Tipo': f.type || '',
      'Marca': f.brand || '',
      'Región': f.region || 'Sin asignar',
      'Ultima certificación': f.ultima_certificacion || 'Sin registro',
      'Fecha Último Lavado': f.fecha_ultimo_lavado || 'Sin registro'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lavados y Certificaciones');
    XLSX.writeFile(wb, `Flota_Lavados_Certificaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel exportado correctamente');
  };

  const { getRootProps: getCertRoot, getInputProps: getCertInput, isDragActive: isCertDrag } = useDropzone({
    onDrop: onDropCertExcel,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1
  });

  const { getRootProps: getWashRoot, getInputProps: getWashInput, isDragActive: isWashDrag } = useDropzone({
    onDrop: onDropWashExcel,
    accept: { 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'text/plain': ['.csv']
    },
    maxFiles: 1
  });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col gap-4">
      
      {/* 1. Header Principal */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets className="text-blue-600" />
            Lavados y Certificaciones de Flota
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestión y seguimiento de <strong>Ultima certificación</strong> y <strong>Fecha Último Lavado</strong> cruzados por N° Interno.
          </p>
        </div>

        {/* Acciones de Carga Masiva */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Carga 1: Certificaciones */}
          <Button
            onClick={() => setIsCertModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs"
            title="Cargar archivo Excel con 'Ultima certificación' seleccionando la hoja"
          >
            <ShieldCheck size={15} />
            Cargar Certificaciones
          </Button>

          {/* Botón Carga 2: Lavados */}
          <Button
            onClick={() => setIsWashModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs"
            title="Cargar archivo Excel de lavados cruzando N° Interno con Código de camión"
          >
            <Droplets size={15} />
            Cargar Lavados
          </Button>

          {/* Botón Exportar */}
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-xs h-9 px-3 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} />
            Exportar
          </Button>
        </div>
      </div>

      {/* Selector de Pestañas: Flota Propia vs Flota Externa vs Toda la Flota (Requisito 2) */}
      <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/80 w-fit shrink-0">
        <button
          type="button"
          onClick={() => setFleetTab('propia')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'propia'
              ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Flota Propia</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'propia' ? 'bg-blue-700/60 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {propiaCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFleetTab('externa')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'externa'
              ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-600/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Building2 size={15} />
          <span>Flota Externa</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'externa' ? 'bg-purple-700/60 text-white' : 'bg-purple-100 text-purple-700'
          }`}>
            {externaCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFleetTab('todas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'todas'
              ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-800/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Layers size={15} />
          <span>Toda la Flota</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'todas' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {fleetList.length}
          </span>
        </button>
      </div>

      {/* Banner Informativo al estar en la Pestaña de Flota Externa */}
      {fleetTab === 'externa' && (
        <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-purple-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-purple-600 shrink-0" />
            <span>
              Pestaña <strong>Flota Externa</strong>: mostrando lavados y certificaciones de vehículos tercerizados ({externaCount} registrados).
            </span>
          </div>
          <span className="text-[11px] text-purple-700 font-medium">
            Los registros de lavado y certificación se vinculan automáticamente por <strong>N° Interno</strong> o <strong>Patente</strong>.
          </span>
        </div>
      )}

      {/* 2. Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por N° Interno, Patente o Marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 h-9 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
        </div>

        {/* Multi-Filtro Camiones (Requisito 2) */}
        <TruckMultiSelect
          truckOptions={truckOptions}
          selectedTrucks={selectedTrucks}
          onChange={setSelectedTrucks}
        />

        {/* Filtro por Región (Requisito 3) */}
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          {regions.map(r => (
            <option key={r} value={r}>
              {r === 'Todas' ? 'Todas las Regiones' : `Región: ${r}`}
            </option>
          ))}
        </select>

        {/* Filtro por Tipo */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todos los Tipos</option>
          <option value="Camiones">Camiones</option>
          <option value="Tractos">Tractos</option>
          <option value="Semirremolques">Semirremolques</option>
        </select>

        {/* Filtro por Certificación / Lavado */}
        <select
          value={certFilter}
          onChange={(e) => setCertFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todas las condiciones</option>
          <option value="con_cert">Con Certificación</option>
          <option value="sin_cert">Sin Certificación</option>
          <option value="con_lavado">Con Lavado Registrado</option>
          <option value="sin_lavado">Sin Lavado</option>
        </select>

        {(searchTerm || regionFilter !== 'Todas' || typeFilter !== 'Todos' || certFilter !== 'Todos' || selectedTrucks.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setRegionFilter('Todas');
              setTypeFilter('Todos');
              setCertFilter('Todos');
              setSelectedTrucks([]);
            }}
            className="text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            title="Limpiar todos los filtros"
          >
            × Limpiar
          </button>
        )}
      </div>

      {/* 3. Tabla Principal de Lavados (con ordenamiento ascendente / descendente - Requisito 1) */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 shadow-2xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
            <tr>
              {[
                { key: 'internal_number', label: 'N° Interno' },
                { key: 'plate', label: 'Patente' },
                { key: 'type', label: 'Tipo' },
                { key: 'brand', label: 'Marca' },
                { key: 'region', label: 'Región' },
                ...(fleetTab === 'externa' ? [{ key: 'empresa_externa', label: 'Empresa Externa' }] : []),
                { key: 'ultima_certificacion', label: 'Ultima certificación', className: 'text-blue-900 bg-blue-50/50' },
                { key: 'fecha_ultimo_lavado', label: 'Fecha Último Lavado', className: 'text-emerald-900 bg-emerald-50/50' }
              ].map(col => {
                const isSorted = sortConfig.key === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-slate-200/80 group ${col.className || ''} ${
                      isSorted ? 'bg-blue-100/70 text-blue-950 font-black' : ''
                    }`}
                    title={`Ordenar por ${col.label} (${isSorted ? (sortConfig.direction === 'asc' ? 'Ascendente (clic para Descendente)' : 'Descendente (clic para quitar orden)') : 'Clic para ordenar'})`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      <span className={`transition-all ${isSorted ? 'text-blue-700' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`}>
                        {isSorted ? (
                          sortConfig.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="px-3.5 py-2.5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {sortedFleet.length === 0 ? (
              <tr>
                <td colSpan={fleetTab === 'externa' ? 9 : 8} className="py-12 text-center text-slate-400">
                  <Droplets size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">
                    {fleetTab === 'externa' ? 'No se encontraron vehículos de Flota Externa.' : 'No se encontraron vehículos.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Prueba cambiando los filtros o cargando un archivo Excel.</p>
                </td>
              </tr>
            ) : (
              sortedFleet.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* N° Interno */}
                  <td className="px-3.5 py-2.5 font-bold font-mono text-slate-900 text-xs">
                    {truck.internal_number ? (
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {truck.internal_number}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic">— S/N —</span>
                    )}
                  </td>

                  {/* Patente */}
                  <td className="px-3.5 py-2.5 font-bold text-slate-800 font-mono">
                    {truck.plate}
                  </td>

                  {/* Tipo */}
                  <td className="px-3.5 py-2.5 text-slate-600">
                    {truck.type || '—'}
                  </td>

                  {/* Marca */}
                  <td className="px-3.5 py-2.5 text-slate-600">
                    {truck.brand || '—'}
                  </td>

                  {/* Región (Requisito 3) */}
                  <td className="px-3.5 py-2.5 text-slate-700 font-medium">
                    {truck.region || <span className="text-slate-400 italic text-[11px]">—</span>}
                  </td>

                  {/* Empresa Externa si aplica */}
                  {fleetTab === 'externa' && (
                    <td className="px-3.5 py-2.5 font-semibold text-purple-900">
                      {truck.empresa_externa || <span className="text-slate-300 italic text-[11px]">—</span>}
                    </td>
                  )}

                  {/* Ultima certificación */}
                  <td className="px-3.5 py-2.5 font-medium bg-blue-50/20">
                    {(() => {
                      const certDate = getTruckCertDate(truck);
                      return certDate ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          <ShieldCheck size={12} className="text-blue-600" />
                          {certDate}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">— Sin certificación —</span>
                      );
                    })()}
                  </td>

                  {/* Fecha Último Lavado */}
                  <td className="px-3.5 py-2.5 font-medium bg-emerald-50/20">
                    {truck.fecha_ultimo_lavado ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Droplets size={12} className="text-emerald-600" />
                        {truck.fecha_ultimo_lavado}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">— Sin lavado —</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-3.5 py-2.5 text-center">
                    <button
                      onClick={() => handleStartManualEdit(truck)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar fechas manualmente"
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 flex items-center justify-between">
        <span>Mostrando <strong>{sortedFleet.length}</strong> de <strong>{fleetList.length}</strong> vehículos</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 1: CARGAR CERTIFICACIONES (con selector de hoja)              */}
      {/* ------------------------------------------------------------------ */}
      {isCertModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Cargar Archivo de Certificaciones</h3>
                  <p className="text-xs text-slate-400">
                    Selecciona la hoja a consultar y se vinculará por <strong>N° Interno</strong> con la columna <strong>"Ultima certificación"</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadFleetWashesCertTemplate}
                  className="text-xs h-8 px-2.5 flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 font-bold rounded-lg"
                  title="Descargar archivo Excel con columnas de N° Interno y Ultima certificación"
                >
                  <Download size={14} />
                  Descargar Plantilla
                </Button>
                <button onClick={() => setIsCertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {!certWorkbook ? (
                <div 
                  {...getCertRoot()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isCertDrag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <input {...getCertInput()} />
                  <FileSpreadsheet size={44} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-sm font-bold text-slate-700">Arrastra tu archivo Excel de certificaciones aquí</p>
                  <p className="text-xs text-slate-400 mt-1">O haz clic para seleccionar archivo (.xlsx / .xls)</p>
                  
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFleetWashesCertTemplate();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                      title="Descargar archivo Excel con títulos: N° Interno y Ultima certificación"
                    >
                      <Download size={14} />
                      Descargar Plantilla Excel con Títulos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selector de Hoja (Requisito 2) */}
                  <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                    <label className="block text-xs font-bold text-blue-900 mb-1">
                      ¿En qué hoja deseas buscar la información?:
                    </label>
                    <select
                      value={selectedCertSheet}
                      onChange={(e) => handleCertSheetChange(e.target.value)}
                      className="w-full text-xs font-bold border border-blue-300 rounded-lg p-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {certSheets.map(sh => (
                        <option key={sh} value={sh}>{sh}</option>
                      ))}
                    </select>
                  </div>

                  {/* Columnas detectadas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Columna de N° Interno:
                      </label>
                      <select
                        value={certInternalCol}
                        onChange={(e) => setCertInternalCol(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
                      >
                        {certColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">
                        Columna de Ultima certificación:
                      </label>
                      <select
                        value={certDateCol}
                        onChange={(e) => setCertDateCol(e.target.value)}
                        className="w-full text-xs font-bold border border-blue-300 rounded-lg p-2 bg-blue-50 text-blue-950"
                      >
                        {certColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Resumen de coincidencia */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between text-xs">
                    <span>Filas detectadas en hoja: <strong>{certRawRows.length}</strong></span>
                    <span className="font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                      {certMatchedCount} coinciden con vehículos de flota
                    </span>
                  </div>

                  {/* Muestra de datos */}
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 sticky top-0 text-[10px] uppercase font-bold text-slate-600">
                        <tr>
                          <th className="px-3 py-1.5">N° Interno (Excel)</th>
                          <th className="px-3 py-1.5">Vehículo en Flota</th>
                          <th className="px-3 py-1.5">Ultima certificación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {certPreviewUpdates.slice(0, 15).map((up, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 font-bold font-mono">{up.internal_number}</td>
                            <td className="px-3 py-1.5">
                              {up.matchedFleet ? (
                                <span className="text-emerald-700 font-semibold">{up.matchedFleet.plate}</span>
                              ) : (
                                <span className="text-slate-400 italic">No encontrado</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{up.newCertDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {certWorkbook && (
                <button 
                  onClick={() => { setCertWorkbook(null); setCertRawRows([]); }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cargar otro archivo
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={() => setIsCertModalOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                {certWorkbook && (
                  <Button
                    onClick={handleApplyCertifications}
                    disabled={certMatchedCount === 0 || isLoading}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Confirmar {certMatchedCount} Certificaciones
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 2: CARGAR LAVADOS (Código de camión vs N° Interno)           */}
      {/* ------------------------------------------------------------------ */}
      {isWashModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Droplets size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Cargar Archivo de Lavados</h3>
                  <p className="text-xs text-slate-400">
                    Cruza <strong>N° Interno</strong> con <strong>Código de camión</strong> y registra la fecha de <strong>"Creado"</strong> como Último Lavado.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadFleetWashesRecordsTemplate}
                  className="text-xs h-8 px-2.5 flex items-center gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-bold rounded-lg"
                  title="Descargar plantilla Excel con columnas oficiales de lavados"
                >
                  <Download size={14} />
                  Descargar Plantilla
                </Button>
                <button onClick={() => setIsWashModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {!washWorkbook ? (
                <div 
                  {...getWashRoot()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isWashDrag ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'
                  }`}
                >
                  <input {...getWashInput()} />
                  <Droplets size={44} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-slate-700">Arrastra tu archivo Excel o CSV de lavados aquí</p>
                  <p className="text-xs text-slate-400 mt-1">Formatos compatibles: .xlsx, .xls, .csv</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Detecta columnas como "Creado", "Código de camión", "Patente de camión", etc.</p>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFleetWashesRecordsTemplate();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                      title="Descargar archivo Excel con títulos: Código de camión, Creado, Patente de camión, Servicio"
                    >
                      <Download size={14} />
                      Descargar Plantilla Excel con Títulos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selector de Hoja */}
                  {washSheets.length > 1 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Hoja del archivo Excel:
                      </label>
                      <select
                        value={selectedWashSheet}
                        onChange={(e) => handleWashSheetChange(e.target.value)}
                        className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                      >
                        {washSheets.map(sh => <option key={sh} value={sh}>{sh}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Columnas de cruce */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 mb-1">
                        Columna Código de Camión (en Excel/CSV):
                      </label>
                      <select
                        value={washCodeCol}
                        onChange={(e) => setWashCodeCol(e.target.value)}
                        className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-emerald-50/50 text-emerald-950"
                      >
                        {washColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-800 mb-1">
                        Columna Creado (Fecha de Lavado):
                      </label>
                      <select
                        value={washCreadoCol}
                        onChange={(e) => setWashCreadoCol(e.target.value)}
                        className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-emerald-50/50 text-emerald-950"
                      >
                        {washColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Selector de Modo y Rango de Fechas de "Creado" (Requisito 4) */}
                  <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-950 flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-emerald-700" />
                          Filtro de fecha de "Creado" a cargar:
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          {washDateFilterMode === 'todas' && 'Todas las fechas'}
                          {washDateFilterMode === 'especifica' && `Fecha: ${selectedCreadoDate}`}
                          {washDateFilterMode === 'rango' && `Rango: ${washDateRangeStart || 'Inicio'} → ${washDateRangeEnd || 'Fin'}`}
                        </span>
                      </label>

                      {/* Botones de selección de modo */}
                      <div className="grid grid-cols-3 gap-1.5 bg-emerald-100/70 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setWashDateFilterMode('todas')}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'todas'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Todas las fechas
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWashDateFilterMode('rango');
                            if (groupedCreadoDates.length > 0) {
                              const latestGroup = groupedCreadoDates[0];
                              if (latestGroup.items.length > 0) {
                                if (!washDateRangeStart) setWashDateRangeStart(latestGroup.items[0].date);
                                if (!washDateRangeEnd) setWashDateRangeEnd(latestGroup.items[latestGroup.items.length - 1].date);
                              }
                            } else if (chronologicalCreadoDates.length > 0) {
                              if (!washDateRangeStart) setWashDateRangeStart(chronologicalCreadoDates[0].date);
                              if (!washDateRangeEnd) setWashDateRangeEnd(chronologicalCreadoDates[chronologicalCreadoDates.length - 1].date);
                            }
                          }}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'rango'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Rango de fechas
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWashDateFilterMode('especifica');
                            if (selectedCreadoDate === 'todas' && availableCreadoDates.length > 0) {
                              setSelectedCreadoDate(availableCreadoDates[0].date);
                            }
                          }}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'especifica'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Fecha específica
                        </button>
                      </div>
                    </div>

                    {/* Si seleccionó Rango de Fechas (Requisito 1 y 4) */}
                    {washDateFilterMode === 'rango' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                        <div>
                          <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                            Fecha Desde (Inicio del rango):
                          </label>
                          <select
                            value={washDateRangeStart}
                            onChange={(e) => setWashDateRangeStart(e.target.value)}
                            className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                          >
                            {groupedCreadoDates.map(grp => (
                              <optgroup key={`start-grp-${grp.key}`} label={`📅 ${grp.label}`}>
                                {grp.items.map(item => (
                                  <option key={`start-${item.date}`} value={item.date}>
                                    {item.date} ({item.count} reg.)
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                            Fecha Hasta (Fin del rango):
                          </label>
                          <select
                            value={washDateRangeEnd}
                            onChange={(e) => setWashDateRangeEnd(e.target.value)}
                            className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                          >
                            {groupedCreadoDates.map(grp => (
                              <optgroup key={`end-grp-${grp.key}`} label={`📅 ${grp.label}`}>
                                {grp.items.map(item => (
                                  <option key={`end-${item.date}`} value={item.date}>
                                    {item.date} ({item.count} reg.)
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Si seleccionó Fecha Específica */}
                    {washDateFilterMode === 'especifica' && (
                      <div className="pt-1 border-t border-emerald-200/70">
                        <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                          Selecciona la fecha exacta de "Creado":
                        </label>
                        <select
                          value={selectedCreadoDate}
                          onChange={(e) => setSelectedCreadoDate(e.target.value)}
                          className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                        >
                          {groupedCreadoDates.map(grp => (
                            <optgroup key={`single-grp-${grp.key}`} label={`📅 ${grp.label}`}>
                              {grp.items.map(item => (
                                <option key={`single-${item.date}`} value={item.date}>
                                  {item.date} — ({item.count} {item.count === 1 ? 'registro' : 'registros'})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="text-[11px] text-emerald-800">
                      {washDateFilterMode === 'todas' && 'Se procesarán y cruzarán los lavados de todas las fechas registradas en el archivo.'}
                      {washDateFilterMode === 'rango' && `Se cargarán únicamente los registros con fecha de Creado entre el ${washDateRangeStart || 'inicio'} y el ${washDateRangeEnd || 'fin'}.`}
                      {washDateFilterMode === 'especifica' && `Solo se cargarán los registros cuya fecha de Creado sea exactamente ${selectedCreadoDate}.`}
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span>
                      Registros a procesar: <strong>{filteredWashRowsCount}</strong> de {washRawRows.length} totales en archivo
                    </span>
                    <span>Validando contra <strong>{fleetList.length}</strong> vehículos de flota</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {washWorkbook && (
                <button 
                  onClick={() => { 
                    setWashWorkbook(null); 
                    setWashRawRows([]); 
                    setSelectedCreadoDate('todas'); 
                    setWashDateFilterMode('todas'); 
                    setWashDateRangeStart(''); 
                    setWashDateRangeEnd(''); 
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cargar otro archivo
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={() => setIsWashModalOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                {washWorkbook && (
                  <Button
                    onClick={handleAnalyzeWashRecords}
                    disabled={washRawRows.length === 0 || isLoading}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Procesar y Cruzar con Flota
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 3: PANTALLA DE REGISTROS SIN RELACIÓN (EDITAR O ELIMINAR)     */}
      {/* (Requisito 2: "si no encuentras relación necesito que despliegues   */}
      {/*  una pantalla en donde pueda editar o eliminar información")        */}
      {/* ------------------------------------------------------------------ */}
      {isUnmatchedModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    Registros de Lavados sin Coincidencia ({unmatchedRows.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {washDateFilterMode !== 'todas' && (
                      <span className="inline-block bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] mr-1.5 border border-emerald-200">
                        {washDateFilterMode === 'especifica' && `Filtro Creado: ${selectedCreadoDate}`}
                        {washDateFilterMode === 'rango' && `Filtro Rango: ${washDateRangeStart} → ${washDateRangeEnd}`}
                      </span>
                    )}
                    El "Código de camión" de estas filas no se encontró en la Flota. Puedes <strong>editar</strong> el código para vincularlo a un vehículo existente o <strong>eliminar</strong> la fila.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsUnmatchedModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            {/* Listado editable de discrepancias */}
            <div className="py-4 space-y-3 overflow-y-auto flex-1">
              {unmatchedRows.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-bold text-slate-700">Todos los registros han sido resueltos o descartados.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Fila</th>
                        <th className="px-3 py-2">Código en Archivo</th>
                        <th className="px-3 py-2">Vincular a N° Interno de Flota</th>
                        <th className="px-3 py-2">Patente Archivo</th>
                        <th className="px-3 py-2">Fecha Creado</th>
                        <th className="px-3 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {unmatchedRows.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-400 font-mono">{item.originalIndex}</td>
                          <td className="px-3 py-2 font-mono font-bold text-amber-800 bg-amber-50/50">
                            {item.truckCode || '—'}
                          </td>
                          {/* Input / Selector editable para vincular a N° Interno */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={item.truckCode}
                                onChange={(e) => handleUpdateUnmatchedCode(item.id, e.target.value)}
                                className={`text-xs font-bold border rounded-lg px-2 py-1 max-w-[180px] ${
                                  item.matchedVehicle 
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                                    : 'bg-white border-slate-300 text-slate-700'
                                }`}
                              >
                                <option value={item.truckCode}>Seleccionar N° Interno...</option>
                                {fleetInternalsList.map(fl => (
                                  <option key={fl.internal} value={fl.internal}>
                                    {fl.internal} ({fl.plate} - {fl.type})
                                  </option>
                                ))}
                              </select>
                              {item.matchedVehicle && (
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                                  ✓ Vinculado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">{item.plate || '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{item.creadoDate || item.rawCreado}</td>
                          {/* Botón eliminar información (Requisito 2) */}
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteUnmatchedRow(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar esta fila del lote"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Coincidencias listas para registrar: <strong>{matchedWashUpdates.length + unmatchedRows.filter(u => u.matchedVehicle).length}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setIsUnmatchedModalOpen(false)} className="text-xs">
                  Cerrar sin guardar
                </Button>
                <Button
                  onClick={handleConfirmUnmatchedAndApply}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Confirmar y Aplicar Lavados
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 4: EDICIÓN MANUAL DE FECHAS DE UN VEHÍCULO                   */}
      {/* ------------------------------------------------------------------ */}
      {editingTruck && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">
                Editar Fechas - {editingTruck.plate} (N° {editingTruck.internal_number || 'S/N'})
              </h3>
              <button onClick={() => setEditingTruck(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ultima certificación:
                </label>
                <input
                  type="text"
                  placeholder="ej: DD/MM/AAAA o AAAA-MM-DD"
                  value={editForm.ultima_certificacion}
                  onChange={(e) => setEditForm({ ...editForm, ultima_certificacion: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha Último Lavado:
                </label>
                <input
                  type="text"
                  placeholder="ej: DD/MM/AAAA HH:mm"
                  value={editForm.fecha_ultimo_lavado}
                  onChange={(e) => setEditForm({ ...editForm, fecha_ultimo_lavado: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingTruck(null)} className="text-xs">
                Cancelar
              </Button>
              <Button onClick={handleSaveManualEdit} className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
