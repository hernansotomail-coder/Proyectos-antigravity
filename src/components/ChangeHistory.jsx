import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, Search, Filter, Download, Calendar, User, 
  Truck, ArrowRight, Shield, Layers, CheckCircle2, ChevronDown, Trash2,
  AlertTriangle, Lock, CheckSquare, Square, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { usePlanningStore, normalizeDate, sortDatesDescending, getMostRecentDate } from '../store/planningStore';
import { useAuthStore, canUserDeleteHistory } from '../store/authStore';
import { Button } from './ui/Button';

export default function ChangeHistory() {
  const { 
    changeHistoryList = [], 
    deleteChangeHistoryRow, 
    deleteBatchChangeHistory, 
    clearChangeHistory,
    savedRuteoByDate,
    transmittedAssignments,
    savedHistoryList,
    initPlanningFromDb
  } = usePlanningStore();
  const { user } = useAuthStore();
  const isAuthorized = useMemo(() => canUserDeleteHistory(user), [user]);

  // Sincronizar automáticamente el histórico centralizado desde Supabase
  useEffect(() => {
    if (initPlanningFromDb) {
      initPlanningFromDb();
    }
  }, [initPlanningFromDb]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterUser, setFilterUser] = useState('TODOS');
  const [filterConductor, setFilterConductor] = useState('TODOS');
  const [filterCamion, setFilterCamion] = useState('TODOS');

  // Multi-selection de filas para eliminación masiva
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal de confirmación para eliminar
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({
    isOpen: false,
    type: 'single', // 'single' | 'batch' | 'all'
    targetId: null,
    targetRuta: '',
    count: 0
  });

  // Available unique filter options (ordenadas cronológicamente de más reciente a más antigua)
  const availableDates = useMemo(() => {
    const s = new Set();
    const addDate = (d) => {
      if (!d) return;
      const normalized = normalizeDate(d);
      if (normalized && normalized !== 'Sin Fecha' && normalized !== 'undefined' && normalized !== 'null') {
        s.add(normalized);
      }
    };

    changeHistoryList.forEach(item => addDate(item.fechaPlanificacion));
    if (savedRuteoByDate) Object.keys(savedRuteoByDate).forEach(addDate);
    if (transmittedAssignments) Object.keys(transmittedAssignments).forEach(addDate);
    if (savedHistoryList) savedHistoryList.forEach(h => addDate(h.fecha));

    // Garantizar que la fecha operativa 28-10-2026 esté siempre disponible
    s.add('28-10-2026');

    return sortDatesDescending(Array.from(s));
  }, [changeHistoryList, savedRuteoByDate, transmittedAssignments, savedHistoryList]);

  // Predeterminado: siempre la fecha más reciente
  const [filterDate, setFilterDate] = useState(() => availableDates[0] || '28-10-2026');

  useEffect(() => {
    if (availableDates.length > 0 && filterDate !== 'TODAS' && (!filterDate || !availableDates.includes(filterDate))) {
      setFilterDate(availableDates[0]);
    }
  }, [availableDates, filterDate]);

  const availableUsers = useMemo(() => {
    const s = new Set();
    changeHistoryList.forEach(item => {
      if (item.usuario) s.add(item.usuario);
    });
    return Array.from(s).sort();
  }, [changeHistoryList]);

  const availableConductores = useMemo(() => {
    const s = new Set();
    changeHistoryList.forEach(item => {
      if (item.conductorModificado && item.conductorModificado !== 'Sin Asignar') {
        s.add(item.conductorModificado);
      }
    });
    return Array.from(s).sort();
  }, [changeHistoryList]);

  const availableCamiones = useMemo(() => {
    const s = new Set();
    changeHistoryList.forEach(item => {
      if (item.camionModificado && item.camionModificado !== 'Sin Asignar') {
        s.add(item.camionModificado);
      }
    });
    return Array.from(s).sort();
  }, [changeHistoryList]);

  // Filtered change records
  const filteredRecords = useMemo(() => {
    return changeHistoryList.filter(item => {
      if (filterDate !== 'TODAS' && normalizeDate(item.fechaPlanificacion) !== normalizeDate(filterDate)) return false;
      if (filterUser !== 'TODOS' && item.usuario !== filterUser) return false;
      if (filterConductor !== 'TODOS' && item.conductorModificado !== filterConductor) return false;
      if (filterCamion !== 'TODOS' && item.camionModificado !== filterCamion) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const rMatch = String(item.ruta || '').toLowerCase().includes(q);
        const dMatch = String(item.destino || '').toLowerCase().includes(q);
        const uMatch = String(item.usuario || '').toLowerCase().includes(q);
        const cMatch = String(item.conductorModificado || '').toLowerCase().includes(q);
        const camMatch = String(item.camionModificado || '').toLowerCase().includes(q);
        if (!rMatch && !dMatch && !uMatch && !cMatch && !camMatch) return false;
      }
      return true;
    });
  }, [changeHistoryList, filterDate, filterUser, filterConductor, filterCamion, searchTerm]);

  // KPIs
  const totalModificaciones = changeHistoryList.length;
  const rutasDistintas = useMemo(() => {
    return new Set(changeHistoryList.map(item => item.ruta)).size;
  }, [changeHistoryList]);

  // Manejo de Selección para borrado
  const allFilteredSelected = useMemo(() => {
    if (filteredRecords.length === 0) return false;
    return filteredRecords.every(r => selectedIds.includes(r.id));
  }, [filteredRecords, selectedIds]);

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredRecords.map(r => r.id));
      setSelectedIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...filteredRecords.map(r => r.id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Triggers de Confirmación de Borrado
  const promptDeleteSingle = (record) => {
    if (!isAuthorized) {
      toast.error('No tienes permisos para eliminar registros del histórico.');
      return;
    }
    setConfirmDeleteModal({
      isOpen: true,
      type: 'single',
      targetId: record.id,
      targetRuta: record.ruta,
      count: 1
    });
  };

  const promptDeleteBatch = () => {
    if (!isAuthorized) {
      toast.error('No tienes permisos para eliminar registros del histórico.');
      return;
    }
    if (selectedIds.length === 0) {
      toast.warning('Selecciona una o más filas para eliminar.');
      return;
    }
    setConfirmDeleteModal({
      isOpen: true,
      type: 'batch',
      targetId: null,
      targetRuta: '',
      count: selectedIds.length
    });
  };

  const promptClearAll = () => {
    if (!isAuthorized) {
      toast.error('No tienes permisos para vaciar el historial.');
      return;
    }
    setConfirmDeleteModal({
      isOpen: true,
      type: 'all',
      targetId: null,
      targetRuta: '',
      count: changeHistoryList.length
    });
  };

  const handleConfirmDelete = () => {
    if (!isAuthorized) return;

    if (confirmDeleteModal.type === 'single' && confirmDeleteModal.targetId) {
      deleteChangeHistoryRow(confirmDeleteModal.targetId);
      setSelectedIds(prev => prev.filter(id => id !== confirmDeleteModal.targetId));
    } else if (confirmDeleteModal.type === 'batch') {
      deleteBatchChangeHistory(selectedIds);
      setSelectedIds([]);
    } else if (confirmDeleteModal.type === 'all') {
      clearChangeHistory();
      setSelectedIds([]);
    }

    setConfirmDeleteModal({ isOpen: false, type: 'single', targetId: null, targetRuta: '', count: 0 });
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      toast.warning('No hay datos para exportar.');
      return;
    }

    try {
      const dataToExport = filteredRecords.map((r, idx) => ({
        '#': idx + 1,
        'Fecha Planificación': r.fechaPlanificacion || '',
        'Hora Antigua': r.horaAntigua || '',
        'Hora Modificada': r.horaModificada || r.fechaHoraModificacion || '',
        'Usuario': r.usuario || '',
        'N° Ruta': r.ruta || '',
        'Destino / Cliente': r.destino || '',
        'Conductor Anterior': r.conductorAntiguo || '',
        'Conductor Modificado': r.conductorModificado || '',
        'Auxiliar Anterior': r.auxiliarAntiguo || '',
        'Auxiliar Modificado': r.auxiliarModificado || '',
        'Camión Anterior': r.camionAntiguo || '',
        'Camión Modificado': r.camionModificado || '',
        'N° Vuelta Antigua': r.vueltaAntigua || '',
        'N° Vuelta Modificada': r.vueltaModificada || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Historico_Cambios');
      XLSX.writeFile(wb, `Historico_Cambios_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Histórico de cambios exportado a Excel.');
    } catch (err) {
      console.error('Error exportando Excel:', err);
      toast.error('Error al exportar a Excel.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="text-blue-600" size={22} />
              Histórico de Cambios
            </h1>
            {isAuthorized ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full" title="Usuario con permisos para eliminar registros">
                <Shield size={11} />
                Control Superadmin / Autorizado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full" title="Solo superadmin o usuarios autorizados pueden eliminar">
                <Lock size={10} />
                Solo Lectura
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro y auditoría de modificaciones de dotación, camiones y rutas al guardar disponibilización.
          </p>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAuthorized && selectedIds.length > 0 && (
            <Button
              onClick={promptDeleteBatch}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm px-3 py-1.5 rounded-xl animate-in fade-in"
            >
              <Trash2 size={13} />
              Eliminar Seleccionados ({selectedIds.length})
            </Button>
          )}

          {isAuthorized && changeHistoryList.length > 0 && (
            <Button
              onClick={promptClearAll}
              variant="outline"
              className="text-xs text-red-600 hover:bg-red-50 border-red-200 flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
              title="Vaciar todo el historial de cambios (Solo usuarios autorizados)"
            >
              <Trash2 size={13} />
              Vaciar Todo
            </Button>
          )}

          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200 rounded-xl"
          >
            <Download size={14} />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          
          {/* Top KPI Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cambios</p>
                <p className="text-2xl font-black text-slate-800">{totalModificaciones}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <History size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rutas Auditadas</p>
                <p className="text-2xl font-black text-indigo-700">{rutasDistintas}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fechas Registradas</p>
                <p className="text-2xl font-black text-emerald-700">{availableDates.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Calendar size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuarios Modificadores</p>
                <p className="text-2xl font-black text-purple-700">{availableUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <User size={20} />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Buscar ruta, cliente, usuario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
                />
              </div>

              {/* Date Filter */}
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none font-medium"
              >
                <option value="TODAS">Fecha: Todas</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* User Filter */}
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none max-w-[150px]"
              >
                <option value="TODOS">Usuario: Todos</option>
                {availableUsers.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>

              {/* Conductor Filter */}
              <select
                value={filterConductor}
                onChange={(e) => setFilterConductor(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none max-w-[160px]"
              >
                <option value="TODOS">Conductor: Todos</option>
                {availableConductores.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Camión Filter */}
              <select
                value={filterCamion}
                onChange={(e) => setFilterCamion(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none max-w-[140px]"
              >
                <option value="TODOS">Camión: Todos</option>
                {availableCamiones.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {(searchTerm || filterDate !== 'TODAS' || filterUser !== 'TODOS' || filterConductor !== 'TODOS' || filterCamion !== 'TODOS') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterDate('TODAS');
                    setFilterUser('TODOS');
                    setFilterConductor('TODOS');
                    setFilterCamion('TODOS');
                  }}
                  className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1 hover:bg-red-50 rounded"
                >
                  × Limpiar Filtros
                </button>
              )}
            </div>

            <span className="text-xs text-slate-500 font-semibold">
              Mostrando {filteredRecords.length} de {changeHistoryList.length} registros
            </span>
          </div>

          {/* Audit Records Table */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10 text-[11px] border-b border-slate-200">
                  <tr>
                    {isAuthorized && (
                      <th className="px-3 py-2.5 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                          title="Seleccionar todos los registros filtrados"
                        />
                      </th>
                    )}
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Fecha Planif.</th>
                    <th className="px-3 py-2.5 text-emerald-800">Hora Modificada</th>
                    <th className="px-3 py-2.5 text-slate-500">Hora Antigua</th>
                    <th className="px-3 py-2.5">Usuario</th>
                    <th className="px-3 py-2.5">N° Ruta</th>
                    <th className="px-3 py-2.5">Destino / Cliente</th>
                    <th className="px-3 py-2.5 text-blue-700">Conductor (Antiguo ➔ Modificado)</th>
                    <th className="px-3 py-2.5 text-indigo-700">Auxiliar (Antiguo ➔ Modificado)</th>
                    <th className="px-3 py-2.5 text-emerald-700">Camión (Antiguo ➔ Modificado)</th>
                    <th className="px-3 py-2.5 text-center text-amber-800">N° Vuelta</th>
                    {isAuthorized && (
                      <th className="px-3 py-2.5 text-center text-red-700">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRecords.map((r, idx) => {
                    const isCondDiff = r.conductorAntiguo !== r.conductorModificado;
                    const isAuxDiff = r.auxiliarAntiguo !== r.auxiliarModificado;
                    const isCamDiff = r.camionAntiguo !== r.camionModificado;
                    const isVueltaDiff = r.vueltaAntigua !== r.vueltaModificada;
                    const isSelected = selectedIds.includes(r.id);

                    return (
                      <tr key={r.id || idx} className={`hover:bg-blue-50/30 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}>
                        {isAuthorized && (
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(r.id)}
                              className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold text-blue-700">{r.fechaPlanificacion}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-700 text-[11px]">
                          {r.horaModificada || r.fechaHoraModificacion}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400 text-[11px]">
                          {r.horaAntigua || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg text-[11px]">
                            <User size={11} className="text-blue-600" />
                            {r.usuario}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-slate-900 text-white font-black px-2 py-0.5 rounded font-mono text-xs shadow-2xs">
                            {r.ruta}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700 max-w-[180px] truncate" title={r.destino}>
                          {r.destino}
                        </td>

                        {/* Conductor Antiguo ➔ Modificado */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-slate-400 line-through text-[10px] max-w-[110px] truncate" title={`Antiguo: ${r.conductorAntiguo}`}>
                              {r.conductorAntiguo}
                            </span>
                            <span className="text-slate-300">➔</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[140px] truncate ${
                              isCondDiff ? 'bg-blue-100 text-blue-900 border border-blue-300' : 'text-slate-700'
                            }`} title={`Modificado: ${r.conductorModificado}`}>
                              {r.conductorModificado}
                            </span>
                          </div>
                        </td>

                        {/* Auxiliar Antiguo ➔ Modificado */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-slate-400 line-through text-[10px] max-w-[100px] truncate" title={`Antiguo: ${r.auxiliarAntiguo}`}>
                              {r.auxiliarAntiguo}
                            </span>
                            <span className="text-slate-300">➔</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[130px] truncate ${
                              isAuxDiff ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' : 'text-slate-700'
                            }`} title={`Modificado: ${r.auxiliarModificado}`}>
                              {r.auxiliarModificado}
                            </span>
                          </div>
                        </td>

                        {/* Camión Antiguo ➔ Modificado */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-slate-400 line-through text-[10px] max-w-[90px] truncate" title={`Antiguo: ${r.camionAntiguo}`}>
                              {r.camionAntiguo}
                            </span>
                            <span className="text-slate-300">➔</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] max-w-[110px] truncate ${
                              isCamDiff ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'text-slate-700'
                            }`} title={`Modificado: ${r.camionModificado}`}>
                              {r.camionModificado}
                            </span>
                          </div>
                        </td>

                        {/* Vuelta */}
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-[11px]">
                            {isVueltaDiff && (
                              <>
                                <span className="text-slate-400 line-through text-[10px]">{r.vueltaAntigua}</span>
                                <span className="text-slate-300">➔</span>
                              </>
                            )}
                            <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                              isVueltaDiff ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-slate-700'
                            }`}>
                              {r.vueltaModificada}
                            </span>
                          </div>
                        </td>

                        {/* Botón de eliminación por fila */}
                        {isAuthorized && (
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => promptDeleteSingle(r)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={`Eliminar este registro de auditoría (Ruta ${r.ruta})`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={isAuthorized ? 13 : 11} className="p-8 text-center text-slate-400 italic">
                        No se encontraron registros de cambios con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* POP-UP MODAL FLOTANTE DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {confirmDeleteModal.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-slate-900">
                  {confirmDeleteModal.type === 'all' 
                    ? '¿Vaciar Histórico Completo?' 
                    : confirmDeleteModal.type === 'batch'
                    ? `¿Eliminar ${confirmDeleteModal.count} registros seleccionados?`
                    : `¿Eliminar registro de la Ruta ${confirmDeleteModal.targetRuta}?`}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {confirmDeleteModal.type === 'all'
                    ? 'Esta acción eliminará todos los registros de auditoría almacenados. No se podrá deshacer.'
                    : 'Esta acción borrará definitivamente este(os) registro(s) de auditoría del histórico.'}
                </p>
              </div>
              <button 
                onClick={() => setConfirmDeleteModal({ isOpen: false, type: 'single', targetId: null, targetRuta: '', count: 0 })}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteModal({ isOpen: false, type: 'single', targetId: null, targetRuta: '', count: 0 })}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 size={14} />
                Sí, Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
