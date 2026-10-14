import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Download, Calendar, Search, Filter, Layers, 
  MapPin, User, Truck, Package, Weight, CheckCircle2,
  ChevronDown, ChevronRight, ArrowUpDown, FileSpreadsheet, RefreshCw, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore, ensureRowTransportista } from '../store/planningStore';
import { Button } from './ui/Button';
import { AmbienteBadge } from './DailyPlanning';

// COMPONENTE MULTI-SELECT DROPDOWN REUTILIZABLE
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
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border transition-all text-left min-w-[140px] max-w-[210px] ${
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
          {/* Header con acciones */}
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

          {/* Buscador interno si hay más de 5 opciones */}
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

          {/* Lista de opciones seleccionables */}
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

export default function RuteoView() {
  const { 
    savedRuteoByDate, 
    transmittedAssignments, 
    selectedRuteoDate, 
    setSelectedRuteoDate 
  } = usePlanningStore();

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const setDates = new Set([
      ...Object.keys(savedRuteoByDate || {}),
      ...Object.keys(transmittedAssignments || {})
    ]);
    return Array.from(setDates).sort();
  }, [savedRuteoByDate, transmittedAssignments]);

  const activeDate = selectedRuteoDate || availableDates[0] || '14-10-2026';

  // Rutas de la fecha activa (con fallback automático a ensureRowTransportista)
  const currentRoutes = useMemo(() => {
    let routes = [];
    if (savedRuteoByDate && savedRuteoByDate[activeDate] && savedRuteoByDate[activeDate].length > 0) {
      routes = savedRuteoByDate[activeDate];
    } else {
      routes = transmittedAssignments[activeDate] || [];
    }
    return routes.map(r => ({
      ...r,
      transportista: r.transportista || ensureRowTransportista(r)
    }));
  }, [savedRuteoByDate, transmittedAssignments, activeDate]);

  // FILTROS MULTI-SELECCIÓN (Permiten seleccionar más de 1 opción)
  const [selectedTransportistas, setSelectedTransportistas] = useState([]);
  const [selectedClientes, setSelectedClientes] = useState([]);
  const [selectedRutas, setSelectedRutas] = useState([]);
  const [selectedConductores, setSelectedConductores] = useState([]);
  const [selectedAuxiliares, setSelectedAuxiliares] = useState([]);
  const [selectedVueltas, setSelectedVueltas] = useState([]);
  
  const [expandedKeys, setExpandedKeys] = useState({});

  // Listas únicas de opciones para los filtros multi-selección
  const transportistasList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.transportista || 'Sin Transportista').filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  const clientesList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.cliente || 'Sin Cliente').filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  const rutasList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => String(r.ruta || '')).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [currentRoutes]);

  const conductoresList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.conductor_name || 'Sin Asignar').filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  const auxiliaresList = useMemo(() => {
    const set = new Set();
    currentRoutes.forEach(r => {
      if (r.aux1_name) set.add(r.aux1_name);
      if (r.aux2_name) set.add(r.aux2_name);
    });
    return Array.from(set).sort();
  }, [currentRoutes]);

  const vueltasList = useMemo(() => {
    const set = new Set();
    currentRoutes.forEach(r => {
      if (r.n_vuelta) set.add(`Vuelta ${r.n_vuelta}`);
      else set.add('Sin Vuelta');
    });
    return Array.from(set).sort();
  }, [currentRoutes]);

  // Rutas filtradas aplicando todos los filtros multi-select
  const filteredRoutes = useMemo(() => {
    return currentRoutes.filter(r => {
      // 1. Filtro Transportista
      if (selectedTransportistas.length > 0) {
        const tVal = r.transportista || 'Sin Transportista';
        if (!selectedTransportistas.includes(tVal)) return false;
      }
      // 2. Filtro Cliente
      if (selectedClientes.length > 0) {
        const cVal = r.cliente || 'Sin Cliente';
        if (!selectedClientes.includes(cVal)) return false;
      }
      // 3. Filtro Ruta
      if (selectedRutas.length > 0) {
        const rVal = String(r.ruta || '');
        if (!selectedRutas.includes(rVal)) return false;
      }
      // 4. Filtro Conductor
      if (selectedConductores.length > 0) {
        const condVal = r.conductor_name || 'Sin Asignar';
        if (!selectedConductores.includes(condVal)) return false;
      }
      // 5. Filtro Auxiliar
      if (selectedAuxiliares.length > 0) {
        const hasAux = (r.aux1_name && selectedAuxiliares.includes(r.aux1_name)) ||
                      (r.aux2_name && selectedAuxiliares.includes(r.aux2_name));
        if (!hasAux) return false;
      }
      // 6. Filtro Vuelta
      if (selectedVueltas.length > 0) {
        const vLabel = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
        if (!selectedVueltas.includes(vLabel)) return false;
      }
      return true;
    });
  }, [currentRoutes, selectedTransportistas, selectedClientes, selectedRutas, selectedConductores, selectedAuxiliares, selectedVueltas]);

  // AGRUPACIÓN POR CONDUCTOR + N° DE VUELTA
  const groupedSummary = useMemo(() => {
    const map = new Map();

    filteredRoutes.forEach(row => {
      const conductor = row.conductor_name || 'Sin Conductor';
      const vueltaLabel = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';
      const key = `${conductor}:::${vueltaLabel}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          conductor,
          conductor_rut: row.conductor_rut || '',
          vuelta: row.n_vuelta || '',
          vueltaLabel,
          camion: row.camion || 'Sin camión',
          tipo_equipo: row.tipo_equipo || '',
          rampla: row.rampla || '',
          transportista: row.transportista || '',
          auxiliares: [row.aux1_name, row.aux2_name].filter(Boolean),
          totalM3: 0,
          totalPeso: 0,
          totalLocales: 0,
          totalCajas: 0,
          rutas: []
        });
      }

      const g = map.get(key);
      g.totalM3 += parseFloat(row.m3) || 0;
      g.totalPeso += parseFloat(row.peso) || 0;
      g.totalLocales += parseInt(row.locales, 10) || 0;
      g.totalCajas += parseInt(row.cantCJ, 10) || 0;
      if (row.camion && g.camion === 'Sin camión') g.camion = row.camion;
      if (row.transportista && !g.transportista) g.transportista = row.transportista;
      if (row.aux1_name && !g.auxiliares.includes(row.aux1_name)) g.auxiliares.push(row.aux1_name);
      if (row.aux2_name && !g.auxiliares.includes(row.aux2_name)) g.auxiliares.push(row.aux2_name);

      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [filteredRoutes]);

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // TOTALES DINÁMICOS: m³, Locales, Suma de Peso (kg), Cajas (CJ)
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

  const hasActiveFilters = selectedTransportistas.length > 0 || 
    selectedClientes.length > 0 || 
    selectedRutas.length > 0 || 
    selectedConductores.length > 0 || 
    selectedAuxiliares.length > 0 || 
    selectedVueltas.length > 0;

  const handleResetFilters = () => {
    setSelectedTransportistas([]);
    setSelectedClientes([]);
    setSelectedRutas([]);
    setSelectedConductores([]);
    setSelectedAuxiliares([]);
    setSelectedVueltas([]);
  };

  // EXPORTAR A EXCEL (con columna Transportista incluida)
  const handleExportExcel = () => {
    if (filteredRoutes.length === 0) {
      toast.error('No hay datos en la tabla para exportar.');
      return;
    }

    try {
      const exportRows = [];

      filteredRoutes.forEach(r => {
        const paradas = r.paradas || [];
        if (paradas.length > 0) {
          paradas.forEach(p => {
            exportRows.push({
              'Fecha': r.fecha,
              'Transportista': r.transportista || p.transportista || 'Sin Transportista',
              'N° de Vuelta': r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta',
              'N° de Ruta': r.ruta,
              'Cliente / Nombre Ruta': r.cliente,
              'Conductor': r.conductor_name || 'Sin asignar',
              'RUT Conductor': r.conductor_rut || '',
              'Auxiliar 1': r.aux1_name || '',
              'Auxiliar 2': r.aux2_name || '',
              'Camión': r.camion || '',
              'Tipo de Equipo': r.tipo_equipo || '',
              'Rampla': r.rampla || '',
              'Tipo de Servicio': r.tipo_servicio || '',
              'Secuencia': p.secuencia,
              'Destino': p.destino,
              'Dirección': p.direccion,
              'Comuna': p.comuna,
              'Horario': p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '',
              'm³': p.volumen,
              'Peso (kg)': p.peso,
              'Cajas (CJ)': p.cantCJ,
              'Referencia': r.referencia || ''
            });
          });
        } else {
          exportRows.push({
            'Fecha': r.fecha,
            'Transportista': r.transportista || 'Sin Transportista',
            'N° de Vuelta': r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta',
            'N° de Ruta': r.ruta,
            'Cliente / Nombre Ruta': r.cliente,
            'Conductor': r.conductor_name || 'Sin asignar',
            'RUT Conductor': r.conductor_rut || '',
            'Camión': r.camion || '',
            'm³': r.m3,
            'Peso (kg)': r.peso || 0,
            'Locales': r.locales,
            'Cajas (CJ)': r.cantCJ || 0,
            'Referencia': r.referencia || ''
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ruteo Filtrado');
      XLSX.writeFile(wb, `Reporte_Ruteo_${activeDate}.xlsx`);

      toast.success(`Reporte Excel generado con éxito (${exportRows.length} filas exportadas).`);
    } catch (err) {
      console.error(err);
      toast.error('Error al generar archivo Excel.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* 1. Header Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800">Ruteo</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Arma tu reporte personalizado con filtros de Transportista, Cliente, Conductor y Ruta con multi-selección, y descárgalo en Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-all"
          >
            <Download size={15} />
            Exportar Reporte Excel
          </Button>
        </div>
      </div>

      {/* 2. Barra de Filtros Dinámicos Multi-Selección */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        <div className="flex items-center gap-3 flex-wrap">
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

          {/* 1. Multi-Filtro Transportista (Requisito 1) */}
          <MultiSelectFilter
            label="Transportista"
            options={transportistasList}
            selectedValues={selectedTransportistas}
            onChange={setSelectedTransportistas}
            placeholder="Todos los Transportistas"
          />

          {/* 2. Multi-Filtro Cliente */}
          <MultiSelectFilter
            label="Cliente"
            options={clientesList}
            selectedValues={selectedClientes}
            onChange={setSelectedClientes}
            placeholder="Todos los Clientes"
          />

          {/* 3. Multi-Filtro N° de Ruta */}
          <MultiSelectFilter
            label="N° de Ruta"
            options={rutasList}
            selectedValues={selectedRutas}
            onChange={setSelectedRutas}
            placeholder="Todas las Rutas"
          />

          {/* 4. Multi-Filtro Conductor */}
          <MultiSelectFilter
            label="Conductor"
            options={conductoresList}
            selectedValues={selectedConductores}
            onChange={setSelectedConductores}
            placeholder="Todos los Conductores"
          />

          {/* 5. Multi-Filtro Auxiliar */}
          <MultiSelectFilter
            label="Auxiliar"
            options={auxiliaresList}
            selectedValues={selectedAuxiliares}
            onChange={setSelectedAuxiliares}
            placeholder="Todos los Auxiliares"
          />

          {/* 6. Multi-Filtro Vuelta */}
          <MultiSelectFilter
            label="N° de Vuelta"
            options={vueltasList}
            selectedValues={selectedVueltas}
            onChange={setSelectedVueltas}
            placeholder="Todas las Vueltas"
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
          <span className="text-xs text-slate-600 font-bold bg-slate-100 px-2.5 py-1 rounded-xl">
            {filteredRoutes.length} rutas filtradas ({groupedSummary.length} viajes)
          </span>
        </div>
      </div>

      {/* 3. Tarjetas de Totales Solicitadas: m³, Locales, Suma de Peso (kg), Cajas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total m³</p>
            <p className="text-2xl font-black text-emerald-700">{totalM3}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Package size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Locales</p>
            <p className="text-2xl font-black text-indigo-700">{totalLocales}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <MapPin size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suma de Peso (kg)</p>
            <p className="text-2xl font-black text-amber-700">{totalPeso}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Weight size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cajas (CJ)</p>
            <p className="text-2xl font-black text-blue-700">{totalCajas}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Layers size={20} />
          </div>
        </div>
      </div>

      {/* 4. Tabla de Ruteo: Formato Idéntico a Resumen de Asignación por Ruta con desglose y paradas */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Tabla Consolidada de Ruteo — {activeDate}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Pulsa en cualquier conductor para ver el desglose de paradas, destinos y transportista.
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {groupedSummary.map(group => {
            const isExpanded = !!expandedKeys[group.key];
            return (
              <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {/* Fila Encabezado por Conductor y Vuelta */}
                <div 
                  onClick={() => toggleExpand(group.key)}
                  className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-3.5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2 transition-colors select-none"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-blue-600">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>

                    <span className="font-black text-slate-800 text-sm">{group.conductor}</span>
                    {group.conductor_rut && <span className="text-slate-400 font-mono text-[10px]">({group.conductor_rut})</span>}

                    {/* Auxiliar al lado de Conductor */}
                    {group.auxiliares && group.auxiliares.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                        <User size={11} className="text-indigo-600" />
                        Aux: {group.auxiliares.join(', ')}
                      </span>
                    )}

                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                      <Truck size={12} /> {group.camion}
                    </span>

                    {group.rampla && (
                      <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded text-[11px]">
                        Rampla: {group.rampla}
                      </span>
                    )}

                    <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded text-[11px]">
                      {group.vueltaLabel}
                    </span>

                    {group.transportista && (
                      <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[11px]">
                        Transp: {group.transportista}
                      </span>
                    )}

                    <span className="text-slate-400 text-[11px]">
                      [{group.rutas.map(r => `Ruta ${r.ruta}`).join(', ')}]
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-600">Locales: <strong className="text-indigo-700">{group.totalLocales}</strong></span>
                    <span className="text-slate-600">Peso: <strong className="text-amber-700">{group.totalPeso} kg</strong></span>
                    <span className="text-slate-600 font-mono font-black text-emerald-700 text-sm">{group.totalM3} m³</span>
                  </div>
                </div>

                {/* Desglose de Paradas al expandir */}
                {isExpanded && (
                  <div className="p-3 bg-slate-50/30 space-y-3">
                    {group.rutas.map(r => {
                      const paradas = r.paradas || [];
                      return (
                        <div key={`ruteo-route-${r.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                          <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-800 text-white font-bold px-2 py-0.5 rounded text-[10px]">
                                N° de Ruta {r.ruta}
                              </span>
                              <span className="font-bold text-slate-800">{r.cliente}</span>
                              {(r.aux1_name || r.aux2_name) && (
                                <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                                  Aux: {[r.aux1_name, r.aux2_name].filter(Boolean).join(', ')}
                                </span>
                              )}
                              {r.transportista && (
                                <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                  Transportista: {r.transportista}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span>{paradas.length} paradas</span>
                              <span>{r.locales} locales</span>
                              <span>{r.peso} kg</span>
                              <span className="font-mono font-bold text-emerald-700">{r.m3} m³</span>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] whitespace-nowrap">
                              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-1 w-10">Sec</th>
                                  <th className="px-3 py-1 text-center">Ambiente</th>
                                  <th className="px-3 py-1">Destino</th>
                                  <th className="px-3 py-1">Dirección</th>
                                  <th className="px-3 py-1">Comuna</th>
                                  <th className="px-3 py-1">Transportista</th>
                                  <th className="px-3 py-1">Horario</th>
                                  <th className="px-3 py-1 text-right">m³</th>
                                  <th className="px-3 py-1 text-right">Peso</th>
                                  <th className="px-3 py-1 text-right">CJ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {paradas.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-1 text-slate-500 font-bold">{p.secuencia || idx + 1}</td>
                                    <td className="px-3 py-1 text-center">
                                      <AmbienteBadge ambiente={p.ambiente} />
                                    </td>
                                    <td className="px-3 py-1 font-bold text-slate-800">{p.destino}</td>
                                    <td className="px-3 py-1 text-slate-500">{p.direccion}</td>
                                    <td className="px-3 py-1 text-slate-600">{p.comuna}</td>
                                    <td className="px-3 py-1 text-purple-700 font-semibold">{p.transportista || r.transportista || '-'}</td>
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
                                      Sin paradas detalladas.
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
            <div className="p-12 text-center text-slate-400 text-xs italic">
              No hay rutas que coincidan con los filtros seleccionados para {activeDate}.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
