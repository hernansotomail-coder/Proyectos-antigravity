import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Calendar, Search, Download, Clock, MapPin, 
  User, Truck, Layers, CheckCircle2, ChevronDown, ChevronRight,
  FileSpreadsheet, ArrowRight, History, X, Check, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

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
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
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

export default function HistoricalAssignment() {
  const { savedHistoryList, savedRuteoByDate } = usePlanningStore();

  // Fechas disponibles en el historial
  const historyDates = useMemo(() => {
    const set = new Set();
    savedHistoryList.forEach(h => set.add(h.fecha));
    Object.keys(savedRuteoByDate || {}).forEach(f => set.add(f));
    return Array.from(set).sort().reverse();
  }, [savedHistoryList, savedRuteoByDate]);

  const [selectedDate, setSelectedDate] = useState(historyDates[0] || '14-10-2026');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});

  // FILTROS MULTI-SELECCIÓN (Requisito 5: Conductor, Auxiliar, N° de Ruta, Camión y N° de vuelta)
  const [selectedConductores, setSelectedConductores] = useState([]);
  const [selectedAuxiliares, setSelectedAuxiliares] = useState([]);
  const [selectedRutas, setSelectedRutas] = useState([]);
  const [selectedCamiones, setSelectedCamiones] = useState([]);
  const [selectedVueltas, setSelectedVueltas] = useState([]);

  // Filas base de la fecha seleccionada
  const activeRecords = useMemo(() => {
    const histEntry = savedHistoryList.find(h => h.fecha === selectedDate);
    if (histEntry && histEntry.rows) {
      return histEntry.rows;
    }
    return savedRuteoByDate[selectedDate] || [];
  }, [savedHistoryList, savedRuteoByDate, selectedDate]);

  // Listas de opciones para los multi-filtros
  const conductoresList = useMemo(() => {
    const set = new Set(activeRecords.map(r => r.conductor_name || 'Sin Conductor').filter(Boolean));
    return Array.from(set).sort();
  }, [activeRecords]);

  const auxiliaresList = useMemo(() => {
    const set = new Set();
    activeRecords.forEach(r => {
      if (r.aux1_name) set.add(r.aux1_name);
      if (r.aux2_name) set.add(r.aux2_name);
    });
    if (activeRecords.some(r => !r.aux1_name && !r.aux2_name)) {
      set.add('Sin Auxiliar');
    }
    return Array.from(set).sort();
  }, [activeRecords]);

  const rutasList = useMemo(() => {
    const set = new Set(activeRecords.map(r => String(r.ruta || '')).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [activeRecords]);

  const camionesList = useMemo(() => {
    const set = new Set(activeRecords.map(r => r.camion || 'Sin Camión').filter(Boolean));
    return Array.from(set).sort();
  }, [activeRecords]);

  const vueltasList = useMemo(() => {
    const set = new Set();
    activeRecords.forEach(r => {
      if (r.n_vuelta) set.add(`Vuelta ${r.n_vuelta}`);
      else set.add('Sin Vuelta');
    });
    return Array.from(set).sort();
  }, [activeRecords]);

  // Registros filtrados aplicando los 5 multi-filtros y búsqueda libre
  const filteredRecords = useMemo(() => {
    return activeRecords.filter(r => {
      // 1. Conductor
      if (selectedConductores.length > 0) {
        const cName = r.conductor_name || 'Sin Conductor';
        if (!selectedConductores.includes(cName)) return false;
      }
      // 2. Auxiliar
      if (selectedAuxiliares.length > 0) {
        const hasAux1 = r.aux1_name && selectedAuxiliares.includes(r.aux1_name);
        const hasAux2 = r.aux2_name && selectedAuxiliares.includes(r.aux2_name);
        const isSinAux = !r.aux1_name && !r.aux2_name && selectedAuxiliares.includes('Sin Auxiliar');
        if (!hasAux1 && !hasAux2 && !isSinAux) return false;
      }
      // 3. N° de Ruta
      if (selectedRutas.length > 0) {
        const rVal = String(r.ruta || '');
        if (!selectedRutas.includes(rVal)) return false;
      }
      // 4. Camión
      if (selectedCamiones.length > 0) {
        const camVal = r.camion || 'Sin Camión';
        if (!selectedCamiones.includes(camVal)) return false;
      }
      // 5. N° de Vuelta
      if (selectedVueltas.length > 0) {
        const vVal = r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta';
        if (!selectedVueltas.includes(vVal)) return false;
      }
      // Búsqueda libre por texto
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchCond = (r.conductor_name || '').toLowerCase().includes(lower);
        const matchAux = (r.aux1_name || '').toLowerCase().includes(lower) || (r.aux2_name || '').toLowerCase().includes(lower);
        const matchCam = (r.camion || '').toLowerCase().includes(lower);
        const matchRuta = String(r.ruta || '').includes(lower);
        const matchCliente = (r.cliente || '').toLowerCase().includes(lower);
        if (!matchCond && !matchAux && !matchCam && !matchRuta && !matchCliente) return false;
      }
      return true;
    });
  }, [activeRecords, selectedConductores, selectedAuxiliares, selectedRutas, selectedCamiones, selectedVueltas, searchTerm]);

  // Agrupado por Conductor + Vuelta
  const groupedHistory = useMemo(() => {
    const map = new Map();

    filteredRecords.forEach(row => {
      const conductor = row.conductor_name || 'Sin Conductor';
      const vuelta = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';
      const key = `${conductor}:::${vuelta}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          conductor,
          conductor_rut: row.conductor_rut || '',
          vuelta,
          camion: row.camion || 'Sin camión',
          tipo_equipo: row.tipo_equipo || '',
          rampla: row.rampla || '',
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
      if (row.aux1_name && !g.auxiliares.includes(row.aux1_name)) g.auxiliares.push(row.aux1_name);
      if (row.aux2_name && !g.auxiliares.includes(row.aux2_name)) g.auxiliares.push(row.aux2_name);
      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [filteredRecords]);

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const hasActiveFilters = selectedConductores.length > 0 ||
    selectedAuxiliares.length > 0 ||
    selectedRutas.length > 0 ||
    selectedCamiones.length > 0 ||
    selectedVueltas.length > 0 ||
    searchTerm !== '';

  const handleResetFilters = () => {
    setSelectedConductores([]);
    setSelectedAuxiliares([]);
    setSelectedRutas([]);
    setSelectedCamiones([]);
    setSelectedVueltas([]);
    setSearchTerm('');
  };

  // Totales
  const totalM3 = filteredRecords.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(2);
  const totalLocales = filteredRecords.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
  const totalPeso = filteredRecords.reduce((acc, r) => acc + (parseFloat(r.peso) || 0), 0).toFixed(2);
  const totalViajes = groupedHistory.length;

  // Exportar Excel
  const handleExport = () => {
    const recordsToExport = filteredRecords.length > 0 ? filteredRecords : activeRecords;
    if (recordsToExport.length === 0) {
      toast.error('No hay registros históricos para exportar.');
      return;
    }

    try {
      const rows = [];
      recordsToExport.forEach(r => {
        const paradas = r.paradas || [];
        if (paradas.length > 0) {
          paradas.forEach(p => {
            rows.push({
              'Fecha': r.fecha,
              'N° Vuelta': r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta',
              'N° Ruta': r.ruta,
              'Cliente': r.cliente,
              'Conductor': r.conductor_name || 'Sin asignar',
              'RUT Conductor': r.conductor_rut || '',
              'Auxiliar 1': r.aux1_name || '',
              'RUT Auxiliar 1': r.aux1_rut || '',
              'Auxiliar 2': r.aux2_name || '',
              'RUT Auxiliar 2': r.aux2_rut || '',
              'Camión': r.camion || '',
              'Tipo Equipo': r.tipo_equipo || '',
              'Rampla': r.rampla || '',
              'Secuencia': p.secuencia,
              'Destino': p.destino,
              'Dirección': p.direccion,
              'Comuna': p.comuna,
              'Horario': p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '',
              'm³': p.volumen,
              'Peso (kg)': p.peso,
              'Cajas (CJ)': p.cantCJ
            });
          });
        } else {
          rows.push({
            'Fecha': r.fecha,
            'N° Vuelta': r.n_vuelta ? `Vuelta ${r.n_vuelta}` : 'Sin Vuelta',
            'N° Ruta': r.ruta,
            'Cliente': r.cliente,
            'Conductor': r.conductor_name || 'Sin asignar',
            'RUT Conductor': r.conductor_rut || '',
            'Auxiliar 1': r.aux1_name || '',
            'RUT Auxiliar 1': r.aux1_rut || '',
            'Auxiliar 2': r.aux2_name || '',
            'RUT Auxiliar 2': r.aux2_rut || '',
            'Camión': r.camion || '',
            'Tipo Equipo': r.tipo_equipo || '',
            'Rampla': r.rampla || '',
            'm³': r.m3,
            'Peso (kg)': r.peso || 0,
            'Locales': r.locales
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Histórico Disponibilización');
      XLSX.writeFile(wb, `Historico_Disponibilizacion_${selectedDate}.xlsx`);
      toast.success(`Excel histórico generado correctamente (${rows.length} filas).`);
    } catch (err) {
      console.error(err);
      toast.error('Error al generar Excel.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-3 overflow-hidden">
      
      {/* 1. Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Transporte
            </span>
            <h1 className="text-xl font-bold text-slate-800">Histórico de Disponibilización</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro auditable de todas las disponibilizaciones guardadas y confirmadas en la operación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm"
          >
            <Download size={15} />
            Exportar Histórico
          </Button>
        </div>
      </div>

      {/* 2. Barra de Filtros: Selector de Fecha + Multi-Filtros (Conductor, Auxiliar, N° de Ruta, Camión, N° de vuelta) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-col gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-blue-800 uppercase tracking-wide">
                Fecha Guardada
              </span>
              <select 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                {historyDates.length > 0 ? (
                  historyDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))
                ) : (
                  <option value={selectedDate}>{selectedDate}</option>
                )}
              </select>
            </div>
          </div>

          {/* 1. Multi-Filtro Conductor */}
          <MultiSelectFilter
            label="Conductor"
            options={conductoresList}
            selectedValues={selectedConductores}
            onChange={setSelectedConductores}
            placeholder="Todos los Conductores"
          />

          {/* 2. Multi-Filtro Auxiliar */}
          <MultiSelectFilter
            label="Auxiliar"
            options={auxiliaresList}
            selectedValues={selectedAuxiliares}
            onChange={setSelectedAuxiliares}
            placeholder="Todos los Auxiliares"
          />

          {/* 3. Multi-Filtro N° de Ruta */}
          <MultiSelectFilter
            label="N° de Ruta"
            options={rutasList}
            selectedValues={selectedRutas}
            onChange={setSelectedRutas}
            placeholder="Todas las Rutas"
          />

          {/* 4. Multi-Filtro Camión */}
          <MultiSelectFilter
            label="Camión"
            options={camionesList}
            selectedValues={selectedCamiones}
            onChange={setSelectedCamiones}
            placeholder="Todos los Camiones"
          />

          {/* 5. Multi-Filtro N° de Vuelta */}
          <MultiSelectFilter
            label="N° de Vuelta"
            options={vueltasList}
            selectedValues={selectedVueltas}
            onChange={setSelectedVueltas}
            placeholder="Todas las Vueltas"
          />

          {/* Buscador de texto rápido */}
          <div className="relative flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Búsqueda Rápida
            </span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl w-40 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

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

        {/* Resumen de KPIs Dinámicos */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">
            Mostrando <strong className="text-slate-800">{filteredRecords.length}</strong> rutas en <strong className="text-slate-800">{totalViajes}</strong> viajes
          </span>
          <div className="flex items-center gap-4 text-xs">
            <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
            <span>Peso: <strong className="text-amber-700">{totalPeso} kg</strong></span>
            <span>Total m³: <strong className="text-emerald-700 font-mono font-bold">{totalM3}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Listado de Servicios Guardados */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Detalle de Disponibilizaciones — {selectedDate}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Haz clic en cualquier viaje para ver el desglose de paradas y destinos.
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2.5">
          {groupedHistory.map(group => {
            const isExpanded = !!expandedKeys[group.key];
            return (
              <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {/* Header Viaje */}
                <div 
                  onClick={() => toggleExpand(group.key)}
                  className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2 transition-colors select-none"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-blue-600">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>

                    {/* Conductor */}
                    <span className="font-black text-slate-800 text-sm">{group.conductor}</span>
                    {group.conductor_rut && <span className="text-slate-400 font-mono text-[10px]">({group.conductor_rut})</span>}
                    
                    {/* Auxiliar al lado del Conductor (Requisito 4) */}
                    {group.auxiliares && group.auxiliares.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                        <User size={11} className="text-indigo-600" />
                        Aux: {group.auxiliares.join(', ')}
                      </span>
                    )}

                    {/* Camión */}
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                      <Truck size={12} /> {group.camion}
                    </span>

                    {/* Rampla si existe */}
                    {group.rampla && (
                      <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded text-[11px]">
                        Rampla: {group.rampla}
                      </span>
                    )}

                    {/* N° de vuelta */}
                    <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded text-[11px]">
                      {group.vuelta}
                    </span>

                    {/* Rutas */}
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
                        <div key={`hist-sub-${r.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                          <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-800 text-white font-bold px-2 py-0.5 rounded text-[10px]">
                                Ruta {r.ruta}
                              </span>
                              <span className="font-bold text-slate-800">
                                {r.cliente}
                              </span>
                              {(r.aux1_name || r.aux2_name) && (
                                <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                                  Aux: {[r.aux1_name, r.aux2_name].filter(Boolean).join(', ')}
                                </span>
                              )}
                              {r.tipo_servicio && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                                  {r.tipo_servicio}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span>{paradas.length} paradas</span>
                              <span>{r.peso} kg</span>
                              <span className="font-mono font-bold text-emerald-700">{r.m3} m³</span>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] whitespace-nowrap">
                              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-1 w-10">Sec</th>
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
                                {paradas.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-1 text-slate-500 font-bold">{p.secuencia || idx + 1}</td>
                                    <td className="px-3 py-1 font-bold text-slate-800">{p.destino}</td>
                                    <td className="px-3 py-1 text-slate-500">{p.direccion}</td>
                                    <td className="px-3 py-1 text-slate-600">{p.comuna}</td>
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
                                    <td colSpan="8" className="px-3 py-2 text-center text-slate-400 italic">
                                      Sin paradas registradas.
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

          {groupedHistory.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs italic">
              No hay registros históricos encontrados para los filtros seleccionados en {selectedDate}.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
