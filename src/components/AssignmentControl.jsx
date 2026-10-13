import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Filter, Search, RefreshCw, User, Truck, MapPin, 
  ChevronUp, ChevronDown, CheckCircle2, Circle, Check,
  Calendar, Layers, Trash2, ArrowRight, UserCheck, Shield, Sparkles,
  Save, Eye, Download, Send
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

  // Estado UI
  const [activeTab, setActiveTab] = useState('conductores');
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

  // Asignaciones actuales de la fecha activa
  const assignmentsForDate = useMemo(() => {
    return transmittedAssignments[activeDate] || [];
  }, [transmittedAssignments, activeDate]);

  // Vueltas acumuladas por persona y camión
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

  // Dotación activa
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

  // Camiones activos
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

  // Asignar vuelta masiva a seleccionados
  const handleAssignBatchVuelta = (vueltaNum) => {
    if (selectedRowIds.length === 0) {
      toast.warning('Marca las casillas de una o más filas para asignar la vuelta.');
      return;
    }
    batchUpdateRows(activeDate, selectedRowIds, { n_vuelta: String(vueltaNum) });
    toast.success(`Vuelta ${vueltaNum} asignada a ${selectedRowIds.length} fila(s)`);
  };

  // Guardar Disponibilización
  const handleSave = () => {
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
  const totalPeso = filteredAssignments.reduce((acc, curr) => acc + (parseFloat(curr.peso) || 0), 0).toFixed(2);
  const totalVueltas = filteredAssignments.length;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-2 gap-2 overflow-hidden">
      
      {/* 1. BARRA SUPERIOR DE CONTROL */}
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Selector "Fecha a disponibilizar" */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
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
                  <option value={activeDate}>{activeDate}</option>
                )}
              </select>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Ruta..." 
              value={matrixFilterRuta}
              onChange={e => setMatrixFilterRuta(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-24 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1.5 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Cliente..." 
              value={matrixFilterCliente}
              onChange={e => setMatrixFilterCliente(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-28 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            onClick={handleSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 px-3.5 flex items-center gap-1.5 shadow-sm rounded-xl"
            title="Guarda y transmite los servicios a Ruteo"
          >
            <Save size={14} />
            Guardar Disponibilización
          </Button>

          <Button 
            variant="outline" 
            onClick={() => navigate('/ruteo')}
            className="text-xs h-8 px-2.5 text-slate-600 hover:text-blue-700 flex items-center gap-1 rounded-xl"
          >
            <Layers size={14} />
            Ir a Ruteo
          </Button>
        </div>
      </header>

      {/* Floating Toolbar when rows are selected */}
      {selectedRowIds.length > 0 && (
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-xl shadow-md p-2 px-3 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-in fade-in slide-in-from-top-2">
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
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  <User size={12} />
                  Chofer: {selectedStaffMember.name.split(' ')[0]}
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  Aux 1
                </button>
                <button
                  onClick={() => handleAssignStaff(selectedStaffMember, 'auxiliar2')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                >
                  Aux 2
                </button>
              </>
            )}

            {selectedTruckObject && (
              <button
                onClick={() => handleAssignTruck(selectedTruckObject)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg transition-colors shadow-sm flex items-center gap-1"
              >
                <Truck size={12} />
                Camión: {selectedTruckObject.internal_number || selectedTruckObject.plate}
              </button>
            )}

            <button
              onClick={() => {
                clearSlotFromRows(activeDate, selectedRowIds, 'conductor');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar');
                clearSlotFromRows(activeDate, selectedRowIds, 'auxiliar2');
                clearSlotFromRows(activeDate, selectedRowIds, 'camion');
                clearSlotFromRows(activeDate, selectedRowIds, 'vuelta');
              }}
              className="bg-white/10 hover:bg-red-500/80 text-white text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
              title="Limpiar todas las asignaciones"
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
        
        {/* PANEL IZQUIERDO: Dotación (Reducido a 17%) */}
        <div className="w-[17%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-xs flex items-center gap-1">
              <User size={14} className="text-blue-600" /> Dotación
            </h2>
            <button 
              onClick={() => setSortVueltasAsc(!sortVueltasAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortVueltasAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          
          <div className="flex border-b border-slate-100 bg-slate-50/30">
            <button 
              className={`flex-1 py-1 text-[11px] font-bold text-center transition-colors ${activeTab === 'conductores' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('conductores')}
            >
              Choferes ({conductores.length})
            </button>
            <button 
              className={`flex-1 py-1 text-[11px] font-bold text-center transition-colors ${activeTab === 'auxiliares' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('auxiliares')}
            >
              Aux ({auxiliares.length})
            </button>
          </div>

          <div className="p-1.5 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 text-slate-400" size={12} />
              <input 
                type="text" 
                placeholder="Nombre/RUT..." 
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full pl-6 pr-1.5 py-1 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {(activeTab === 'conductores' ? conductores : auxiliares).map(staff => {
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
                      <p className="text-[10px] text-slate-400 font-mono">
                        {staff.rut || 'S/RUT'}
                      </p>
                    </div>
                    <div className={`shrink-0 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      staff.vueltas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {staff.vueltas}v
                    </div>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignStaff(staff, activeTab === 'conductores' ? 'conductor' : 'auxiliar');
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
                <MapPin size={15} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-xs">
                  Disponibilización General — {activeDate}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Selecciona N° de vuelta (1-8) al lado de Fecha. Arrastra dotación o camiones.
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
                    <th className="px-2 py-2">Fecha</th>
                    
                    {/* NUEVO: N° de vuelta ubicado al lado de Fecha, vacía inicialmente con lista 1 al 8 */}
                    <th className="px-2 py-2 text-center bg-amber-50/70 text-amber-900 border-x border-amber-200">
                      N° de vuelta
                    </th>

                    <th className="px-2 py-2 text-blue-700 bg-blue-50/50">Conductor</th>
                    <th className="px-2 py-2 text-blue-700 bg-blue-50/50">Rut Conductor</th>
                    <th className="px-2 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar</th>
                    <th className="px-2 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar</th>
                    <th className="px-2 py-2 text-indigo-700 bg-indigo-50/50">Auxiliar 2</th>
                    <th className="px-2 py-2 text-indigo-700 bg-indigo-50/50">Rut Auxiliar 2</th>
                    <th className="px-2 py-2 text-emerald-700 bg-emerald-50/50">Camión</th>
                    <th className="px-2 py-2 text-emerald-700 bg-emerald-50/50">Tipo de equipo</th>
                    <th className="px-2 py-2">Rampla</th>
                    <th className="px-2 py-2">Tipo de servicio</th>
                    <th className="px-2 py-2 font-black text-slate-800">N° de Ruta</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Referencia</th>
                    <th className="px-2 py-2 text-center">Cantidad de Locales</th>
                    <th className="px-2 py-2 text-right">Metros cúbicos</th>
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
                        <td className="px-2 py-2 font-semibold text-slate-600">{row.fecha}</td>

                        {/* 2. N° de vuelta (Ubicada al lado de Fecha, vacía inicialmente, lista 1 al 8) */}
                        <td className="px-2 py-2 text-center bg-amber-50/30 border-x border-amber-100">
                          <select
                            value={row.n_vuelta || ''}
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'n_vuelta', e.target.value)}
                            className="text-xs font-black text-slate-800 border border-amber-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
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
                          className="px-2 py-2 font-bold text-slate-800 max-w-[130px] truncate bg-blue-50/20"
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

                        {/* 4. Rut Conductor (Autocompletado) */}
                        <td className="px-2 py-2 font-mono text-[11px] text-slate-600 bg-blue-50/20">
                          {row.conductor_rut || '-'}
                        </td>

                        {/* 5. Auxiliar */}
                        <td 
                          className="px-2 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20"
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

                        {/* 6. Rut Auxiliar (Autocompletado) */}
                        <td className="px-2 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux1_rut || '-'}
                        </td>

                        {/* 7. Auxiliar 2 */}
                        <td 
                          className="px-2 py-2 text-slate-700 max-w-[120px] truncate bg-indigo-50/20"
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

                        {/* 8. Rut Auxiliar 2 (Autocompletado) */}
                        <td className="px-2 py-2 font-mono text-[11px] text-slate-600 bg-indigo-50/20">
                          {row.aux2_rut || '-'}
                        </td>

                        {/* 9. Camión */}
                        <td 
                          className="px-2 py-2 font-bold text-slate-800 bg-emerald-50/20"
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

                        {/* 10. Tipo de equipo (Autocompletado de camión) */}
                        <td className="px-2 py-2 text-slate-600 bg-emerald-50/20">
                          {row.tipo_equipo || '-'}
                        </td>

                        {/* 11. Rampla */}
                        <td className="px-2 py-2">
                          <input 
                            type="text" 
                            value={row.rampla || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'rampla', e.target.value)}
                            placeholder="R-01"
                            className="w-14 px-1 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 12. Tipo de servicio */}
                        <td className="px-2 py-2">
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
                        <td className="px-2 py-2 font-black text-slate-800 text-sm">
                          {row.ruta}
                        </td>

                        {/* 14. Cliente */}
                        <td className="px-2 py-2 font-medium text-slate-700 max-w-[150px] truncate" title={row.cliente}>
                          {row.cliente}
                        </td>

                        {/* 15. Referencia */}
                        <td className="px-2 py-2">
                          <input 
                            type="text" 
                            value={row.referencia || ''} 
                            onChange={(e) => updateAssignmentField(activeDate, row.id, 'referencia', e.target.value)}
                            placeholder="Comentario..."
                            className="w-20 px-1 py-0.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-transparent"
                          />
                        </td>

                        {/* 16. Cantidad de Locales */}
                        <td className="px-2 py-2 text-center font-bold">
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                            {row.locales || 0}
                          </span>
                        </td>

                        {/* 17. Metros cubicos */}
                        <td className="px-2 py-2 text-right font-mono font-bold text-emerald-700">
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

          {/* TABLA INFERIOR: Resumen de Asignación por Ruta — Detalle completo con paradas */}
          <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-2 border-b border-slate-100 bg-blue-50/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-blue-700" />
                <h3 className="font-bold text-blue-900 text-xs">
                  Resumen de Asignación por Ruta — {activeDate} (Detalle de Destinos)
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>Vueltas: <strong className="text-slate-800">{totalVueltas}</strong></span>
                <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
                <span>Peso: <strong className="text-amber-700">{totalPeso} kg</strong></span>
                <span>Total m³: <strong className="text-emerald-700">{totalM3}</strong></span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-2">
              {filteredAssignments.map((row) => {
                const paradas = row.paradas || [];
                return (
                  <div key={`detail-${row.id}`} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    {/* Header de la Ruta Asignada */}
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-800 text-white font-black px-2 py-0.5 rounded text-[11px]">
                          Ruta {row.ruta}
                        </span>
                        {row.n_vuelta && (
                          <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
                            Vuelta {row.n_vuelta}
                          </span>
                        )}
                        <span className="font-bold text-slate-800">{row.cliente}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-600">
                          Chofer: <strong className="text-slate-900">{row.conductor_name || 'Sin asignar'}</strong>
                          {row.conductor_rut && <span className="text-slate-400 font-mono text-[10px] ml-1">({row.conductor_rut})</span>}
                        </span>
                        <span className="text-slate-600">
                          Aux: <strong className="text-slate-900">{[row.aux1_name, row.aux2_name].filter(Boolean).join(', ') || 'Sin aux'}</strong>
                        </span>
                        <span className="text-slate-600">
                          Camión: <strong className="text-emerald-700">{row.camion || 'Sin camión'}</strong>
                        </span>
                        <span className="text-slate-600 font-mono font-bold text-emerald-700">
                          {row.m3} m³
                        </span>
                      </div>
                    </div>

                    {/* Tabla de Paradas / Destinos (Formato idéntico a la imagen) */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] whitespace-nowrap">
                        <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-100">
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
                                Destino directo / Sin desglose individual de paradas.
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
          </div>

        </div>

        {/* PANEL DERECHO: Disponibilización de Camiones (Reducido a 17%) */}
        <div className="w-[17%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-xs flex items-center gap-1">
              <Truck size={14} className="text-emerald-600" /> Camiones
            </h2>
            <button 
              onClick={() => setSortTrucksAsc(!sortTrucksAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortTrucksAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          
          <div className="p-1.5 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 text-slate-400" size={12} />
              <input 
                type="text" 
                placeholder="Patente/N°..." 
                value={truckSearch}
                onChange={e => setTruckSearch(e.target.value)}
                className="w-full pl-6 pr-1.5 py-1 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {sortedTrucks.map(truck => {
              const isSelected = selectedTruckObject?.id === truck.id;
              return (
                <div 
                  key={truck.id}
                  draggable
                  onDragStart={(e) => handleDragStartTruck(e, truck)}
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
                    <div className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      truck.vueltas > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {truck.vueltas}v
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 truncate">
                    {truck.brand || 'Camión'} • {truck.type || 'General'}
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignTruck(truck);
                        }}
                        className="text-[9px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded shadow-xs"
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

      </div>
    </div>
  );
}
