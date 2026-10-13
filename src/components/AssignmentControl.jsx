import React, { useState, useEffect, useMemo } from 'react';
import { 
  Filter, Search, RefreshCw, User, Truck, MapPin, 
  ChevronUp, ChevronDown, CheckCircle2, Circle, Check,
  Calendar, Layers, Trash2, ArrowRight, UserCheck, Shield, Sparkles
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
  const { staffList, fetchStaff } = useStaffStore();
  const { fleetList, fetchFleet } = useFleetStore();
  const { 
    transmittedAssignments, 
    selectedDisponibilizarDate, 
    setSelectedDisponibilizarDate,
    updateAssignmentField,
    assignStaffToRows,
    assignTruckToRows,
    clearSlotFromRows
  } = usePlanningStore();

  // Selected date from dropdown
  const availableDates = useMemo(() => {
    const dates = Object.keys(transmittedAssignments);
    return dates.sort();
  }, [transmittedAssignments]);

  const activeDate = selectedDisponibilizarDate || availableDates[0] || '14-10-2026';

  useEffect(() => {
    fetchStaff();
    fetchFleet();
  }, [fetchStaff, fetchFleet]);

  // Si no hay fecha seleccionada y hay fechas disponibles, seleccionar la primera
  useEffect(() => {
    if (!selectedDisponibilizarDate && availableDates.length > 0) {
      setSelectedDisponibilizarDate(availableDates[0]);
    }
  }, [availableDates, selectedDisponibilizarDate, setSelectedDisponibilizarDate]);

  // Estado UI
  const [activeTab, setActiveTab] = useState('conductores'); // 'conductores' | 'auxiliares'
  const [sortVueltasAsc, setSortVueltasAsc] = useState(false);
  const [sortTrucksAsc, setSortTrucksAsc] = useState(false);
  const [selectedStaffMember, setSelectedStaffMember] = useState(null); // Staff object
  const [selectedTruckObject, setSelectedTruckObject] = useState(null); // Truck object
  const [staffSearch, setStaffSearch] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  
  // Multi-selection de filas en Disponibilización General
  const [selectedRowIds, setSelectedRowIds] = useState([]);

  // Filtros de búsqueda en la matriz
  const [matrixFilterRuta, setMatrixFilterRuta] = useState('');
  const [matrixFilterCliente, setMatrixFilterCliente] = useState('');
  const [matrixFilterEstado, setMatrixFilterEstado] = useState('Todos'); // 'Todos' | 'Conductor asignado' | 'Sin conductor' | 'Camion asignado'

  // Asignaciones actuales de la fecha activa
  const assignmentsForDate = useMemo(() => {
    const list = transmittedAssignments[activeDate] || [];
    // Si la fecha activa no tiene datos transmitidos aún, proveer filas iniciales de muestra
    if (list.length === 0 && availableDates.length === 0) {
      return [
        {
          id: `sample-1`,
          fecha: activeDate,
          conductor_name: '',
          conductor_rut: '',
          aux1_name: '',
          aux1_rut: '',
          aux2_name: '',
          aux2_rut: '',
          camion: '',
          tipo_equipo: '',
          rampla: '',
          n_vuelta: '1401',
          tipo_servicio: 'Centralizado',
          ruta: '1401',
          cliente: 'RUTA SBARRO COPEC 01',
          referencia: '',
          locales: 1,
          m3: 0.345
        },
        {
          id: `sample-2`,
          fecha: activeDate,
          conductor_name: '',
          conductor_rut: '',
          aux1_name: '',
          aux1_rut: '',
          aux2_name: '',
          aux2_rut: '',
          camion: '',
          tipo_equipo: '',
          rampla: '',
          n_vuelta: '1611',
          tipo_servicio: 'Distribución',
          ruta: '1611',
          cliente: 'RUTA CANTABRIA 02',
          referencia: '',
          locales: 7,
          m3: 3.0401
        },
        {
          id: `sample-3`,
          fecha: activeDate,
          conductor_name: '',
          conductor_rut: '',
          aux1_name: '',
          aux1_rut: '',
          aux2_name: '',
          aux2_rut: '',
          camion: '',
          tipo_equipo: '',
          rampla: '',
          n_vuelta: '1612',
          tipo_servicio: 'Distribución',
          ruta: '1612',
          cliente: 'RUTA CANTABRIA 03',
          referencia: '',
          locales: 7,
          m3: 3.5664
        }
      ];
    }
    return list;
  }, [transmittedAssignments, activeDate, availableDates]);

  // Vueltas acumuladas por persona y por camión en la fecha actual
  const vueltasPorPersona = useMemo(() => {
    const counts = {};
    assignmentsForDate.forEach(a => {
      if (a.conductor_name) counts[a.conductor_name] = (counts[a.conductor_name] || 0) + 1;
      if (a.aux1_name) counts[a.aux1_name] = (counts[a.aux1_name] || 0) + 1;
      if (a.aux2_name) counts[a.aux2_name] = (counts[a.aux2_name] || 0) + 1;
    });
    return counts;
  }, [assignmentsForDate]);

  const vueltasPorCamion = useMemo(() => {
    const counts = {};
    assignmentsForDate.forEach(a => {
      if (a.camion) {
        counts[a.camion] = (counts[a.camion] || 0) + 1;
      }
    });
    return counts;
  }, [assignmentsForDate]);

  // Dotación activa y clasificada
  const { conductores, auxiliares } = useMemo(() => {
    const activeStaff = staffList.filter(s => 
      s.status === 'Activo' && 
      (s.name.toLowerCase().includes(staffSearch.toLowerCase()) || (s.rut || '').includes(staffSearch))
    );
    
    const conds = activeStaff.filter(s => s.role.toLowerCase().includes('conductor')).map(c => ({
      ...c, vueltas: vueltasPorPersona[c.name] || 0
    }));
    const auxs = activeStaff.filter(s => s.role.toLowerCase().includes('auxiliar') || s.role.toLowerCase().includes('movilizador') || !s.role.toLowerCase().includes('conductor')).map(a => ({
      ...a, vueltas: vueltasPorPersona[a.name] || 0
    }));

    const sortByVueltas = (a, b) => sortVueltasAsc ? a.vueltas - b.vueltas : b.vueltas - a.vueltas;
    return {
      conductores: conds.sort(sortByVueltas),
      auxiliares: auxs.sort(sortByVueltas)
    };
  }, [staffList, sortVueltasAsc, staffSearch, vueltasPorPersona]);

  // Camiones activos clasificados
  const sortedTrucks = useMemo(() => {
    const activeTrucks = fleetList
      .filter(t => t.status === 'Activo' || !t.status)
      .filter(t => 
        (t.internal_number || '').toLowerCase().includes(truckSearch.toLowerCase()) || 
        (t.plate || '').toLowerCase().includes(truckSearch.toLowerCase()) ||
        (t.brand || '').toLowerCase().includes(truckSearch.toLowerCase())
      )
      .map(t => {
        const identifier = t.internal_number ? `${t.internal_number} (${t.plate})` : t.plate;
        return {
          ...t,
          identifier,
          vueltas: vueltasPorCamion[identifier] || vueltasPorCamion[t.plate] || 0
        };
      });

    return activeTrucks.sort((a, b) => sortTrucksAsc ? a.vueltas - b.vueltas : b.vueltas - a.vueltas);
  }, [fleetList, sortTrucksAsc, truckSearch, vueltasPorCamion]);

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

  // Seleccionar todas las filas filtradas
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

  // Helper para asignar Camión con autocompletado de tipo de equipo
  const handleAssignTruck = (truck) => {
    if (!truck) return;
    const targetIds = selectedRowIds.length > 0 ? selectedRowIds : [];
    if (targetIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas en la tabla para asignar el camión.');
      return;
    }
    assignTruckToRows(activeDate, targetIds, truck);
  };

  // Drag and drop handlers
  const handleDragStartStaff = (e, staff) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'staff', data: staff }));
  };

  const handleDragStartTruck = (e, truck) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'truck', data: truck }));
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
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Totales
  const totalM3 = filteredAssignments.reduce((acc, curr) => acc + (parseFloat(curr.m3) || 0), 0).toFixed(2);
  const totalLocales = filteredAssignments.reduce((acc, curr) => acc + (parseInt(curr.locales, 10) || 0), 0);
  const totalVueltas = filteredAssignments.length;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-2 gap-2 overflow-hidden">
      
      {/* 1. BARRA SUPERIOR DE CONTROL Y FECHA A DISPONIBILIZAR */}
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Selector "Fecha a disponibilizar" */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
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
                  <option value={activeDate}>{activeDate} (Datos base)</option>
                )}
              </select>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg">
              {filteredAssignments.length} servicios
            </span>
            <span className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg">
              {totalLocales} locales
            </span>
            <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg">
              {totalM3} m³
            </span>
          </div>
        </div>

        {/* Filtros rápidos de búsqueda */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Buscar Ruta o Vuelta..." 
              value={matrixFilterRuta}
              onChange={e => setMatrixFilterRuta(e.target.value)}
              className="pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg w-36 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Buscar Cliente..." 
              value={matrixFilterCliente}
              onChange={e => setMatrixFilterCliente(e.target.value)}
              className="pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg w-36 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={matrixFilterEstado}
            onChange={e => setMatrixFilterEstado(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg p-1.5 bg-slate-50 text-slate-700 focus:outline-none"
          >
            <option value="Todos">Todos los Estados</option>
            <option value="Conductor asignado">Con Conductor</option>
            <option value="Sin conductor">Sin Conductor</option>
            <option value="Camion asignado">Con Camión</option>
            <option value="Sin camion">Sin Camión</option>
          </select>

          <Button 
            variant="outline" 
            onClick={() => {
              setMatrixFilterRuta('');
              setMatrixFilterCliente('');
              setMatrixFilterEstado('Todos');
              setSelectedRowIds([]);
            }}
            className="text-xs h-8 px-2.5"
          >
            Limpiar
          </Button>
        </div>
      </header>

      {/* Floating Toolbar when rows are selected */}
      {selectedRowIds.length > 0 && (
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-xl shadow-md p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="font-bold text-xs">
              {selectedRowIds.length} fila(s) seleccionada(s)
            </span>
            <span className="text-[11px] text-blue-200 hidden sm:inline">
              — Puedes arrastrar o pulsar para asignar:
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {selectedStaffMember && (
              <>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'conductor')}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <User size={13} />
                  Conductor: {selectedStaffMember.name.split(' ')[0]}
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <Users size={13} />
                  Aux 1
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar2')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <Users size={13} />
                  Aux 2
                </button>
              </>
            )}

            {selectedTruckObject && (
              <button
                onClick={() => handleAssignTruck(selectedTruckObject)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
              >
                <Truck size={13} />
                Camión: {selectedTruckObject.internal_number || selectedTruckObject.plate}
              </button>
            )}

            <button
              onClick={() => {
                clearSlotFromRows(activeDate, selectedRowIds, 'conductor');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar2');
                clearSlotFromRows(activeDate, selectedRowIds, 'camion');
              }}
              className="bg-white/10 hover:bg-red-500/80 text-white text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
              title="Limpiar todas las asignaciones de las filas seleccionadas"
            >
              <Trash2 size={13} />
            </button>

            <button
              onClick={() => setSelectedRowIds([])}
              className="bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* THREE-PANEL LAYOUT */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        
        {/* PANEL IZQUIERDO: Dotación (22%) */}
        <div className="w-[22%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <User size={15} className="text-blue-600" /> Dotación (Arrastrar o Asignar)
            </h2>
            <button 
              onClick={() => setSortVueltasAsc(!sortVueltasAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortVueltasAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          
          <div className="flex border-b border-slate-100 bg-slate-50/30">
            <button 
              className={`flex-1 py-1.5 text-xs font-bold text-center transition-colors ${activeTab === 'conductores' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('conductores')}
            >
              Conductores ({conductores.length})
            </button>
            <button 
              className={`flex-1 py-1.5 text-xs font-bold text-center transition-colors ${activeTab === 'auxiliares' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('auxiliares')}
            >
              Auxiliares ({auxiliares.length})
            </button>
          </div>

          <div className="p-2 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
              <input 
                type="text" 
                placeholder="Buscar nombre o RUT..." 
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {(activeTab === 'conductores' ? conductores : auxiliares).map(staff => {
              const isSelected = selectedStaffMember?.id === staff.id;
              return (
                <div 
                  key={staff.id} 
                  draggable
                  onDragStart={(e) => handleDragStartStaff(e, staff)}
                  onClick={() => setSelectedStaffMember(isSelected ? null : staff)}
                  className={`p-2 rounded-xl border cursor-grab active:cursor-grabbing transition-all select-none ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 shadow-sm' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        staff.vueltas > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {staff.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-800 truncate" title={staff.name}>
                          {staff.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          RUT: {staff.rut || 'S/RUT'}
                        </p>
                      </div>
                    </div>
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      staff.vueltas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {staff.vueltas} vta
                    </div>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignStaff(staff, activeTab === 'conductores' ? 'conductor' : 'auxiliar');
                        }}
                        className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded shadow-xs"
                      >
                        + Asignar a {selectedRowIds.length} fila(s)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL CENTRAL: Matriz Disponibilización General (56%) */}
        <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
          
          {/* Matriz Superior: Disponibilización General */}
          <div className="flex-[3] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-xs">
                  Disponibilización General — {activeDate}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Arrastra conductores o camiones hacia las filas, o usa casillas para asignar en masa.
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10 shadow-sm border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="px-2 py-2 text-center w-8">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll}
                        checked={filteredAssignments.length > 0 && selectedRowIds.length === filteredAssignments.length}
                        className="rounded text-blue-600 focus:ring-blue-500"
                        title="Seleccionar todas las filas"
                      />
                    </th>
                    <th className="px-2.5 py-2">Fecha</th>
                    <th className="px-2.5 py-2 text-blue-700 bg-blue-50/50">Conductor</th>
                    <th className="px-2.5 py-2 text-blue-700 bg-blue-50/50">Rut Conductor</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar 2</th>
                    <th className="px-2.5 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar 2</th>
                    <th className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50">Camión</th>
                    <th className="px-2.5 py-2 text-emerald-700 bg-emerald-50/50">Tipo de equipo</th>
                    <th className="px-2.5 py-2">Rampla</th>
                    <th className="px-2.5 py-2 text-center">N° de vuelta</th>
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

                        {/* 2. Conductor */}
                        <td 
                          className="px-2.5 py-2 font-bold text-slate-800 max-w-[140px] truncate bg-blue-50/20"
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

                        {/* 3. Rut Conductor (Autocompletado) */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-blue-50/20">
                          {row.conductor_rut || '-'}
                        </td>

                        {/* 4. Auxiliar */}
                        <td 
                          className="px-2.5 py-2 text-slate-700 max-w-[130px] truncate bg-indigo-50/20"
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

                        {/* 5. Rut Auxiliar (Autocompletado) */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux1_rut || '-'}
                        </td>

                        {/* 6. Auxiliar 2 */}
                        <td 
                          className="px-2.5 py-2 text-slate-700 max-w-[130px] truncate bg-indigo-50/20"
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

                        {/* 7. Rut Auxiliar 2 (Autocompletado) */}
                        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux2_rut || '-'}
                        </td>

                        {/* 8. Camión */}
                        <td 
                          className="px-2.5 py-2 font-bold text-slate-800 bg-emerald-50/20"
                          onDrop={(e) => handleDropOnRow(e, row.id)}
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

                        {/* 9. Tipo de equipo (Autocompletado de camión) */}
                        <td className="px-2.5 py-2 text-slate-600 bg-emerald-50/20">
                          {row.tipo_equipo || '-'}
                        </td>

                        {/* 10. Rampla */}
                        <td className="px-2.5 py-2">
                          <input 
                            type="text" 
                            value={row.rampla || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'rampla', e.target.value)}
                            placeholder="Ej: R-01"
                            className="w-16 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 11. N° de vuelta (viene de Ruta de Hoja1) */}
                        <td className="px-2.5 py-2 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-800 text-white font-bold text-[11px]">
                            {row.n_vuelta || row.ruta}
                          </span>
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

                        {/* 14. Cliente (viene de Nombre Ruta) */}
                        <td className="px-2.5 py-2 font-medium text-slate-700 max-w-[160px] truncate" title={row.cliente}>
                          {row.cliente}
                        </td>

                        {/* 15. Referencia */}
                        <td className="px-2.5 py-2">
                          <input 
                            type="text" 
                            value={row.referencia || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'referencia', e.target.value)}
                            placeholder="Comentario..."
                            className="w-24 px-1.5 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 16. Cantidad de Locales (Recuento distinto de Destino) */}
                        <td className="px-2.5 py-2 text-center font-bold">
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                            {row.locales || 0}
                          </span>
                        </td>

                        {/* 17. Metros cubicos (Suma de Volumen) */}
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

          {/* Resumen Disponibilización Inferior */}
          <div className="flex-[1.4] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
              <h3 className="font-bold text-blue-900 text-xs">
                Resumen de Asignación por Ruta — {activeDate}
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span>Vueltas: <strong className="text-slate-800">{totalVueltas}</strong></span>
                <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
                <span>Total m³: <strong className="text-emerald-700">{totalM3}</strong></span>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 text-slate-500 font-semibold text-[11px]">
                  <tr>
                    <th className="px-3 py-1.5">Ruta</th>
                    <th className="px-3 py-1.5">Cliente</th>
                    <th className="px-3 py-1.5">Conductor</th>
                    <th className="px-3 py-1.5">Auxiliar(es)</th>
                    <th className="px-3 py-1.5">Camión</th>
                    <th className="px-3 py-1.5 text-center">Locales</th>
                    <th className="px-3 py-1.5 text-right">m³</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.map((row) => (
                    <tr key={`sum-${row.id}`} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-bold text-slate-800">{row.ruta}</td>
                      <td className="px-3 py-1.5 text-slate-600 max-w-[150px] truncate">{row.cliente}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800">{row.conductor_name || <span className="text-slate-300 italic">Sin asignar</span>}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {[row.aux1_name, row.aux2_name].filter(Boolean).join(', ') || <span className="text-slate-300 italic">Sin auxiliar</span>}
                      </td>
                      <td className="px-3 py-1.5 font-black text-emerald-800">{row.camion || <span className="text-slate-300 italic">Sin camión</span>}</td>
                      <td className="px-3 py-1.5 text-center">{row.locales}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">{row.m3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* PANEL DERECHO: Disponibilización de Camiones (22%) */}
        <div className="w-[22%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Truck size={15} className="text-emerald-600" /> Camiones (Arrastrar o Asignar)
            </h2>
            <button 
              onClick={() => setSortTrucksAsc(!sortTrucksAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortTrucksAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          
          <div className="p-2 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
              <input 
                type="text" 
                placeholder="Buscar patente o N° interno..." 
                value={truckSearch}
                onChange={e => setTruckSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {sortedTrucks.map(truck => {
              const isSelected = selectedTruckObject?.id === truck.id;
              return (
                <div 
                  key={truck.id}
                  draggable
                  onDragStart={(e) => handleDragStartTruck(e, truck)}
                  onClick={() => setSelectedTruckObject(isSelected ? null : truck)}
                  className={`p-2.5 rounded-xl border cursor-grab active:cursor-grabbing transition-all select-none ${
                    isSelected 
                      ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200 shadow-sm' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="bg-slate-800 text-white text-[11px] font-black px-2 py-0.5 rounded tracking-wider">
                        {truck.internal_number || truck.plate}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {truck.plate}
                      </span>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      truck.vueltas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {truck.vueltas} vta
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{truck.brand || 'Camión'} • {truck.type || 'General'}</span>
                    {truck.type2 && <span className="bg-cyan-50 text-cyan-700 px-1 rounded">{truck.type2}</span>}
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignTruck(truck);
                        }}
                        className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded shadow-xs"
                      >
                        + Asignar a {selectedRowIds.length} fila(s)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
