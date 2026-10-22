import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  Download, Calendar, Search, Filter, Layers, 
  MapPin, User, Truck, Package, Weight, CheckCircle2,
  ChevronDown, ChevronRight, ArrowUpDown, FileSpreadsheet, RefreshCw, X, Check,
  Save, AlertTriangle, History, Clock, Star, Edit3, Trash2, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore, ensureRowTransportista } from '../store/planningStore';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { AmbienteBadge } from './DailyPlanning';

// ==========================================
// 1. MAPA DE DISTANCIAS Y CÁLCULO DE COMUNA
// Base de origen: Lago Riñihue 02319, San Bernardo, Chile
// ==========================================
export const SAN_BERNARDO_DISTANCE_MAP = {
  // Comuna Base y colindantes inmediatas
  'SAN BERNARDO': 2,
  'CALERA DE TANGO': 8,
  'EL BOSQUE': 6,
  'LO ESPEJO': 8,
  'LA PINTANA': 8,
  'LA CISTERNA': 10,
  'SAN RAMON': 11,
  'SAN RAMÓN': 11,
  'LA GRANJA': 12,
  'PEDRO AGUIRRE CERDA': 12,
  'BUIN': 14,
  'CERRILLOS': 13,
  'SAN MIGUEL': 14,
  'SAN JOAQUIN': 15,
  'SAN JOAQUÍN': 15,
  'MAIPU': 16,
  'MAIPÚ': 16,
  'PUENTE ALTO': 16,
  'LA FLORIDA': 16,
  'ESTACION CENTRAL': 17,
  'ESTACIÓN CENTRAL': 17,
  'MACUL': 18,
  'SANTIAGO': 18,
  'SANTIAGO CENTRO': 18,
  'PIRQUE': 20,
  'QUINTA NORMAL': 20,
  'NUNOA': 20,
  'ÑUÑOA': 20,
  'LO PRADO': 21,
  'CERRO NAVIA': 22,
  'INDEPENDENCIA': 22,
  'PROVIDENCIA': 22,
  'PADRE HURTADO': 22,
  'RECOLETA': 23,
  'PUDAHUEL': 24,
  'PENALOLEN': 24,
  'PEÑALOLÉN': 24,
  'RENCA': 24,
  'PAINE': 24,
  'CONCHALI': 25,
  'CONCHALÍ': 25,
  'LA REINA': 26,
  'PENAFLOR': 26,
  'PEÑAFLOR': 26,
  'TALAGANTE': 28,
  'QUILICURA': 28,
  'HUECHURABA': 28,
  'LAS CONDES': 30,
  'VITACURA': 32,
  'ISLA DE MAIPO': 33,
  'LO BARNECHEA': 36,
  'EL MONTE': 38,
  'COLINA': 46,
  'LAMPA': 48,
  'SAN JOSE DE MAIPO': 52,
  'SAN JOSÉ DE MAIPO': 52,
  'CURACAVI': 62,
  'CURACAVÍ': 62,
  'MELIPILLA': 65,
  'TILTIL': 68,
  'TIL TIL': 68,
  // Región de O'Higgins
  'MOSTAZAL': 50,
  'SAN FRANCISCO DE MOSTAZAL': 50,
  'GRANEROS': 62,
  'RANCAGUA': 72,
  'MACHALI': 78,
  'MACHALÍ': 78,
  'RENGO': 102,
  'SAN FERNANDO': 128,
  'CHIMBARONGO': 145,
  // Región de Valparaíso
  'CASABLANCA': 88,
  'SAN ANTONIO': 98,
  'CARTAGENA': 98,
  'SANTO DOMINGO': 102,
  'VILLA ALEMANA': 115,
  'QUILPUE': 118,
  'QUILPUÉ': 118,
  'VALPARAISO': 125,
  'VALPARAÍSO': 125,
  'LIMACHE': 125,
  'VINA DEL MAR': 128,
  'VIÑA DEL MAR': 128,
  'QUILLOTA': 135,
  'CONCON': 138,
  'CONCÓN': 138,
  'LA CALERA': 142,
  'SAN FELIPE': 105,
  'LOS ANDES': 98,
  'ZAPALLAR': 180,
  'LA LIGUA': 165,
  // Maule y otras regiones
  'CURICO': 185,
  'CURICÓ': 185,
  'SAN RAFAEL': 225,
  'TALCA': 245,
  'LINARES': 295,
  'LOS VILOS': 240,
  'ALHUE': 98,
  'ALHUÉ': 98,
  'SAN PEDRO': 85
};

export const normalizeComuna = (comunaStr) => {
  if (!comunaStr) return '';
  return String(comunaStr)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const getComunaDistance = (comunaStr) => {
  if (!comunaStr) return 0;
  const raw = String(comunaStr).trim().toUpperCase();
  if (SAN_BERNARDO_DISTANCE_MAP[raw] !== undefined) {
    return SAN_BERNARDO_DISTANCE_MAP[raw];
  }
  const norm = normalizeComuna(raw);
  if (SAN_BERNARDO_DISTANCE_MAP[norm] !== undefined) {
    return SAN_BERNARDO_DISTANCE_MAP[norm];
  }
  for (const [key, dist] of Object.entries(SAN_BERNARDO_DISTANCE_MAP)) {
    const keyNorm = normalizeComuna(key);
    if (norm.includes(keyNorm) || keyNorm.includes(norm)) {
      return dist;
    }
  }
  return 20; // Fallback promedio
};

export const findFarthestComunaForRoute = (route) => {
  const paradas = route.paradas || [];
  let maxDist = -1;
  let farthest = '';

  paradas.forEach(p => {
    const c = p.comuna ? p.comuna.trim() : '';
    if (c) {
      const dist = getComunaDistance(c);
      if (dist > maxDist) {
        maxDist = dist;
        farthest = c.toUpperCase();
      }
    }
  });

  if (!farthest) {
    if (route.comuna) {
      farthest = route.comuna.trim().toUpperCase();
    } else {
      farthest = 'SANTIAGO';
    }
  }
  return farthest;
};

// Formato de fecha descriptiva para el Banner superior
function formatBannerDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const dayName = d.toLocaleDateString('es-CL', { weekday: 'long' });
      const monthName = d.toLocaleDateString('es-CL', { month: 'long' });
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return `${capDay}, ${day} de ${capMonth} de ${year}`;
    }
  }
  return dateStr;
}

// Limpiador del nombre del Cliente para el título del Banner (Requisito 3)
// Quita números, sufijos como "-01" y deja solo el texto en mayúsculas
export const cleanClientNameForBanner = (rawClient) => {
  if (!rawClient) return '';
  return String(rawClient)
    .replace(/^RUTA\s+/i, '')       // Quita prefijo "RUTA " si existe
    .replace(/[-–—]\s*\d+/g, '')     // Quita sufijos como "-01", "-02"
    .replace(/\d+/g, '')             // Quita cualquier número (0..9)
    .replace(/[-–—]/g, ' ')          // Quita guiones huérfanos
    .replace(/\s+/g, ' ')            // Normaliza espacios
    .trim()
    .toUpperCase();
};

