import React, { useState, useEffect, useMemo } from 'react';
import { 
  Filter, Search, RefreshCw, User, Truck, MapPin, 
  ChevronUp, ChevronDown, CheckCircle2, Circle, Check 
} from 'lucide-react';
import { useStaffStore } from '../store/staffStore';
import { useFleetStore } from '../store/fleetStore';

// Tipos de servicio y sus colores
const SERVICE_COLORS = {
  'Centralizado': 'bg-blue-100 text-blue-700',
  'Carga Consolidada': 'bg-purple-100 text-purple-700',
  'Carretera': 'bg-amber-100 text-amber-700',
  'CDKL': 'bg-emerald-100 text-emerald-700',
  'Servicios distribución': 'bg-indigo-100 text-indigo-700',
  'Servicio especial': 'bg-rose-100 text-rose-700'
};

// Datos Mock para el diseño inicial
const MOCK_TRUCKS = [
  { id: 'T1', patente: 'AB-CD-12', referencia: '', vueltas: 2 },
  { id: 'T2', patente: 'WX-YZ-99', referencia: 'En andén 3', vueltas: 1 },
  { id: 'T3', patente: 'KL-MN-55', referencia: 'Disponible tarde', vueltas: 0 },
  { id: 'T4', patente: 'TR-PK-22', referencia: '', vueltas: 0 },
  { id: 'T5', patente: 'HG-FD-44', referencia: 'Mantenimiento corto', vueltas: 0 }
];

const MOCK_ASSIGNMENTS = [
  {
    id: 1,
    conductor_name: 'ABARCA LEIVA RICARDO ANTONIO',
    aux1_name: 'ACEVEDO RIVERA ABEL ANGEL',
    aux2_name: '',
    ruta: 'RT-1001',
    camion: 'AB-CD-12',
    vuelta: 1,
    rampla: 'RMP-01',
    cliente: 'Supermercados S.A.',
    tipo_servicio: 'Centralizado',
    m3: 45,
    locales: 3
  },
  {
    id: 2,
    conductor_name: 'ABARCA LEIVA RICARDO ANTONIO',
    aux1_name: 'ACEVEDO RIVERA ABEL ANGEL',
    aux2_name: '',
    ruta: 'RT-1002',
    camion: 'AB-CD-12',
    vuelta: 2,
    rampla: 'RMP-01',
    cliente: 'RetailCorp',
    tipo_servicio: 'Servicios distribución',
    m3: 30,
    locales: 5
  },
  {
    id: 3,
    conductor_name: 'ACEVEDO AVILA JORGE',
    aux1_name: 'ACEVEDO RIVERA NICOLAS',
    aux2_name: 'ACUÑA TORRES FERNANDO',
    ruta: 'RT-2044',
    camion: 'WX-YZ-99',
    vuelta: 1,
    rampla: 'RMP-14',
    cliente: 'Industrial C&A',
    tipo_servicio: 'Carga Consolidada',
    m3: 60,
    locales: 1
  }
];

