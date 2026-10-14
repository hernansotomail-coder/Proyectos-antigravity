import React, { useState, useMemo } from 'react';
import { 
  History, Search, Filter, Download, Calendar, User, 
  Truck, ArrowRight, RefreshCw, ExternalLink, FileSpreadsheet, 
  FileText, Shield, Layers, CheckCircle2, ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

export default function ChangeHistory() {
  const { changeHistoryList = [], clearChangeHistory } = usePlanningStore();

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'asignaciones_cliente'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('TODAS');
  const [filterUser, setFilterUser] = useState('TODOS');
  const [filterConductor, setFilterConductor] = useState('TODOS');
  const [filterCamion, setFilterCamion] = useState('TODOS');

  // Iframe key for reload
  const [iframeKey, setIframeKey] = useState(1);

  // Available unique filter options
  const availableDates = useMemo(() => {
    const s = new Set();
    changeHistoryList.forEach(item => {
      if (item.fechaPlanificacion) s.add(item.fechaPlanificacion);
    });
    return Array.from(s).sort();
  }, [changeHistoryList]);

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
      if (filterDate !== 'TODAS' && item.fechaPlanificacion !== filterDate) return false;
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
  const ultimoRegistro = changeHistoryList[0] || null;

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
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro y auditoría de modificaciones de dotación, camiones y rutas al guardar disponibilización.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'audit'
                  ? 'bg-white text-blue-700 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={14} />
              Registro de Auditoría
              {changeHistoryList.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {changeHistoryList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('asignaciones_cliente')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'asignaciones_cliente'
                  ? 'bg-white text-indigo-700 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet size={14} />
              Asignaciones por Cliente
              <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase">
                Tool
              </span>
            </button>
          </div>

          {activeTab === 'audit' && (
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
            >
              <Download size={14} />
              Exportar Excel
            </Button>
          )}

          {activeTab === 'asignaciones_cliente' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIframeKey(k => k + 1)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                title="Recargar herramienta"
              >
                <RefreshCw size={14} />
              </button>
              <Button
                onClick={() => window.open('/asignaciones-por-cliente.html', '_blank')}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <ExternalLink size={13} />
                Abrir en Ventana Completa
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'audit' ? (
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Último Usuario</p>
                <p className="text-sm font-black text-slate-800 truncate max-w-[130px]">
                  {ultimoRegistro?.usuario || 'Sin registros'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <User size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Última Modificación</p>
                <p className="text-xs font-mono font-bold text-emerald-700 truncate max-w-[140px]">
                  {ultimoRegistro?.horaModificada || 'N/A'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Calendar size={20} />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Buscar ruta, cliente, conductor o usuario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-3 py-1 text-xs border border-slate-200 rounded-lg w-64 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Date Filter */}
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none"
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
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none"
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
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none max-w-[160px]"
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
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 focus:outline-none max-w-[140px]"
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRecords.map((r, idx) => {
                    const isCondDiff = r.conductorAntiguo !== r.conductorModificado;
                    const isAuxDiff = r.auxiliarAntiguo !== r.auxiliarModificado;
                    const isCamDiff = r.camionAntiguo !== r.camionModificado;
                    const isVueltaDiff = r.vueltaAntigua !== r.vueltaModificada;

                    return (
                      <tr key={r.id || idx} className="hover:bg-blue-50/30 transition-colors">
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

                        {/* Conductor */}
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

                        {/* Auxiliar */}
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

                        {/* Camión */}
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
                      </tr>
                    );
                  })}

                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan="11" className="p-8 text-center text-slate-400 italic">
                        No se encontraron registros de cambios con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        /* Asignaciones por Cliente View (Requisito 3) */
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden p-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-indigo-600" size={18} />
              <div>
                <h3 className="font-bold text-xs text-slate-800">
                  Asignaciones por Cliente (Reporte Dinámico Interactivo)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Herramienta interactiva de consolidación por cliente, transportista y métricas de carga.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIframeKey(k => k + 1)}
                className="text-xs flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                title="Recargar herramienta"
              >
                <RefreshCw size={12} />
                Recargar
              </button>
              <button
                onClick={() => window.open('/asignaciones-por-cliente.html', '_blank')}
                className="text-xs flex items-center gap-1 text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg font-bold transition-colors shadow-2xs"
              >
                <ExternalLink size={12} />
                Pantalla Completa
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 relative bg-slate-50">
            <iframe
              key={iframeKey}
              src="/asignaciones-por-cliente.html"
              title="Asignaciones por Cliente"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}

    </div>
  );
}