// Normalizador de búsqueda insensible a acentos y mayúsculas
export const normalizeSearchText = (text) => {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

// Opciones de Turno solicitadas
const TURNO_OPTIONS = [
  { value: '', label: 'Sin turno' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
  { value: '2da vuelta', label: '2da vuelta' },
  { value: '3ra vuelta', label: '3ra vuelta' },
  { value: 'Nocturno', label: 'Nocturno' },
  { value: 'No aplica', label: 'No aplica' }
];

// Opciones de Prioridad solicitadas
const PRIORIDAD_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Prioridad urgente', label: 'Prioridad urgente' },
  { value: 'Urgente', label: 'Urgente' },
  { value: 'Redespacho', label: 'Redespacho' }
];

// ==========================================
// 2. COMPONENTE MULTI-SELECT DROPDOWN
// ==========================================
function MultiSelectFilter({ label, options, selectedValues, onChange, placeholder = 'Todos' }) {
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

  const handleSelectAll = () => {
    onChange([...options]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const buttonText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === options.length && options.length > 0) return `Todos (${options.length})`;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues.length} seleccionados`;
  }, [selectedValues, options, placeholder]);

  return (
    <div className="flex flex-col gap-0.5 relative" ref={dropdownRef}>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border transition-all text-left min-w-[130px] max-w-[200px] ${
          selectedValues.length > 0 
            ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-semibold shadow-xs' 
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
        }`}
      >
        <span className="truncate">{buttonText}</span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedValues.length > 0 && (
            <span className="bg-blue-600 text-white rounded-full px-1.5 py-0.2 text-[9px] font-bold">
              {selectedValues.length}
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 text-[11px]">
            <span className="font-bold text-slate-700">{label}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
              >
                Todos
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-slate-500 hover:text-red-600 font-semibold hover:underline"
              >
                Limpiar
              </button>
            </div>
          </div>

          {options.length > 5 && (
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-2 text-slate-400" size={12} />
              <input
                type="text"
                placeholder={`Buscar en ${label.toLowerCase()}...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          )}

          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.map((opt) => {
              const isChecked = selectedValues.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                    isChecked ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOption(opt)}
                    className="rounded text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              );
            })}

            {filteredOptions.length === 0 && (
              <div className="py-3 text-center text-slate-400 text-xs italic">
                Sin coincidencias
              </div>
            )}
          </div>

          <div className="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>{selectedValues.length} de {options.length} marcados</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. COMPONENTE PRINCIPAL RUTEO VIEW
// ==========================================
export default function RuteoView() {
  const { 
    savedRuteoByDate, 
    savedRuteoBaseline,
    savedHistoryList,
    transmittedAssignments, 
    selectedRuteoDate, 
    setSelectedRuteoDate,
    saveDisponibilizacion,
    recordChangeAudit,
    ruteoOverrides,
    updateRuteoTripField,
    batchUpdateRuteoTripField
  } = usePlanningStore();
  const { user } = useAuthStore();

  // Modal de Auditoría de Cambios al Guardar desde Ruteo
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditData, setAuditData] = useState({
    changes: [],
    incompleteList: [],
    usuario: '',
    horaAntigua: '',
    horaModificada: ''
  });

  // Estado para selección de filas de viajes para acciones masivas
  const [selectedTripKeys, setSelectedTripKeys] = useState([]);
  const [batchHoraCita, setBatchHoraCita] = useState('');
  const [batchTurno, setBatchTurno] = useState('');
  const [batchPrioridad, setBatchPrioridad] = useState('');

  // Estado para Modal de Destino Prioritario
  const [priorityModalTrip, setPriorityModalTrip] = useState(null);
  const [customPriorityText, setCustomPriorityText] = useState('');

  // Filas expandidas para ver sub-paradas
  const [expandedKeys, setExpandedKeys] = useState({});

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const setDates = new Set([
      ...Object.keys(savedRuteoByDate || {}),
      ...Object.keys(transmittedAssignments || {})
    ]);
    return Array.from(setDates).sort();
  }, [savedRuteoByDate, transmittedAssignments]);

  const activeDate = selectedRuteoDate || availableDates[0] || '14-10-2026';

  // Rutas de la fecha activa
  const currentRoutes = useMemo(() => {
    let routes = [];
    if (transmittedAssignments && transmittedAssignments[activeDate] && transmittedAssignments[activeDate].length > 0) {
      routes = transmittedAssignments[activeDate];
    } else if (savedRuteoByDate && savedRuteoByDate[activeDate] && savedRuteoByDate[activeDate].length > 0) {
      routes = savedRuteoByDate[activeDate];
    } else {
      routes = [];
    }
    return routes.map(r => ({
      ...r,
      transportista: r.transportista || ensureRowTransportista(r)
    }));
  }, [savedRuteoByDate, transmittedAssignments, activeDate]);

  // ==========================================
  // FILTRO RÁPIDO GLOBAL Y FILTROS COMBINADOS (Requisitos 1 y 2)
  // ==========================================
  const [quickSearch, setQuickSearch] = useState('');

  const [selectedTransportistas, setSelectedTransportistas] = useState([]);
  const [selectedClientes, setSelectedClientes] = useState([]);
  const [selectedRutas, setSelectedRutas] = useState([]);
  const [selectedConductores, setSelectedConductores] = useState([]);
  const [selectedAuxiliares, setSelectedAuxiliares] = useState([]);
  const [selectedVueltas, setSelectedVueltas] = useState([]);

  const normalizedQuickTerm = useMemo(() => {
    return normalizeSearchText(quickSearch.trim());
  }, [quickSearch]);

  // Función para evaluar si una ruta coincide con el Filtro Rápido en cualquier columna
  const matchRouteQuickSearch = useCallback((r, term) => {
    if (!term) return true;

    // Buscar en campos básicos de la ruta
    const basicFields = [
      r.ruta,
      r.cliente,
      r.transportista,
      r.camion,
      r.conductor_name,
      r.conductor_rut,
      r.aux1_name,
      r.aux2_name,
      r.n_vuelta ? `Vuelta ${r.n_vuelta}` : '',
      r.tipo_servicio,
      r.tipo_equipo,
      r.rampla,
      r.referencia
    ];

    for (const field of basicFields) {
      if (field && normalizeSearchText(field).includes(term)) return true;
    }

    // Buscar en paradas de la ruta (destino, comuna, dirección)
    if (r.paradas && r.paradas.length > 0) {
      for (const p of r.paradas) {
        if (p.destino && normalizeSearchText(p.destino).includes(term)) return true;
        if (p.comuna && normalizeSearchText(p.comuna).includes(term)) return true;
        if (p.direccion && normalizeSearchText(p.direccion).includes(term)) return true;
      }
    }

    // Buscar en metadatos/overrides de Ruteo
    const vueltaKey = r.n_vuelta ? String(r.n_vuelta).trim() : '1';
    const hasAssignment = !!(r.camion && r.conductor_name);
    const tripKey = hasAssignment
      ? `${r.camion.trim()}:::${r.conductor_name.trim()}:::${vueltaKey}`
      : `single:::${r.ruta}:::${r.id}`;
    const overrides = ruteoOverrides?.[activeDate]?.[tripKey];

    if (overrides) {
      if (overrides.turno && normalizeSearchText(overrides.turno).includes(term)) return true;
      if (overrides.hora_cita && normalizeSearchText(overrides.hora_cita).includes(term)) return true;
      if (overrides.prioridad && normalizeSearchText(overrides.prioridad).includes(term)) return true;
      if (overrides.destino_prioritario && normalizeSearchText(overrides.destino_prioritario).includes(term)) return true;
    }

    return false;
  }, [activeDate, ruteoOverrides]);

  // Función unificada para verificar si una ruta cumple los filtros (excluyendo un filtro para cálculo de opciones combinadas)
  const isRouteMatching = useCallback((r, excludeFilter = null) => {
    // 1. Filtro Rápido global
    if (normalizedQuickTerm) {
      if (!matchRouteQuickSearch(r, normalizedQuickTerm)) return false;
    }

    // 2. Transportista
    if (excludeFilter !== 'transportista' && selectedTransportistas.length > 0) {
      const tVal = r.transportista || 'Sin Transportista';
      if (!selectedTransportistas.includes(tVal)) return false;
    }

    // 3. Cliente
    if (excludeFilter !== 'cliente' && selectedClientes.length > 0) {
      const cVal = r.cliente || 'Sin Cliente';
      if (!selectedClientes.includes(cVal)) return false;
    }

    // 4. Ruta
    if (excludeFilter !== 'ruta' && selectedRutas.length > 0) {
      const rVal = String(r.ruta || '');
      if (!selectedRutas.includes(rVal)) return false;
    }

    // 5. Conductor
    if (excludeFilter !== 'conductor' && selectedConductores.length > 0) {
      const condVal = r.conductor_name || 'Sin Asignar';
      if (!selectedConductores.includes(condVal)) return false;
    }

    // 6. Auxiliar
    if (excludeFilter !== 'auxiliar' && selectedAuxiliares.length > 0) {
      const hasAux = (r.aux1_name && selectedAuxiliares.includes(r.aux1_name)) ||
                    (r.aux2_name && selectedAuxiliares.includes(r.aux2_name));
      if (!hasAux) return false;
    }

    // 7. Vuelta
    if (excludeFilter !== 'vuelta' && selectedVueltas.length > 0) {
      const vLabel = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
      if (!selectedVueltas.includes(vLabel)) return false;
    }

    return true;
  }, [
    normalizedQuickTerm,
    matchRouteQuickSearch,
    selectedTransportistas,
    selectedClientes,
    selectedRutas,
    selectedConductores,
    selectedAuxiliares,
    selectedVueltas
  ]);

  // Listas de opciones dinámicas y combinadas (Requisito 2)
  const transportistasList = useMemo(() => {
    const set = new Set();
    selectedTransportistas.forEach(t => set.add(t));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'transportista')) {
        set.add(r.transportista || 'Sin Transportista');
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [currentRoutes, isRouteMatching, selectedTransportistas]);

  const clientesList = useMemo(() => {
    const set = new Set();
    selectedClientes.forEach(c => set.add(c));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'cliente')) {
        set.add(r.cliente || 'Sin Cliente');
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [currentRoutes, isRouteMatching, selectedClientes]);

  const rutasList = useMemo(() => {
    const set = new Set();
    selectedRutas.forEach(r => set.add(r));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'ruta')) {
        if (r.ruta) set.add(String(r.ruta));
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [currentRoutes, isRouteMatching, selectedRutas]);

  const conductoresList = useMemo(() => {
    const set = new Set();
    selectedConductores.forEach(c => set.add(c));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'conductor')) {
        set.add(r.conductor_name || 'Sin Asignar');
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [currentRoutes, isRouteMatching, selectedConductores]);

  const auxiliaresList = useMemo(() => {
    const set = new Set();
    selectedAuxiliares.forEach(a => set.add(a));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'auxiliar')) {
        if (r.aux1_name) set.add(r.aux1_name);
        if (r.aux2_name) set.add(r.aux2_name);
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [currentRoutes, isRouteMatching, selectedAuxiliares]);

  const vueltasList = useMemo(() => {
    const set = new Set();
    selectedVueltas.forEach(v => set.add(v));
    currentRoutes.forEach(r => {
      if (isRouteMatching(r, 'vuelta')) {
        const vLabel = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
        set.add(vLabel);
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [currentRoutes, isRouteMatching, selectedVueltas]);

  // Rutas filtradas aplicando todos los filtros combinados + Filtro Rápido
  const filteredRoutes = useMemo(() => {
    return currentRoutes.filter(r => isRouteMatching(r, null));
  }, [currentRoutes, isRouteMatching]);

  // ==========================================
  // TÍTULO DINÁMICO DEL BANNER SEGÚN CLIENTE (Requisito 3)
  // Quita cualquier numeración y deja solo el texto de la columna
  // ==========================================
  const bannerClientTitle = useMemo(() => {
    if (selectedClientes.length > 0) {
      const cleanedNames = Array.from(new Set(
        selectedClientes.map(cleanClientNameForBanner).filter(Boolean)
      ));
      if (cleanedNames.length > 0) {
        return cleanedNames.join(' + ');
      }
    }

    // Si no hay filtro de cliente activo pero todas las rutas filtradas pertenecen a un solo cliente:
    const activeRouteClients = Array.from(new Set(
      filteredRoutes.map(r => cleanClientNameForBanner(r.cliente)).filter(Boolean)
    ));
    if (activeRouteClients.length === 1) {
      return activeRouteClients[0];
    }

    return 'FAST FOOD';
  }, [selectedClientes, filteredRoutes]);

  // ==========================================
  // CONSOLIDACIÓN DE VIAJES (TRIPS) EN MATRIZ
  // ==========================================
  const tripsList = useMemo(() => {
    const tripMap = new Map();

    filteredRoutes.forEach(row => {
      const hasAssignment = !!(row.camion && row.conductor_name);
      const vueltaKey = row.n_vuelta ? String(row.n_vuelta).trim() : '1';
      
      const key = hasAssignment
        ? `${row.camion.trim()}:::${row.conductor_name.trim()}:::${vueltaKey}`
        : `single:::${row.ruta}:::${row.id}`;

      if (!tripMap.has(key)) {
        tripMap.set(key, {
          key,
          fecha: row.fecha || activeDate,
          camion: row.camion || 'Sin Camión',
          conductor_name: row.conductor_name || 'Sin Asignar',
          conductor_rut: row.conductor_rut || '',
          n_vuelta: row.n_vuelta || '1',
          tipo_equipo: row.tipo_equipo || '',
          rampla: row.rampla || '',
          transportista: row.transportista || '',
          auxiliares: [row.aux1_name, row.aux2_name].filter(Boolean),
          rutas: [],
          totalM3: 0,
          totalPeso: 0,
          totalLocales: 0,
          totalCajas: 0
        });
      }

      const t = tripMap.get(key);
      t.totalM3 += parseFloat(row.m3) || 0;
      t.totalPeso += parseFloat(row.peso) || 0;
      t.totalLocales += parseInt(row.locales, 10) || 0;
      t.totalCajas += parseInt(row.cantCJ, 10) || 0;

      if (row.aux1_name && !t.auxiliares.includes(row.aux1_name)) t.auxiliares.push(row.aux1_name);
      if (row.aux2_name && !t.auxiliares.includes(row.aux2_name)) t.auxiliares.push(row.aux2_name);
      if (!t.transportista && row.transportista) t.transportista = row.transportista;
      if (t.camion === 'Sin Camión' && row.camion) t.camion = row.camion;
      if (t.conductor_name === 'Sin Asignar' && row.conductor_name) t.conductor_name = row.conductor_name;

      t.rutas.push(row);
    });

    return Array.from(tripMap.values()).map(trip => {
      const rutasStr = trip.rutas.map(r => r.ruta).join('+');
      
      // Operación (Clientes deduplicados y concatenados)
      const opsSet = new Set(trip.rutas.map(r => {
        let c = r.cliente || 'Operación';
        c = c.replace(/^RUTA\s+/i, '').trim();
        return c;
      }).filter(Boolean));
      const operacionStr = Array.from(opsSet).join(' + ') || 'FAST FOOD';

      // Zona detallada: [Ruta], [Cliente], [Comuna más lejana], [Locales] LC, [m³] m³
      const zonaItems = trip.rutas.map(r => {
        const farthest = findFarthestComunaForRoute(r);
        const m3Fmt = (parseFloat(r.m3) || 0).toFixed(4);
        return {
          ruta: r.ruta,
          cliente: r.cliente,
          comuna: farthest,
          locales: r.locales || 0,
          m3: m3Fmt,
          text: `${r.ruta}, ${r.cliente}, ${farthest}, ${r.locales || 0} LC, ${m3Fmt} m³`
        };
      });

      const overrides = (ruteoOverrides?.[activeDate]?.[trip.key]) || {};
      const firstRuta = trip.rutas[0] || {};

      const turno = overrides.turno !== undefined ? overrides.turno : (firstRuta.ruteo_turno || '');
      const hora_cita = overrides.hora_cita !== undefined ? overrides.hora_cita : (firstRuta.ruteo_hora_cita || '');
      const prioridad = overrides.prioridad !== undefined ? overrides.prioridad : (firstRuta.ruteo_prioridad || 'Normal');
      const destino_prioritario = overrides.destino_prioritario !== undefined ? overrides.destino_prioritario : (firstRuta.ruteo_destino_prioritario || '');

      // Texto de la vuelta según Disponibilización
      const displayVuelta = trip.n_vuelta
        ? (String(trip.n_vuelta).toLowerCase().includes('vuelta') ? trip.n_vuelta : `Vuelta ${trip.n_vuelta}`)
        : 'Vuelta 1';

      return {
        ...trip,
        rutasStr,
        operacionStr,
        zonaItems,
        totalM3: Number(trip.totalM3.toFixed(4)),
        totalPeso: Number(trip.totalPeso.toFixed(2)),
        turno,
        hora_cita,
        prioridad,
        destino_prioritario,
        displayVuelta
      };
    });
  }, [filteredRoutes, activeDate, ruteoOverrides]);

  // Selección individual o total de filas para acciones masivas
  const isAllSelected = tripsList.length > 0 && selectedTripKeys.length === tripsList.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTripKeys([]);
    } else {
      setSelectedTripKeys(tripsList.map(t => t.key));
    }
  };

  const toggleSelectTrip = (key) => {
    if (selectedTripKeys.includes(key)) {
      setSelectedTripKeys(selectedTripKeys.filter(k => k !== key));
    } else {
      setSelectedTripKeys([...selectedTripKeys, key]);
    }
  };

  // Handlers para actualizar campos en el store
  const handleUpdateTripField = (tripKey, field, value) => {
    updateRuteoTripField(activeDate, tripKey, field, value);
  };

  // Acciones masivas
  const handleApplyBatchHoraCita = () => {
    if (!batchHoraCita) {
      toast.error('Ingresa un horario o texto de cita');
      return;
    }
    batchUpdateRuteoTripField(activeDate, selectedTripKeys, { hora_cita: batchHoraCita });
    toast.success(`Hora Cita "${batchHoraCita}" aplicada a ${selectedTripKeys.length} viajes`);
    setBatchHoraCita('');
  };

  const handleApplyBatchTurno = () => {
    if (!batchTurno) return;
    batchUpdateRuteoTripField(activeDate, selectedTripKeys, { turno: batchTurno });
    toast.success(`Turno "${batchTurno}" aplicado a ${selectedTripKeys.length} viajes`);
  };

  const handleApplyBatchPrioridad = () => {
    if (!batchPrioridad) return;
    batchUpdateRuteoTripField(activeDate, selectedTripKeys, { prioridad: batchPrioridad });
    toast.success(`Prioridad "${batchPrioridad}" aplicada a ${selectedTripKeys.length} viajes`);
  };

  // Destino Prioritario Modal Handlers
  const handleOpenPriorityModal = (trip) => {
    setPriorityModalTrip(trip);
    setCustomPriorityText(trip.destino_prioritario || '');
  };

  const handleSavePriorityDestination = (destText) => {
    if (!priorityModalTrip) return;
    handleUpdateTripField(priorityModalTrip.key, 'destino_prioritario', destText);
    toast.success(destText ? `Destino prioritario asignado: "${destText}"` : 'Destino prioritario quitado');
    setPriorityModalTrip(null);
  };

  // Totales de la selección o de todas las rutas filtradas
  const totalM3 = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(4);
  }, [filteredRoutes]);

  const totalLocales = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
  }, [filteredRoutes]);

  const totalPeso = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      const p = parseFloat(r.peso) || (r.paradas || []).reduce((pAcc, item) => pAcc + (parseFloat(item.peso) || 0), 0);
      return acc + p;
    }, 0).toFixed(2);
  }, [filteredRoutes]);

  const totalCajas = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      const c = parseInt(r.cantCJ, 10) || (r.paradas || []).reduce((cAcc, item) => cAcc + (parseInt(item.cantCJ, 10) || 0), 0);
      return acc + c;
    }, 0);
  }, [filteredRoutes]);

  const hasActiveFilters = quickSearch.trim() !== '' ||
    selectedTransportistas.length > 0 || 
    selectedClientes.length > 0 || 
    selectedRutas.length > 0 || 
    selectedConductores.length > 0 || 
    selectedAuxiliares.length > 0 || 
    selectedVueltas.length > 0;

  const handleResetFilters = () => {
    setQuickSearch('');
    setSelectedTransportistas([]);
    setSelectedClientes([]);
    setSelectedRutas([]);
    setSelectedConductores([]);
    setSelectedAuxiliares([]);
    setSelectedVueltas([]);
  };

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ==========================================
  // EXPORTACIÓN A EXCEL CON FORMATO Y COLORES (SpreadsheetML)
  // ==========================================
  const handleExportExcel = () => {
    if (tripsList.length === 0) {
      toast.error('No hay datos en la matriz para exportar.');
      return;
    }

    try {
      const escapeXml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      const bannerTitle = `ASIGNACIÓN DE RUTAS - ${bannerClientTitle}`;
      const subtitle = `Despacho ${formatBannerDate(activeDate)} | Base: Lago Riñihue 02319, San Bernardo`;

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="BannerTitle">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="13" ss:Color="#FFFFFF" ss:Bold="1"/>
    <Interior ss:Color="#132C54" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="BannerSubtitle">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FDE047" ss:Bold="1"/>
    <Interior ss:Color="#132C54" ss:Pattern="Solid"/>
  </Style>

  <!-- Encabezados de Columna -->
  <Style ss:ID="ColHeaderLeft">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
    <Interior ss:Color="#183564" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ColHeaderCenter">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
    <Interior ss:Color="#183564" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ColHeaderRight">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22447C"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
    <Interior ss:Color="#183564" ss:Pattern="Solid"/>
  </Style>

  <!-- Prioridad urgente (Rojo Pastel: #FFD6D6, Texto: #7F1D1D, Borde: #FCA5A5) -->
  <Style ss:ID="Row_PrioUrgente_Left">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7F1D1D" ss:Bold="1"/>
    <Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_PrioUrgente_Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7F1D1D" ss:Bold="1"/>
    <Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_PrioUrgente_Right">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7F1D1D" ss:Bold="1"/>
    <Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
  </Style>

  <!-- Urgente (Naranjo Pastel: #FFEDD5, Texto: #7C2D12, Borde: #FDBA74) -->
  <Style ss:ID="Row_Urgente_Left">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7C2D12" ss:Bold="1"/>
    <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_Urgente_Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7C2D12" ss:Bold="1"/>
    <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_Urgente_Right">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#7C2D12" ss:Bold="1"/>
    <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
  </Style>

  <!-- Redespacho (Amarillo Pastel: #FEF9C3, Texto: #713F12, Borde: #FDE047) -->
  <Style ss:ID="Row_Redespacho_Left">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#713F12" ss:Bold="1"/>
    <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_Redespacho_Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#713F12" ss:Bold="1"/>
    <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_Redespacho_Right">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE047"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#713F12" ss:Bold="1"/>
    <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
  </Style>

  <!-- Filas Normales Pares (Blanco) -->
  <Style ss:ID="Row_NormalEven_Left">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_NormalEven_Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_NormalEven_Right">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
  </Style>

  <!-- Filas Normales Impares (Gris Claro) -->
  <Style ss:ID="Row_NormalOdd_Left">
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_NormalOdd_Center">
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Row_NormalOdd_Right">
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    </Borders>
    <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
    <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    <NumberFormat ss:Format="#,##0.000"/>
  </Style>
</Styles>

<Worksheet ss:Name="Matriz Ruteo">
  <Table>
    <Column ss:Width="85"/>
    <Column ss:Width="140"/>
    <Column ss:Width="110"/>
    <Column ss:Width="110"/>
    <Column ss:Width="95"/>
    <Column ss:Width="180"/>
    <Column ss:Width="150"/>
    <Column ss:Width="420"/>
    <Column ss:Width="85"/>
    <Column ss:Width="80"/>
    <Column ss:Width="90"/>
    <Column ss:Width="130"/>
    <Column ss:Width="160"/>

    <!-- Banner Superior -->
    <Row ss:Height="26">
      <Cell ss:MergeAcross="12" ss:StyleID="BannerTitle"><Data ss:Type="String">${escapeXml(bannerTitle)}</Data></Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="12" ss:StyleID="BannerSubtitle"><Data ss:Type="String">${escapeXml(subtitle)}</Data></Cell>
    </Row>
    <Row ss:Height="6"/>

    <!-- Fila de Encabezados -->
    <Row ss:Height="24">
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">Fecha</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Operación</Data></Cell>
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">Ruta</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Camión</Data></Cell>
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">N° de vuelta</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Conductor</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Auxiliar</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)</Data></Cell>
      <Cell ss:StyleID="ColHeaderRight"><Data ss:Type="String">Vol Carga</Data></Cell>
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">Turno</Data></Cell>
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">Hora Cita</Data></Cell>
      <Cell ss:StyleID="ColHeaderCenter"><Data ss:Type="String">Prioridad</Data></Cell>
      <Cell ss:StyleID="ColHeaderLeft"><Data ss:Type="String">Destino Prioritario</Data></Cell>
    </Row>
`;

      tripsList.forEach((trip, idx) => {
        const isPrioUrgente = trip.prioridad === 'Prioridad urgente';
        const isUrgente = trip.prioridad === 'Urgente';
        const isRedespacho = trip.prioridad === 'Redespacho';

        let prefix = idx % 2 === 0 ? 'Row_NormalEven' : 'Row_NormalOdd';
        if (isPrioUrgente) prefix = 'Row_PrioUrgente';
        else if (isUrgente) prefix = 'Row_Urgente';
        else if (isRedespacho) prefix = 'Row_Redespacho';

        const left = `${prefix}_Left`;
        const center = `${prefix}_Center`;
        const right = `${prefix}_Right`;

        const zonaCompleta = (trip.zonaItems || []).map(z => z.text).join(' | ');
        const auxStr = trip.auxiliares?.length > 0 ? trip.auxiliares.join(', ') : '-';
        const volNum = Number(trip.totalM3) || 0;

        xml += `    <Row ss:Height="22">
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.fecha)}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(trip.operacionStr)}</Data></Cell>
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.rutasStr)}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(trip.camion)}</Data></Cell>
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.displayVuelta)}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(trip.conductor_name)}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(auxStr)}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(zonaCompleta)}</Data></Cell>
      <Cell ss:StyleID="${right}"><Data ss:Type="Number">${volNum}</Data></Cell>
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.turno || '')}</Data></Cell>
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.hora_cita || '')}</Data></Cell>
      <Cell ss:StyleID="${center}"><Data ss:Type="String">${escapeXml(trip.prioridad || 'Normal')}</Data></Cell>
      <Cell ss:StyleID="${left}"><Data ss:Type="String">${escapeXml(trip.destino_prioritario || '')}</Data></Cell>
    </Row>\n`;
      });

      xml += `  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <DisplayGridlines/>
  </WorksheetOptions>
</Worksheet>
</Workbook>`;

      const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = bannerClientTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `Asignacion_Rutas_${safeTitle}_${activeDate}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Matriz Excel descargada con formato y colores (${tripsList.length} viajes exportados).`);
    } catch (err) {
      console.error(err);
      toast.error('Error al generar archivo Excel.');
    }
  };

  // Handler para Auditoría al Guardar Disponibilización
  const handlePreSaveFromRuteo = () => {
    const currentRows = transmittedAssignments[activeDate] || savedRuteoByDate[activeDate] || [];
    if (currentRows.length === 0) {
      toast.warning(`No hay datos en la fecha ${activeDate} para guardar.`);
      return;
    }

    const prevSavedRows = savedRuteoBaseline?.[activeDate] || savedRuteoByDate?.[activeDate] || [];
    const prevSavedEntry = (savedHistoryList || []).find(h => h.fecha === activeDate);
    const horaAntigua = prevSavedEntry?.savedAt || 'Guardado inicial (09:00:00)';
    const horaModificada = new Date().toLocaleString('es-CL');
    const usuario = user?.name || user?.username || 'Hernán Soto';

    const incomplete = currentRows.filter(r => !r.conductor_name || !r.camion);

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

  const confirmAuditAndSaveFromRuteo = () => {
    const entriesToRecord = auditData.changes.filter(c => c.isDiff);
    if (entriesToRecord.length > 0) {
      recordChangeAudit(entriesToRecord);
    }
    saveDisponibilizacion(activeDate);
    setIsAuditModalOpen(false);
    toast.success('¡Disponibilización guardada y registrada en Histórico de cambios!');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-3 overflow-hidden">
      
      {/* 1. Header Superior de Control */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-black px-2.5 py-0.5 rounded-full text-xs">
              Ruteo
            </span>
            <h1 className="text-lg font-black text-slate-800">Matriz de Asignación de Rutas</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Vista ejecutiva consolidada por viaje. Búsqueda rápida, filtros combinados dinámicos, turnos, horarios y destinos destacados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handlePreSaveFromRuteo}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm transition-all"
            title="Guardar disponibilización y generar auditoría de cambios"
          >
            <Save size={15} />
            Guardar Disponibilización
          </Button>

          <Button 
            onClick={handleExportExcel}
            variant="outline"
            className="flex items-center gap-2 text-slate-700 hover:bg-slate-100 text-xs font-bold px-3.5 py-2 rounded-xl border-slate-200 shadow-2xs transition-all"
          >
            <Download size={15} />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* 2. Barra de Filtros Dinámicos Combinados con Filtro Rápido (Requisitos 1 y 2) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Selector Fecha */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                Fecha
              </span>
              <select 
                value={activeDate}
                onChange={e => setSelectedRuteoDate(e.target.value)}
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

          {/* 1. FILTRO RÁPIDO PARA BUSCAR POR CUALQUIER COLUMNA (Requisito 1) */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Search size={11} className="text-blue-600" />
              Filtro Rápido
            </span>
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                placeholder="Buscar en matriz..."
                className="pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-slate-800 w-44 sm:w-56 transition-all shadow-2xs"
              />
              {quickSearch && (
                <button
                  type="button"
                  onClick={() => setQuickSearch('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  title="Borrar búsqueda"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* 2. FILTROS COMBINADOS DINÁMICOS (Requisito 2) */}
          <MultiSelectFilter
            label="Transportista"
            options={transportistasList}
            selectedValues={selectedTransportistas}
            onChange={setSelectedTransportistas}
            placeholder="Todos"
          />

          <MultiSelectFilter
            label="Cliente"
            options={clientesList}
            selectedValues={selectedClientes}
            onChange={setSelectedClientes}
            placeholder="Todos"
          />

          <MultiSelectFilter
            label="N° de Ruta"
            options={rutasList}
            selectedValues={selectedRutas}
            onChange={setSelectedRutas}
            placeholder="Todas"
          />

          <MultiSelectFilter
            label="Conductor"
            options={conductoresList}
            selectedValues={selectedConductores}
            onChange={setSelectedConductores}
            placeholder="Todos"
          />

          <MultiSelectFilter
            label="Auxiliar"
            options={auxiliaresList}
            selectedValues={selectedAuxiliares}
            onChange={setSelectedAuxiliares}
            placeholder="Todos"
          />

          <MultiSelectFilter
            label="N° de Vuelta"
            options={vueltasList}
            selectedValues={selectedVueltas}
            onChange={setSelectedVueltas}
            placeholder="Todas"
          />

          {hasActiveFilters && (
            <Button 
              variant="outline" 
              onClick={handleResetFilters}
              className="text-xs h-8 px-2.5 self-end flex items-center gap-1 text-slate-600 hover:text-red-600 border-dashed"
            >
              <X size={13} />
              Limpiar Filtros
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700 font-bold bg-slate-100 px-3 py-1 rounded-xl">
            {tripsList.length} viajes ({filteredRoutes.length} rutas)
          </span>
        </div>
      </div>

      {/* 3. Tarjetas KPI de Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
        <div className="bg-white p-2.5 px-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total m³</p>
            <p className="text-xl font-black text-emerald-700">{totalM3}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Package size={17} />
          </div>
        </div>

        <div className="bg-white p-2.5 px-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Locales</p>
            <p className="text-xl font-black text-indigo-700">{totalLocales}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <MapPin size={17} />
          </div>
        </div>

        <div className="bg-white p-2.5 px-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suma Peso (kg)</p>
            <p className="text-xl font-black text-amber-700">{totalPeso}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Weight size={17} />
          </div>
        </div>

        <div className="bg-white p-2.5 px-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cajas (CJ)</p>
            <p className="text-xl font-black text-blue-700">{totalCajas}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Layers size={17} />
          </div>
        </div>
      </div>

      {/* 4. Barra de Acciones Masivas Flotante (Cuando hay filas seleccionadas) */}
      {selectedTripKeys.length > 0 && (
        <div className="bg-[#132c54] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between gap-3 shrink-0 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full shadow-xs">
              {selectedTripKeys.length} seleccionados
            </span>
            <span className="text-xs text-slate-200 font-semibold hidden sm:inline">
              Acciones por lote:
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Asignación Masiva de Hora Cita */}
            <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-xl">
              <Clock size={13} className="text-amber-300" />
              <input
                type="text"
                placeholder="Ej: 06:00"
                value={batchHoraCita}
                onChange={e => setBatchHoraCita(e.target.value)}
                className="w-20 px-2 py-0.5 text-xs bg-slate-900 border border-slate-600 text-white rounded font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={handleApplyBatchHoraCita}
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs px-2 py-0.5 rounded transition-all shadow-xs"
              >
                Aplicar Hora
              </button>
            </div>

            {/* Asignación Masiva de Turno */}
            <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-xl">
              <span className="text-[11px] text-slate-200 font-semibold">Turno:</span>
              <select
                value={batchTurno}
                onChange={e => setBatchTurno(e.target.value)}
                className="text-xs bg-slate-900 border border-slate-600 text-white rounded py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
              >
                {TURNO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBatchTurno}
                disabled={!batchTurno}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs px-2 py-0.5 rounded transition-all shadow-xs"
              >
                Aplicar
              </button>
            </div>

            {/* Asignación Masiva de Prioridad */}
            <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-xl">
              <span className="text-[11px] text-slate-200 font-semibold">Prioridad:</span>
              <select
                value={batchPrioridad}
                onChange={e => setBatchPrioridad(e.target.value)}
                className="text-xs bg-slate-900 border border-slate-600 text-white rounded py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
              >
                <option value="">Seleccionar...</option>
                {PRIORIDAD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBatchPrioridad}
                disabled={!batchPrioridad}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs px-2 py-0.5 rounded transition-all shadow-xs"
              >
                Aplicar
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTripKeys([])}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 font-bold"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* 5. TABLA MATRIZ ENTERPRISE TIPO FOTO ADJUNTA */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        
        {/* Banner Superior Estilo Enterprise: ASIGNACIÓN DE RUTAS - [CLIENTE DINÁMICO] (Requisito 3) */}
        <div className="bg-[#132c54] text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-white flex items-center gap-2">
              <Truck size={20} className="text-amber-400" />
              ASIGNACIÓN DE RUTAS - {bannerClientTitle}
            </h2>
            <p className="text-xs text-amber-300 font-bold tracking-wide mt-0.5">
              Despacho {formatBannerDate(activeDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-white/10 text-white border border-white/20 text-xs px-2.5 py-1 rounded-xl font-bold">
              Base: Lago Riñihue 02319, San Bernardo
            </span>
          </div>
        </div>

        {/* Tabla con Scroll Horizontal y Vertical */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead className="bg-[#183564] text-white font-bold sticky top-0 z-20 text-[11px] uppercase tracking-wider shadow-sm select-none">
              <tr>
                <th className="px-3 py-2.5 w-10 text-center border-r border-[#22447c]">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="rounded text-amber-500 focus:ring-amber-400 cursor-pointer shrink-0"
                    title="Seleccionar todo"
                  />
                </th>
                <th className="px-3 py-2.5 border-r border-[#22447c] w-24">Fecha</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[130px]">Operación</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[100px] text-center font-mono">Ruta</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[110px]">Camión</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[100px] text-center">N° de vuelta</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[150px]">Conductor</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[130px]">Auxiliar</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] min-w-[340px]">Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] text-right min-w-[85px]">Vol Carga</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] text-center min-w-[105px]">Turno</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] text-center min-w-[105px]">Hora Cita</th>
                <th className="px-3 py-2.5 border-r border-[#22447c] text-center min-w-[125px]">Prioridad</th>
                <th className="px-3 py-2.5 text-center w-16">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tripsList.map((trip, idx) => {
                const isSelected = selectedTripKeys.includes(trip.key);
                const isPrioUrgente = trip.prioridad === 'Prioridad urgente';
                const isUrgente = trip.prioridad === 'Urgente';
                const isRedespacho = trip.prioridad === 'Redespacho';
                const hasPriorityBg = isPrioUrgente || isUrgente || isRedespacho;
                const isExpanded = !!expandedKeys[trip.key];

                // Fondo dinámico según Prioridad con Colores Pastel Solicitados:
                // 1. Rojo Pastel para 'Prioridad urgente' (#ffd6d6)
                // 2. Naranjo Pastel para 'Urgente' (#ffedd5)
                // 3. Amarillo Pastel para 'Redespacho' (#fef9c3)
                let rowBgClass = 'bg-white hover:bg-blue-50/50 text-slate-800';
                if (isPrioUrgente) {
                  rowBgClass = 'bg-[#ffd6d6] hover:bg-[#fecaca] text-[#7f1d1d] font-bold border-b border-[#fca5a5]';
                } else if (isUrgente) {
                  rowBgClass = 'bg-[#ffedd5] hover:bg-[#fed7aa] text-[#7c2d12] font-bold border-b border-[#fdba74]';
                } else if (isRedespacho) {
                  rowBgClass = 'bg-[#fef9c3] hover:bg-[#fef08a] text-[#713f12] font-semibold border-b border-[#fde047]';
                } else if (idx % 2 === 1) {
                  rowBgClass = 'bg-slate-50/60 hover:bg-blue-50/50 text-slate-800';
                }

                if (isSelected) {
                  rowBgClass += ' ring-1 ring-inset ring-blue-500';
                }

                return (
                  <React.Fragment key={trip.key}>
                    <tr className={`transition-colors text-xs ${rowBgClass}`}>
                      {/* 1. Checkbox */}
                      <td className="px-3 py-2.5 text-center border-r border-slate-200/80">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectTrip(trip.key)}
                          className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* 2. Fecha */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 font-mono text-[11px]">
                        {trip.fecha}
                      </td>

                      {/* 3. Operación */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 font-bold uppercase truncate max-w-[160px]" title={trip.operacionStr}>
                        {trip.operacionStr}
                      </td>

                      {/* 4. Ruta (ej. 1401+4305+4701) */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono font-black tracking-wider">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          isPrioUrgente
                            ? 'bg-[#fca5a5]/80 text-[#7f1d1d] font-black'
                            : isUrgente
                            ? 'bg-[#fdba74]/80 text-[#7c2d12] font-black'
                            : isRedespacho
                            ? 'bg-[#fde047]/80 text-[#713f12] font-black'
                            : 'bg-blue-100/80 text-blue-900 font-black'
                        }`}>
                          {trip.rutasStr}
                        </span>
                      </td>

                      {/* 5. Camión */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 font-semibold truncate max-w-[120px]" title={trip.camion}>
                        <div className="flex items-center gap-1">
                          <Truck size={13} className="text-slate-500 shrink-0" />
                          <span>{trip.camion}</span>
                        </div>
                      </td>

                      {/* 6. N° de vuelta (reemplaza Ruta 2da V) */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-bold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          trip.displayVuelta.includes('2') || trip.displayVuelta.includes('3')
                            ? 'bg-amber-200/80 text-amber-950 font-black'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {trip.displayVuelta}
                        </span>
                      </td>

                      {/* 7. Conductor */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 font-bold truncate max-w-[170px]" title={trip.conductor_name}>
                        {trip.conductor_name}
                      </td>

                      {/* 8. Auxiliar */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-slate-700 truncate max-w-[140px]" title={trip.auxiliares.join(', ')}>
                        {trip.auxiliares.length > 0 ? trip.auxiliares.join(', ') : '-'}
                      </td>

                      {/* 9. Zona: Detalle de Ruta, Cliente, Comuna Más Lejana, Locales, m³ + Destino Prioritario */}
                      <td className="px-3 py-2 border-r border-slate-200/80 max-w-[420px] whitespace-normal leading-relaxed">
                        <div className="space-y-1">
                          {trip.zonaItems.map((z, zIdx) => (
                            <div key={zIdx} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-blue-800 bg-white/70 px-1 py-0.2 rounded border border-slate-200 text-[10px]">
                                {z.ruta}
                              </span>
                              <span className="font-semibold">{z.cliente}</span>
                              <span className="text-slate-400">•</span>
                              <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                                📍 {z.comuna}
                              </span>
                              <span className="text-slate-400">•</span>
                              <span className="text-indigo-800 font-bold">{z.locales} LC</span>
                              <span className="text-slate-400">•</span>
                              <span className="font-mono font-bold text-emerald-800">{z.m3} m³</span>
                            </div>
                          ))}

                          {/* DESTINO PRIORITARIO DESTACADO */}
                          {trip.destino_prioritario && (
                            <div className="pt-0.5 flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-300 font-black text-[11px] px-2 py-0.5 rounded shadow-2xs">
                                <AlertTriangle size={12} className="text-red-600 shrink-0" />
                                🎯 Prioridad: {trip.destino_prioritario}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenPriorityModal(trip)}
                                className="text-[10px] text-blue-600 hover:text-blue-800 underline font-semibold"
                                title="Cambiar destino prioritario"
                              >
                                Editar
                              </button>
                            </div>
                          )}

                          {!trip.destino_prioritario && (
                            <div>
                              <button
                                type="button"
                                onClick={() => handleOpenPriorityModal(trip)}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-0.5 rounded border border-dashed border-slate-300 transition-colors"
                              >
                                <Star size={10} className="text-amber-500" />
                                + Destino Prioritario
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 10. Vol Carga (m³) */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-right font-mono font-black text-emerald-800 text-[12px]">
                        {trip.totalM3}
                      </td>

                      {/* 11. Turno (Dropdown del 1 al 10, 2da vuelta, 3ra vuelta, Nocturno, No aplica) */}
                      <td className="px-2 py-2 border-r border-slate-200/80 text-center">
                        <select
                          value={trip.turno}
                          onChange={e => handleUpdateTripField(trip.key, 'turno', e.target.value)}
                          className={`w-28 text-xs font-bold py-1 px-1.5 rounded-lg border focus:outline-none cursor-pointer transition-all ${
                            hasPriorityBg
                              ? 'bg-white/95 border-black/20 text-slate-900 shadow-xs'
                              : trip.turno
                              ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {TURNO_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* 12. Hora Cita (Input de texto libre editable) */}
                      <td className="px-2 py-2 border-r border-slate-200/80 text-center">
                        <input
                          type="text"
                          value={trip.hora_cita}
                          onChange={e => handleUpdateTripField(trip.key, 'hora_cita', e.target.value)}
                          placeholder="--:--"
                          className={`w-24 text-center text-xs font-mono font-bold py-1 px-1.5 rounded-lg border focus:outline-none transition-all ${
                            hasPriorityBg
                              ? 'bg-white/95 border-black/20 text-slate-900 focus:bg-white'
                              : trip.hora_cita
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-black'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 focus:bg-white focus:border-blue-500'
                          }`}
                        />
                      </td>

                      {/* 13. Prioridad (Dropdown: Normal, Prioridad urgente, Urgente, Redespacho con colores Pastel) */}
                      <td className="px-2 py-2 border-r border-slate-200/80 text-center">
                        <select
                          value={trip.prioridad}
                          onChange={e => handleUpdateTripField(trip.key, 'prioridad', e.target.value)}
                          className={`w-36 text-xs font-black py-1 px-2 rounded-lg border focus:outline-none cursor-pointer transition-all ${
                            isPrioUrgente
                              ? 'bg-[#ffd6d6] text-[#7f1d1d] border-[#fca5a5] shadow-xs'
                              : isUrgente
                              ? 'bg-[#ffedd5] text-[#7c2d12] border-[#fdba74] shadow-xs'
                              : isRedespacho
                              ? 'bg-[#fef9c3] text-[#713f12] border-[#fde047] shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {PRIORIDAD_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-white text-slate-900 font-semibold">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 14. Detalle de Paradas */}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(trip.key)}
                          className="p-1 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title={isExpanded ? 'Ocultar paradas' : 'Ver desglose de paradas'}
                        >
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </button>
                      </td>
                    </tr>

                    {/* Desglose de Paradas al expandir la fila */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan="14" className="p-3 border-b border-slate-300">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                                <MapPin size={14} className="text-blue-600" />
                                Desglose de Paradas y Locales para Viaje: {trip.rutasStr}
                              </span>
                              <span className="text-xs text-slate-500">
                                {trip.totalLocales} locales en total • {trip.totalM3} m³ • {trip.totalPeso} kg
                              </span>
                            </div>

                            <div className="space-y-3">
                              {trip.rutas.map(r => {
                                const paradas = r.paradas || [];
                                return (
                                  <div key={`trip-sub-r-${r.id}`} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-100/70 px-3 py-1.5 flex items-center justify-between text-xs font-semibold">
                                      <div className="flex items-center gap-2">
                                        <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px]">
                                          Ruta {r.ruta}
                                        </span>
                                        <span className="font-bold text-slate-900">{r.cliente}</span>
                                        {r.transportista && (
                                          <span className="bg-purple-100 text-purple-800 px-2 py-0.2 rounded text-[10px] font-bold">
                                            {r.transportista}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                                        <span>{paradas.length} paradas</span>
                                        <span>{r.locales} locales</span>
                                        <span className="font-mono font-bold text-emerald-700">{r.m3} m³</span>
                                      </div>
                                    </div>

                                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                        <tr>
                                          <th className="px-3 py-1 w-10">Sec</th>
                                          <th className="px-3 py-1 text-center">Ambiente</th>
                                          <th className="px-3 py-1">Destino</th>
                                          <th className="px-3 py-1">Dirección</th>
                                          <th className="px-3 py-1">Comuna</th>
                                          <th className="px-3 py-1">Horario</th>
                                          <th className="px-3 py-1 text-right">m³</th>
                                          <th className="px-3 py-1 text-right">Peso</th>
                                          <th className="px-3 py-1 text-right">CJ</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {paradas.map((p, pIdx) => (
                                          <tr key={pIdx} className="hover:bg-slate-50">
                                            <td className="px-3 py-1 text-slate-500 font-bold">{p.secuencia || pIdx + 1}</td>
                                            <td className="px-3 py-1 text-center">
                                              <AmbienteBadge ambiente={p.ambiente} />
                                            </td>
                                            <td className="px-3 py-1 font-bold text-slate-800">{p.destino}</td>
                                            <td className="px-3 py-1 text-slate-500">{p.direccion}</td>
                                            <td className="px-3 py-1 text-slate-600 font-semibold">{p.comuna}</td>
                                            <td className="px-3 py-1 text-slate-500 font-mono">
                                              {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                                            </td>
                                            <td className="px-3 py-1 text-right font-mono font-bold text-slate-700">{p.volumen}</td>
                                            <td className="px-3 py-1 text-right font-mono text-slate-600">{p.peso}</td>
                                            <td className="px-3 py-1 text-right font-mono text-slate-600">{p.cantCJ}</td>
                                          </tr>
                                        ))}
                                        {paradas.length === 0 && (
                                          <tr>
                                            <td colSpan="9" className="px-3 py-2 text-center text-slate-400 italic">
                                              Sin paradas desglosadas.
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {tripsList.length === 0 && (
                <tr>
                  <td colSpan="14" className="py-12 text-center text-slate-400 text-xs italic">
                    No hay viajes o rutas que coincidan con los filtros seleccionados para {activeDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. MODAL PARA SELECCIONAR DESTINO PRIORITARIO */}
      {priorityModalTrip && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <Star size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Destino Prioritario — Viaje {priorityModalTrip.rutasStr}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Selecciona un local prioritario o escribe un destino específico para resaltarlo en rojo.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPriorityModalTrip(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Input para texto personalizado */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Texto del Destino Prioritario:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ej: UAI PEÑALOLEN - USS LOS LEONES"
                  value={customPriorityText}
                  onChange={e => setCustomPriorityText(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-semibold"
                />
                <button
                  type="button"
                  onClick={() => handleSavePriorityDestination(customPriorityText.trim())}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* Lista de destinos sugeridos de las paradas del viaje */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                O selecciona de los locales de este viaje:
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {priorityModalTrip.rutas.flatMap(r => r.paradas || []).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCustomPriorityText(p.destino);
                      handleSavePriorityDestination(p.destino);
                    }}
                    className="w-full text-left p-2 rounded-lg bg-white border border-slate-200/80 hover:bg-red-50 hover:border-red-300 text-xs transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-bold text-slate-800 group-hover:text-red-700">{p.destino}</p>
                      <p className="text-[10px] text-slate-400">{p.comuna} • {p.direccion}</p>
                    </div>
                    <span className="text-[10px] text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Elegir ➔
                    </span>
                  </button>
                ))}

                {priorityModalTrip.rutas.flatMap(r => r.paradas || []).length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-4">
                    Este viaje no tiene paradas desglosadas. Escribe el texto arriba.
                  </p>
                )}
              </div>
            </div>

            {/* Botones de acción inferiores */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => handleSavePriorityDestination('')}
                className="text-xs text-slate-500 hover:text-red-600 border-dashed"
              >
                Quitar Prioridad
              </Button>
              <Button
                variant="outline"
                onClick={() => setPriorityModalTrip(null)}
                className="text-xs"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. POP-UP MODAL DE AUDITORÍA AL GUARDAR DISPONIBILIZACIÓN */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    Auditoría y Registro de Modificaciones — Ruteo
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
                <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                  <User size={13} className="text-blue-600 shrink-0" />
                  {auditData.usuario}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fecha Planificación</span>
                <span className="text-xs font-black text-blue-700 flex items-center gap-1 mt-0.5">
                  <Calendar size={13} className="shrink-0" />
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
                  onClick={confirmAuditAndSaveFromRuteo}
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

    </div>
  );
}