export default function AssignmentControl() {
  const { staffList, fetchStaff } = useStaffStore();
  const { fleetList, fetchFleet } = useFleetStore();
  
  // Estado de los filtros del Header
  const [filters, setFilters] = useState({
    conductor: 'Todos',
    auxiliar: 'Todos',
    camion: 'Todos',
    ruta: ''
  });

  // Estado UI
  const [activeTab, setActiveTab] = useState('conductores'); // 'conductores' | 'auxiliares'
  const [sortVueltasAsc, setSortVueltasAsc] = useState(false); // true: asc, false: desc
  const [sortTrucksAsc, setSortTrucksAsc] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null); // String (name)
  
  // Guardamos las referencias escritas a mano
  const [truckReferences, setTruckReferences] = useState({});

  useEffect(() => {
    fetchStaff();
    fetchFleet();
  }, [fetchStaff, fetchFleet]);

  // Computed data para Dotación
  const { conductores, auxiliares } = useMemo(() => {
    const vueltasPorPersona = {};
    MOCK_ASSIGNMENTS.forEach(a => {
      if (a.conductor_name) vueltasPorPersona[a.conductor_name] = (vueltasPorPersona[a.conductor_name] || 0) + 1;
      if (a.aux1_name) vueltasPorPersona[a.aux1_name] = (vueltasPorPersona[a.aux1_name] || 0) + 1;
      if (a.aux2_name) vueltasPorPersona[a.aux2_name] = (vueltasPorPersona[a.aux2_name] || 0) + 1;
    });

    const activeStaff = staffList.filter(s => s.status === 'Activo');
    const conds = activeStaff.filter(s => s.role.toLowerCase().includes('conductor')).map(c => ({
      ...c, vueltas: vueltasPorPersona[c.name] || 0
    }));
    const auxs = activeStaff.filter(s => s.role.toLowerCase().includes('auxiliar') || s.role.toLowerCase().includes('movilizador')).map(a => ({
      ...a, vueltas: vueltasPorPersona[a.name] || 0
    }));

    const sortByVueltas = (a, b) => sortVueltasAsc ? a.vueltas - b.vueltas : b.vueltas - a.vueltas;
    return {
      conductores: conds.sort(sortByVueltas),
      auxiliares: auxs.sort(sortByVueltas)
    };
  }, [staffList, sortVueltasAsc]);

  // Computed data para Camiones
  const sortedTrucks = useMemo(() => {
    const vueltasPorCamion = {};
    MOCK_ASSIGNMENTS.forEach(a => {
      if (a.camion) vueltasPorCamion[a.camion] = (vueltasPorCamion[a.camion] || 0) + 1;
    });

    // Solo camiones Activos (excluye 'En Taller', 'Inactivo')
    const activeTrucks = fleetList
      .filter(t => t.status === 'Activo')
      .map(t => ({
        ...t,
        vueltas: vueltasPorCamion[t.plate] || 0,
        referencia: truckReferences[t.id] || ''
      }));

    return activeTrucks.sort((a, b) => sortTrucksAsc ? a.vueltas - b.vueltas : b.vueltas - a.vueltas);
  }, [fleetList, truckReferences, sortTrucksAsc]);

  // Filtrado de Asignaciones en el panel central
  const filteredAssignments = useMemo(() => {
    return MOCK_ASSIGNMENTS.filter(a => {
      // Filtros Globales (Header)
      if (filters.ruta && !a.ruta.toLowerCase().includes(filters.ruta.toLowerCase())) return false;
      if (filters.conductor === 'Con asignación' && !a.conductor_name) return false;
      if (filters.conductor === 'Sin asignación' && a.conductor_name) return false;
      if (filters.camion === 'Con asignación' && !a.camion) return false;
      if (filters.camion === 'Sin asignación' && a.camion) return false;

      // Filtro contextual (Selección panel izquierdo)
      if (selectedStaff) {
        if (a.conductor_name !== selectedStaff && a.aux1_name !== selectedStaff && a.aux2_name !== selectedStaff) {
          return false;
        }
      }

      return true;
    });
  }, [filters, selectedStaff]);

  const handleUpdateTruckReference = (id, ref) => {
    setTruckReferences(prev => ({ ...prev, [id]: ref }));
  };

  const clearFilters = () => {
    setFilters({ conductor: 'Todos', auxiliar: 'Todos', camion: 'Todos', ruta: '' });
    setSelectedStaff(null);
  };

  const handleStaffClick = (name) => {
    setSelectedStaff(prev => prev === name ? null : name);
  };

  // Totales para tabla resumen
  const totalM3 = filteredAssignments.reduce((acc, curr) => acc + (curr.m3 || 0), 0);
  const totalVueltas = filteredAssignments.length;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-2 overflow-hidden">
      
      {/* 1. BARRA SUPERIOR DE FILTROS (Header) */}
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-3 flex flex-wrap items-end gap-4 shrink-0">
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs font-medium text-slate-500">Filtro Conductor</label>
          <select 
            value={filters.conductor} 
            onChange={e => setFilters({...filters, conductor: e.target.value})}
            className="text-sm border-slate-200 rounded-lg p-1.5 focus:ring-blue-500"
          >
            <option>Todos</option>
            <option>Con asignación</option>
            <option>Sin asignación</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs font-medium text-slate-500">Filtro Auxiliar</label>
          <select 
            value={filters.auxiliar} 
            onChange={e => setFilters({...filters, auxiliar: e.target.value})}
            className="text-sm border-slate-200 rounded-lg p-1.5 focus:ring-blue-500"
          >
            <option>Todos</option>
            <option>Con asignación</option>
            <option>Sin asignación</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-40">
          <label className="text-xs font-medium text-slate-500">Filtro Camiones</label>
          <select 
            value={filters.camion} 
            onChange={e => setFilters({...filters, camion: e.target.value})}
            className="text-sm border-slate-200 rounded-lg p-1.5 focus:ring-blue-500"
          >
            <option>Todos</option>
            <option>Con asignación</option>
            <option>Sin asignación</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-500">N° de Ruta</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar ruta..." 
              value={filters.ruta}
              onChange={e => setFilters({...filters, ruta: e.target.value})}
              className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={clearFilters} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 font-medium transition-colors">
            Limpiar filtros
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm">
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>
      </header>

      {/* THREE-PANEL LAYOUT */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        
        {/* PANEL IZQUIERDO: Disponibilización de dotación (25%) */}
        <div className="w-1/4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <User size={16} className="text-blue-500" /> Dotación
            </h2>
            <button 
              onClick={() => setSortVueltasAsc(!sortVueltasAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortVueltasAsc ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          
          <div className="flex border-b border-slate-100">
            <button 
              className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${activeTab === 'conductores' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              onClick={() => setActiveTab('conductores')}
            >
              Conductores ({conductores.length})
            </button>
            <button 
              className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${activeTab === 'auxiliares' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              onClick={() => setActiveTab('auxiliares')}
            >
              Auxiliares ({auxiliares.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {(activeTab === 'conductores' ? conductores : auxiliares).map(staff => (
              <div 
                key={staff.id} 
                onClick={() => handleStaffClick(staff.name)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                  selectedStaff === staff.name 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${staff.vueltas > 0 ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    <User size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{staff.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{staff.role}</p>
                  </div>
                </div>
                <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  staff.vueltas > 0 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {staff.vueltas} {staff.vueltas === 1 ? 'Vta' : 'Vtas'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PANEL CENTRAL: Tablas (50%) */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
          
          {/* Matriz Superior */}
          <div className="flex-[3] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <MapPin size={16} className="text-indigo-500" /> Disponibilización General
              </h2>
              <span className="text-xs text-slate-500 font-medium">{filteredAssignments.length} asignaciones</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr className="text-slate-500 font-semibold">
                    <th className="px-3 py-2">Vuelta</th>
                    <th className="px-3 py-2">Ruta</th>
                    <th className="px-3 py-2">Conductor</th>
                    <th className="px-3 py-2">Auxiliar 1</th>
                    <th className="px-3 py-2">Auxiliar 2</th>
                    <th className="px-3 py-2">Camión</th>
                    <th className="px-3 py-2">Rampla</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Tipo de Servicio</th>
                    <th className="px-3 py-2 text-right">m³</th>
                    <th className="px-3 py-2 text-center">Locales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white font-bold text-[10px]">
                          {row.vuelta}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.ruta}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]" title={row.conductor_name}>{row.conductor_name || '-'}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]" title={row.aux1_name}>{row.aux1_name || '-'}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]" title={row.aux2_name}>{row.aux2_name || '-'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700">{row.camion || '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{row.rampla || '-'}</td>
                      <td className="px-3 py-2">{row.cliente}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SERVICE_COLORS[row.tipo_servicio] || 'bg-slate-100 text-slate-700'}`}>
                          {row.tipo_servicio}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{row.m3}</td>
                      <td className="px-3 py-2 text-center">{row.locales}</td>
                    </tr>
                  ))}
                  {filteredAssignments.length === 0 && (
                    <tr>
                      <td colSpan="11" className="px-4 py-8 text-center text-slate-500">No hay asignaciones que coincidan con los filtros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabla Inferior (Resumen Contextual) */}
          <div className="flex-[2] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-100 bg-blue-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-blue-800 text-sm">Resumen Disponibilización</h2>
              {selectedStaff && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Filtrando: {selectedStaff}</span>}
            </div>
            <div className="flex-1 overflow-auto flex flex-col">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0 shadow-sm">
                  <tr className="text-slate-500 font-semibold">
                    <th className="px-4 py-2">Vuelta</th>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2">Auxiliar(es)</th>
                    <th className="px-4 py-2">Camión</th>
                    <th className="px-4 py-2 text-right">m³</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.map((row) => (
                    <tr key={`res-${row.id}`}>
                      <td className="px-4 py-2 font-bold text-slate-700">{row.vuelta}</td>
                      <td className="px-4 py-2 truncate max-w-[150px]">{row.conductor_name || '-'}</td>
                      <td className="px-4 py-2 truncate max-w-[150px]">
                        {[row.aux1_name, row.aux2_name].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-2 font-medium">{row.camion || '-'}</td>
                      <td className="px-4 py-2 text-right">{row.m3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Totales Fijos Abajo */}
              <div className="mt-auto bg-slate-100/80 border-t border-slate-200 p-3 flex items-center justify-between">
                <span className="font-bold text-sm text-slate-700">TOTALES</span>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Vueltas Acumuladas</span>
                    <span className="font-bold text-sm text-blue-700">{totalVueltas}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Total m³</span>
                    <span className="font-bold text-sm text-blue-700">{totalM3}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: Disponibilización de camiones (25%) */}
        <div className="w-1/4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Truck size={16} className="text-emerald-500" /> Camiones
            </h2>
            <button 
              onClick={() => setSortTrucksAsc(!sortTrucksAsc)}
              className="p-1 hover:bg-slate-200 rounded text-slate-500"
              title="Ordenar por vueltas"
            >
              {sortTrucksAsc ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/30">
            {sortedTrucks.map(truck => (
              <div key={truck.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-800 text-white text-xs font-black px-2 py-1 rounded-md tracking-wider">
                      {truck.plate}
                    </div>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    truck.vueltas > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {truck.vueltas} {truck.vueltas === 1 ? 'Vta' : 'Vtas'}
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Referencia / Observación</label>
                  <input 
                    type="text" 
                    value={truck.referencia}
                    onChange={(e) => handleUpdateTruckReference(truck.id, e.target.value)}
                    placeholder="Ej: En andén, Mantenimiento..."
                    className="w-full text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
