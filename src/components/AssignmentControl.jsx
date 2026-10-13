import React, { useState, useEffect, useMemo } from 'react';
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
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

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

export default function AssignmentControl() {
  const navigate = useNavigate();
  const { staffList, fetchStaff } = useStaffStore();
  const { fleetList, fetchFleet } = useFleetStore();
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

  useEffect(() => {
    fetchStaff();
    fetchFleet();
  }, [fetchStaff, fetchFleet]);

  useEffect(() => {
    if (!selectedDisponibilizarDate && availableDates.length > 0) {
      setSelectedDisponibilizarDate(availableDates[0]);
    }
  }, [availableDates, selectedDisponibilizarDate, setSelectedDisponibilizarDate]);

  // Tabs y estados
  const [activeTabStaff, setActiveTabStaff] = useState('conductores'); // 'conductores' | 'auxiliares'
  const [activeTabTrucks, setActiveTabTrucks] = useState('camiones'); // 'camiones' | 'tractos' | 'semirremolques'
  
  const [sortVueltasAsc, setSortVueltasAsc] = useState(false);
  const [sortTrucksAsc, setSortTrucksAsc] = useState(false);
  
  const [selectedStaffMember, setSelectedStaffMember] = useState(null);
  const [selectedTruckObject, setSelectedTruckObject] = useState(null);
  
  const [staffSearch, setStaffSearch] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  
  // Multi-selection de filas
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [quickVuelta, setQuickVuelta] = useState('1');

  // Filtros de búsqueda en la matriz
  const [matrixFilterRuta, setMatrixFilterRuta] = useState('');
  const [matrixFilterCliente, setMatrixFilterCliente] = useState('');
  const [matrixFilterEstado, setMatrixFilterEstado] = useState('Todos');

  // Pop-up modal de confirmación al guardar
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [incompleteRoutesList, setIncompleteRoutesList] = useState([]);

  // Filas expandidas en el Resumen inferior (por clave Conductor:::Vuelta)
  const [expandedSummaryKeys, setExpandedSummaryKeys] = useState({});

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

  // Dotación activa
  const { conductores, auxiliares } = useMemo(() => {
    const activeStaff = (staffList || []).filter(s => {
      if (!s) return false;
      const isActive = s.status === 'Activo' || !s.status;
      const sName = (s.name || '').toLowerCase();
      const sRut = (s.rut || '').toLowerCase();
      const search = (staffSearch || '').toLowerCase();
      return isActive && (sName.includes(search) || sRut.includes(search));
    });
    
    const conds = activeStaff.filter(s => (s.role || '').toLowerCase().includes('conductor')).map(c => ({
      ...c, viajes: (c.name ? viajesPorPersona[c.name] : 0) || 0
    }));
    const auxs = activeStaff.filter(s => {
      const r = (s.role || '').toLowerCase();
      return r.includes('auxiliar') || r.includes('movilizador') || !r.includes('conductor');
    }).map(a => ({
      ...a, viajes: (a.name ? viajesPorPersona[a.name] : 0) || 0
    }));

    const sortByViajes = (a, b) => sortVueltasAsc ? a.viajes - b.viajes : b.viajes - a.viajes;
    return {
      conductores: conds.sort(sortByViajes),
      auxiliares: auxs.sort(sortByViajes)
    };
  }, [staffList, sortVueltasAsc, staffSearch, viajesPorPersona]);

  // Camiones clasificados en 3 categorías: Camión/Camioneta, Tracto, Semirremolque
  const { camionesList, tractosList, semirremolquesList } = useMemo(() => {
    const activeTrucks = fleetList
      .filter(t => t.status === 'Activo' || !t.status)
      .filter(t => 
        (t.internal_number || '').toLowerCase().includes(truckSearch.toLowerCase()) || 
        (t.plate || '').toLowerCase().includes(truckSearch.toLowerCase()) ||
        (t.brand || '').toLowerCase().includes(truckSearch.toLowerCase())
      )
      .map(t => {
        const identifier = t.internal_number ? `${t.internal_number} (${t.plate})` : t.plate;
        const vCount = viajesPorCamion[identifier] || viajesPorCamion[t.plate] || viajesPorCamion[t.internal_number] || 0;
        return {
          ...t,
          identifier,
          viajes: vCount
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
  }, [fleetList, sortTrucksAsc, truckSearch, viajesPorCamion]);

  // Filas filtradas de la matriz
  const filteredAssignments = useMemo(() => {
    return assignmentsForDate.filter(a => {
      if (matrixFilterRuta && !String(a.ruta).toLowerCase().includes(matrixFilterRuta.toLowerCase())) return false;
      if (matrixFilterCliente && !String(a.cliente).toLowerCase().includes(matrixFilterCliente.toLowerCase())) return false;
      if (matrixFilterEstado === 'Conductor asignado' && !a.conductor_name) return false;
      if (matrixFilterEstado === 'Sin conductor' && a.conductor_name) return false;
      if (matrixFilterEstado === 'Camion asignado' && !a.camion) return false;
      if (matrixFilterEstado === 'Sin camion' && a.camion) return false;
      return true;
    });
  }, [assignmentsForDate, matrixFilterRuta, matrixFilterCliente, matrixFilterEstado]);

  // RESUMEN AGRUPADO POR CONDUCTOR + N° DE VUELTA
  // "lo que no tienen 'Conductor' no debería aparecer en esta tabla resumen hasta que tenga"
  const groupedSummary = useMemo(() => {
    const map = new Map();

    assignmentsForDate.forEach(row => {
      if (!row.conductor_name || row.conductor_name.trim() === '') return;

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

      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [assignmentsForDate]);

  const toggleExpandSummary = (groupKey) => {
    setExpandedSummaryKeys(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
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

  // Helper para asignar con autocompletado de RUT
  const handleAssignStaff = (staff, targetRole) => {
    if (!staff) return;
    const targetIds = selectedRowIds.length > 0 ? selectedRowIds : [];
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar.');
      return;
    }
    assignStaffToRows(activeDate, targetIds, staff, targetRole);
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
        assignStaffToRows(activeDate, targetIds, staff, targetSlot);
      } else if (parsed.type === 'truck') {
        assignTruckToRows(activeDate, targetIds, parsed.data);
      } else if (parsed.type === 'rampla') {
        assignRamplaToRows(activeDate, targetIds, parsed.data);
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
          <div className="relative">
            <Search className="absolute left-2 top-1.5 text-slate-400" size={12} />
            <input 
              type="text" 
              placeholder="Ruta..." 
              value={matrixFilterRuta}
              onChange={e => setMatrixFilterRuta(e.target.value)}
              className="pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-20 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1.5 text-slate-400" size={12} />
            <input 
              type="text" 
              placeholder="Cliente..." 
              value={matrixFilterCliente}
              onChange={e => setMatrixFilterCliente(e.target.value)}
              className="pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-24 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={matrixFilterEstado}
            onChange={e => setMatrixFilterEstado(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg p-1 bg-slate-50 text-slate-700 focus:outline-none"
          >
            <option value="Todos">Todos</option>
            <option value="Conductor asignado">Con Chofer</option>
            <option value="Sin conductor">Sin Chofer</option>
            <option value="Camion asignado">Con Camión</option>
            <option value="Sin camion">Sin Camión</option>
          </select>

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

          <div className="p-1 border-b border-slate-100 bg-white">
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
          </div>

          <div className="flex-1 overflow-y-auto p-1 space-y-1">
            {(activeTabStaff === 'conductores' ? conductores : auxiliares).map(staff => {
              const isSelected = selectedStaffMember?.id === staff.id;
              return (
                <div 
                  key={staff.id} 
                  draggable
                  onDragStart={(e) => handleDragStartStaff(e, staff)}
                  onClick={() => setSelectedStaffMember(isSelected ? null : staff)}
                  className={`p-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-xs' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-1">
                      <p className="text-[11px] font-bold text-slate-800 truncate" title={staff.name}>
                        {staff.name}
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono">
                        {staff.rut || 'S/RUT'}
                      </p>
                    </div>
                    {/* Badge de viajes basado en vueltas distintas */}
                    <div className={`shrink-0 px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                      staff.viajes > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {staff.viajes === 1 ? '1 viaje' : `${staff.viajes} viajes`}
                    </div>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignStaff(staff, activeTabStaff === 'conductores' ? 'conductor' : 'auxiliar');
                        }}
                        className="text-[9px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-1.5 py-0.5 rounded shadow-xs"
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

                    <th className="px-2.5 py-2 text-blue-700 bg-blue-50/50">Conductor</th>
                    <th className="px-2.5 py-2 text-blue-700 bg-blue-50/50">Rut Conductor</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar 2</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar 2</th>
                    <th className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50">Camión</th>
                    <th className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50">Tipo de equipo</th>
                    <th className="px-2.5 py-2 text-teal-700 bg-teal-50/40">Rampla</th>
                    <th className="px-2.5 py-2">Tipo de servicio</th>
                    <th className="px-2.5 py-2 font-black text-slate-800">N° de Ruta</th>
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

                        {/* 3. Conductor */}
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

                        {/* 4. Rut Conductor */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-blue-50/20">
                          {row.conductor_rut || '-'}
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

                        {/* 6. Rut Auxiliar */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux1_rut || '-'}
                        </td>

                        {/* 7. Auxiliar 2 */}
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

                        {/* 8. Rut Auxiliar 2 */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux2_rut || '-'}
                        </td>

                        {/* 9. Camión */}
                        <td 
                          className="px-2.5 py-2 font-bold text-slate-800 bg-emerald-50/20"
                          onDrop={(e) => handleDropOnRow(e, row.id, 'camion')}
                        >
                          {row.camion ? (
                            <span className="flex items-center justify-between gap-1">
                              <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black text-[11px]">
                                {row.camion}
                              </span>
                              <button 
                                onClick={() => updateAssignmentField(activeDate, row.id, 'camion', '')}
                                className="text-slate-400 hover:text-red-500 text-[10px]"
                                title="Quitar camión"
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">— Vacío —</span>
                          )}
                        </td>

                        {/* 10. Tipo de equipo */}
                        <td className="px-2.5 py-2 text-slate-600 bg-emerald-50/20">
                          {row.tipo_equipo || '-'}
                        </td>

                        {/* 11. Rampla (Asignable por arrastrar semirremolque o texto) */}
                        <td 
                          className="px-2.5 py-2 bg-teal-50/20"
                          onDrop={(e) => handleDropOnRow(e, row.id, 'rampla')}
                        >
                          <input 
                            type="text" 
                            value={row.rampla || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'rampla', e.target.value)}
                            placeholder="R-01"
                            className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 12. Tipo de servicio */}
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

                        {/* 13. N° de Ruta */}
                        <td className="px-2.5 py-2 font-black text-slate-800 text-sm">
                          {row.ruta}
                        </td>

                        {/* 14. Cliente */}
                        <td className="px-2.5 py-2 font-medium text-slate-700 max-w-[150px] truncate" title={row.cliente}>
                          {row.cliente}
                        </td>

                        {/* 15. Referencia */}
                        <td className="px-2.5 py-2">
                          <input 
                            type="text" 
                            value={row.referencia || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'referencia', e.target.value)}
                            placeholder="Comentario..."
                            className="w-20 px-1 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 16. Cantidad de Locales */}
                        <td className="px-2.5 py-2 text-center font-bold">
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                            {row.locales || 0}
                          </span>
                        </td>

                        {/* 17. Metros cubicos */}
                        <td className="px-2.5 py-2 text-right font-mono font-bold text-emerald-700">
                          {row.m3 || 0}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredAssignments.length === 0 && (
                    <tr>
                      <td colSpan="18" className="px-4 py-12 text-center text-slate-500">
                        No hay servicios para la fecha {activeDate}. Ve al menú <span className="font-bold text-blue-600">Planificación &gt; Asignación diaria</span> para cargar y transmitir la planilla de ruteo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA INFERIOR: RESUMEN DE ASIGNACIÓN POR RUTA */}
          {/* Formato: Conductor + Camión + N° de vuelta + resumen m³, Peso, Locales + acordeón expandible con desglose por N° de Ruta */}
          <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2 border-b border-slate-100 bg-blue-50/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-blue-700" />
                <h3 className="font-bold text-blue-900 text-xs">
                  Resumen de Asignación por Ruta — {activeDate}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>Viajes planificados: <strong className="text-slate-800">{groupedSummary.length}</strong></span>
                <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
                <span>Peso: <strong className="text-amber-700">{totalPeso} kg</strong></span>
                <span>Total m³: <strong className="text-emerald-700">{totalM3}</strong></span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {groupedSummary.map((group) => {
                const isExpanded = !!expandedSummaryKeys[group.groupKey];
                return (
                  <div key={group.groupKey} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    
                    {/* Fila Resumen Principal (Clickeable para desplegar todo lo asignado a esa vuelta) */}
                    <div 
                      onClick={() => toggleExpandSummary(group.groupKey)}
                      className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        
                        {/* Dotación */}
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-800 text-sm">
                            {group.conductor_name}
                          </span>
                          {group.conductor_rut && (
                            <span className="text-slate-400 font-mono text-[10px]">
                              ({group.conductor_rut})
                            </span>
                          )}
                        </div>

                        {/* Camión */}
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                          <Truck size={12} />
                          {group.camion || 'Sin camión'}
                        </span>

                        {/* N° de vuelta */}
                        <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded text-[11px]">
                          {group.vueltaLabel}
                        </span>

                        {/* Rutas contenidas */}
                        <span className="text-slate-400 text-[11px]">
                          [{group.rutas.map(r => `Ruta ${r.ruta}`).join(', ')}]
                        </span>
                      </div>

                      {/* Resumen al costado: m³, Peso, Locales */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-600">
                          Locales: <strong className="text-indigo-700">{group.totalLocales}</strong>
                        </span>
                        <span className="text-slate-600">
                          Peso: <strong className="text-amber-700">{group.totalPeso} kg</strong>
                        </span>
                        <span className="text-slate-600 font-mono font-black text-emerald-700 text-sm">
                          {group.totalM3} m³
                        </span>
                      </div>
                    </div>

                    {/* DESGLOSE AL DESPLEGAR: Todo lo asignado en esa vuelta, separado por N° de Ruta */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50/30 space-y-3">
                        {group.rutas.map(r => {
                          const paradas = r.paradas || [];
                          return (
                            <div key={`subroute-${r.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                              {/* Sub-header de la ruta */}
                              <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="bg-slate-800 text-white font-bold px-2 py-0.5 rounded text-[10px]">
                                    N° de Ruta {r.ruta}
                                  </span>
                                  <span className="font-bold text-slate-800">{r.cliente}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span>{paradas.length} paradas</span>
                                  <span>{r.locales} locales</span>
                                  <span>{r.peso} kg</span>
                                  <span className="font-mono font-bold text-emerald-700">{r.m3} m³</span>
                                </div>
                              </div>

                              {/* Tabla de paradas / destinos idéntica a la imagen */}
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
                                    {paradas.map((p, pIdx) => (
                                      <tr key={pIdx} className="hover:bg-slate-50">
                                        <td className="px-3 py-1 text-slate-500 font-bold">{p.secuencia || pIdx + 1}</td>
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

          <div className="p-1 border-b border-slate-100 bg-white">
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
              return (
                <div 
                  key={truck.id}
                  draggable
                  onDragStart={(e) => handleDragStartTruck(e, truck, isSemirremolque)}
                  onClick={() => setSelectedTruckObject(isSelected ? null : truck)}
                  className={`p-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none ${
                    isSelected 
                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300 shadow-xs' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
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
                    {/* Badge de viajes basado en vueltas distintas */}
                    <div className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                      truck.viajes > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {truck.viajes === 1 ? '1 viaje' : `${truck.viajes} viajes`}
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-500 truncate">
                    {truck.brand || 'Equipo'} • {truck.type || 'General'}
                  </div>

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

    </div>
  );
}
