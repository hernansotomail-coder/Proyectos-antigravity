import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cloud, History, Calendar, Download, UploadCloud, Trash2, 
  CheckCircle2, AlertTriangle, RefreshCw, X, FolderArchive, 
  HardDrive, Search, Eye, Database, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  fetchArchivedDatesFromDrive, 
  fetchArchivedDayFromDrive, 
  fetchArchivedMonthAttendanceFromDrive,
  scanSupabaseForArchivableData,
  archiveAndPurgeDatesFromSupabase,
  uploadSingleDayToDrive
} from '../lib/googleDriveArchive';
import { usePlanningStore, normalizeDate, persistAssignmentsToDb } from '../store/planningStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { Button } from './ui/Button';

/**
 * Botón + Modal Universal de Consulta Temporal e Histórico Google Drive
 * Se integra en todos los menús que almacenan información día a día.
 *
 * @param {string} currentMenu Nombre del menú actual ('Disponibilización', 'Ruteo', 'Estatus Diario', 'Asistencia', etc.)
 * @param {string} activeDate Fecha actualmente seleccionada en el menú (DD-MM-YYYY)
 * @param {function} onSelectDate Callback cuando el usuario carga una fecha desde Google Drive: (fechaDmy, dayData) => void
 * @param {function} onSelectMonthAttendance Callback opcional para Asistencia: (yearMonth, attendanceRows) => void
 * @param {object} customCurrentDayPayload Payload opcional del día actual (ej. EstatusDiario) para respaldar en un clic
 */
export default function DriveTimeMachineButton({
  currentMenu = 'Módulo Diario',
  activeDate = '',
  onSelectDate = null,
  onSelectMonthAttendance = null,
  customCurrentDayPayload = null,
  compact = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('consultar'); // 'consultar' | 'archivar'

  // Estado Pestaña 1: Consultar en Google Drive
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [driveDatesList, setDriveDatesList] = useState([]); // [{ fecha, month, fileId, sizeBytes, updatedAt }]
  const [driveMonthsMap, setDriveMonthsMap] = useState({});
  const [selectedMonthFilter, setSelectedMonthFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingDateKey, setLoadingDateKey] = useState(null);

  // Estado Pestaña 2: Archivar > 30 días (y > 60 días en Gestión de Dotación / Asistencia) y liberar espacio en Supabase
  const isDotacionMenu = currentMenu === 'Asistencia' || currentMenu.toLowerCase().includes('dotación') || currentMenu.toLowerCase().includes('dotacion');
  const [isScanningSupabase, setIsScanningSupabase] = useState(false);
  const [retentionDays, setRetentionDays] = useState(isDotacionMenu ? 60 : 30);
  const [attendanceRetentionDays, setAttendanceRetentionDays] = useState(60); // Gestión de dotación siempre mantiene 2 meses (60 días) por defecto
  const [scanResult, setScanResult] = useState(null);
  const [selectedToArchive, setSelectedToArchive] = useState([]);
  const [purgeAfterArchive, setPurgeAfterArchive] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);

  const { 
    loadedDriveDates = {}, 
    injectDriveArchivedDayToMemory, 
    removePurgedDatesFromLocalState,
    transmittedAssignments
  } = usePlanningStore();
  const { injectDriveAttendanceToMemory } = useAttendanceStore();

  const cleanActiveDate = normalizeDate(activeDate) || activeDate;
  const isCurrentDateFromDrive = Boolean(cleanActiveDate && loadedDriveDates[cleanActiveDate]);

  // Cargar listado de Google Drive al abrir el modal
  const loadDriveCatalog = async () => {
    setIsLoadingDrive(true);
    try {
      const res = await fetchArchivedDatesFromDrive();
      setDriveDatesList(res.dates || []);
      setDriveMonthsMap(res.months || {});
    } catch (err) {
      console.error('Error listando fechas de Google Drive:', err);
      toast.error('Error al conectar con Google Drive: ' + (err.message || 'Verifica conexión'));
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Escanear Supabase al cambiar a la pestaña de Archivado
  const runSupabaseScan = async (days = retentionDays, attDays = attendanceRetentionDays) => {
    setIsScanningSupabase(true);
    try {
      const effectiveAttDays = isDotacionMenu ? days : attDays;
      const res = await scanSupabaseForArchivableData(days, effectiveAttDays);
      setScanResult(res);
      // Pre-seleccionar automáticamente según el menú actual:
      // - Si estamos en Gestión de Dotación (Asistencia), seleccionar solo las fechas con > 60 días (2 meses)
      // - En los demás menús, seleccionar las fechas con > 30 días (1 mes)
      const autoSelected = (res.allDays || [])
        .filter(d => isDotacionMenu ? (d.isOlderThanAttendanceCutoff && d.attendance?.length > 0) : d.isOlderThanCutoff)
        .map(d => d.fecha);
      setSelectedToArchive(autoSelected);
    } catch (err) {
      console.error('Error escaneando Supabase:', err);
      toast.error('Error al analizar fechas en Supabase: ' + (err.message || ''));
    } finally {
      setIsScanningSupabase(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDriveCatalog();
      if (activeTab === 'archivar') {
        runSupabaseScan(retentionDays);
      }
    }
  }, [isOpen, activeTab]);

  // Meses disponibles en Google Drive ordenados descendentemente
  const availableMonths = useMemo(() => {
    const months = Object.keys(driveMonthsMap || {});
    driveDatesList.forEach(d => {
      if (d.month && !months.includes(d.month)) months.push(d.month);
    });
    return months.sort().reverse();
  }, [driveMonthsMap, driveDatesList]);

  // Fechas filtradas en la pestaña de Consulta Temporal
  const filteredDriveDates = useMemo(() => {
    return (driveDatesList || [])
      .filter(item => {
        if (selectedMonthFilter !== 'TODOS' && item.month !== selectedMonthFilter) return false;
        if (searchQuery && !String(item.fecha).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = String(a.fecha).split('-');
        const pb = String(b.fecha).split('-');
        const ta = pa.length === 3 ? new Date(Number(pa[2]), Number(pa[1]) - 1, Number(pa[0])).getTime() : 0;
        const tb = pb.length === 3 ? new Date(Number(pb[2]), Number(pb[1]) - 1, Number(pb[0])).getTime() : 0;
        return tb - ta;
      });
  }, [driveDatesList, selectedMonthFilter, searchQuery]);

  // Acción: Consultar una fecha específica desde Google Drive
  const handleLoadDayFromDrive = async (fechaDmy, restoreToSupabase = false) => {
    setLoadingDateKey(fechaDmy);
    try {
      const res = await fetchArchivedDayFromDrive(fechaDmy);
      const dayData = res.data || {};

      // 1. Inyectar en memoria de planningStore (Rutas, Disponibilización, Ruteo, Briefing, Histórico, Cambios)
      injectDriveArchivedDayToMemory(fechaDmy, dayData, res.archivedAt);

      // 2. Si trae asistencia, inyectar en attendanceStore en memoria
      if (Array.isArray(dayData.attendance) && dayData.attendance.length > 0) {
        injectDriveAttendanceToMemory(dayData.attendance);
      }

      // 3. Si el usuario pidió restaurar permanentemente a Supabase
      if (restoreToSupabase && Array.isArray(dayData.assignments) && dayData.assignments.length > 0) {
        await persistAssignmentsToDb(fechaDmy, dayData.assignments);
        toast.success(`Fecha ${fechaDmy} restaurada permanentemente en Supabase.`);
      } else {
        toast.success(`Consulta Temporal cargada desde Google Drive: ${fechaDmy}`);
      }

      if (onSelectDate) {
        onSelectDate(normalizeDate(fechaDmy) || fechaDmy, dayData);
      }
      setIsOpen(false);
    } catch (err) {
      console.error('Error cargando día desde Drive:', err);
      toast.error(err.message || `No se pudo cargar la fecha ${fechaDmy}`);
    } finally {
      setLoadingDateKey(null);
    }
  };

  // Acción especial para menú Asistencia: Cargar mes completo desde Google Drive
  const handleLoadMonthAttendanceFromDrive = async (yearMonth) => {
    setLoadingDateKey(yearMonth);
    try {
      const res = await fetchArchivedMonthAttendanceFromDrive(yearMonth);
      const attRows = res.attendance || [];
      if (attRows.length === 0) {
        toast.warning(`El mes ${yearMonth} en Google Drive no contiene registros de asistencia.`);
        return;
      }
      injectDriveAttendanceToMemory(attRows);
      if (onSelectMonthAttendance) {
        onSelectMonthAttendance(yearMonth, attRows);
      }
      toast.success(`Asistencia histórica de ${yearMonth} cargada desde Google Drive (${attRows.length} registros en ${res.daysCount} días).`);
      setIsOpen(false);
    } catch (err) {
      toast.error('Error cargando mes de asistencia desde Drive: ' + err.message);
    } finally {
      setLoadingDateKey(null);
    }
  };

  // Acción: Respaldar inmediatamente la fecha activa en Google Drive (sin borrarla de Supabase)
  const handleBackupCurrentDateNow = async () => {
    if (!cleanActiveDate) {
      toast.warning('No hay una fecha activa seleccionada para respaldar.');
      return;
    }
    setLoadingDateKey('backup-current');
    try {
      const currentAssigns = transmittedAssignments?.[cleanActiveDate] || [];
      const payload = {
        fecha: cleanActiveDate,
        assignments: currentAssigns,
        ...(customCurrentDayPayload || {})
      };
      await uploadSingleDayToDrive(cleanActiveDate, payload);
      toast.success(`¡Fecha actual (${cleanActiveDate}) respaldada en Google Drive!`);
      await loadDriveCatalog();
    } catch (err) {
      toast.error('Error al respaldar fecha actual: ' + err.message);
    } finally {
      setLoadingDateKey(null);
    }
  };

  // Acción: Ejecutar Archivado en Google Drive + Liberación de espacio en Supabase
  const handleExecuteArchiveAndPurge = async () => {
    if (selectedToArchive.length === 0) {
      toast.warning('Selecciona al menos una fecha para archivar en Google Drive.');
      return;
    }

    const confirmMsg = purgeAfterArchive
      ? `¿Confirmas respaldar ${selectedToArchive.length} fecha(s) en Google Drive y liberar su espacio en Supabase? (Podrás consultarlas siempre desde este botón "Consulta Temporal").`
      : `¿Confirmas respaldar ${selectedToArchive.length} fecha(s) en Google Drive (manteniéndolas también en Supabase)?`;

    if (!window.confirm(confirmMsg)) return;

    setIsArchiving(true);
    try {
      const effectiveAttDays = isDotacionMenu ? retentionDays : attendanceRetentionDays;
      const res = await archiveAndPurgeDatesFromSupabase(selectedToArchive, {
        purgeFromSupabase: purgeAfterArchive,
        retentionDays,
        attendanceRetentionDays: effectiveAttDays
      });

      if (res.ok) {
        if (purgeAfterArchive && res.confirmedDates?.length > 0 && !isDotacionMenu) {
          removePurgedDatesFromLocalState(res.confirmedDates);
        }
        toast.success(
          purgeAfterArchive
            ? `¡Éxito! ${res.archivedCount} fecha(s) guardadas en Google Drive. Se liberaron ${res.purgedCount} días de Planificación (>1 mes) y ${res.purgedAttendanceDays || 0} días de Dotación/Asistencia (>2 meses).`
            : `¡Éxito! ${res.archivedCount} fecha(s) respaldadas en Google Drive.`
        );
        await loadDriveCatalog();
        await runSupabaseScan(retentionDays, effectiveAttDays);
      }
    } catch (err) {
      console.error('Error en archivado y purga:', err);
      toast.error('Error durante el archivado: ' + (err.message || ''));
    } finally {
      setIsArchiving(false);
    }
  };

  const toggleSelectArchiveDate = (fecha) => {
    setSelectedToArchive(prev =>
      prev.includes(fecha) ? prev.filter(d => d !== fecha) : [...prev, fecha]
    );
  };

  return (
    <>
      {/* Botón Disparador e Indicador de Consulta Temporal Activa */}
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 font-bold rounded-xl transition-all cursor-pointer shadow-2xs border ${
            isCurrentDateFromDrive
              ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
          } ${compact ? 'px-2.5 py-1 text-[11px] h-7.5' : 'px-3 py-1.5 text-xs'}`}
          title="Consultar fechas históricas guardadas en Google Drive o archivar datos de más de 1 mes para liberar espacio en Supabase"
        >
          <History size={compact ? 13 : 15} className={isCurrentDateFromDrive ? 'text-amber-100' : 'text-indigo-600'} />
          <span>{isCurrentDateFromDrive ? `Drive: ${cleanActiveDate}` : 'Consulta Temporal (Drive)'}</span>
        </button>

        {isCurrentDateFromDrive && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
            <HardDrive size={11} />
            Respaldo Histórico Drive (En Memoria)
          </span>
        )}
      </div>

      {/* Modal Principal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
            
            {/* Cabecera del Modal */}
            <div className="p-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                  <HardDrive size={20} className="text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black tracking-tight">
                      Consulta Temporal e Histórico en Google Drive
                    </h2>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                      Conectado a Drive
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Menú activo: <strong className="text-white">{currentMenu}</strong> — Consulta fechas pasadas sin ocupar espacio en Supabase o archiva datos &gt; 30 días.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Selector de Pestañas */}
            <div className="px-4 pt-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('consultar')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'consultar'
                      ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  <History size={15} />
                  1. Consultar Fechas Hacia Atrás ({driveDatesList.length} en Drive)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('archivar')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeTab === 'archivar'
                      ? 'bg-white text-emerald-700 border-emerald-600 shadow-2xs'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  <FolderArchive size={15} />
                  {isDotacionMenu
                    ? '2. Archivar Dotación (>2 meses / 60 días) y Liberar Supabase'
                    : '2. Archivar (>1 mes Operación / >2 meses Dotación) y Liberar Supabase'}
                </button>
              </div>

              {cleanActiveDate && (
                <button
                  type="button"
                  onClick={handleBackupCurrentDateNow}
                  disabled={loadingDateKey === 'backup-current'}
                  className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Guardar una copia de la fecha actual directamente en Google Drive"
                >
                  <UploadCloud size={14} />
                  {loadingDateKey === 'backup-current'
                    ? 'Respaldando...'
                    : `Respaldar día actual (${cleanActiveDate}) en Drive`}
                </button>
              )}
            </div>

            {/* Contenido del Modal */}
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              
              {/* PESTAÑA 1: CONSULTA TEMPORAL HACIA ATRÁS */}
              {activeTab === 'consultar' && (
                <div className="space-y-4">
                  {/* Barra de filtros de búsqueda en Drive */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar size={15} className="text-indigo-600" />
                        <span className="text-xs font-bold text-slate-700">Mes:</span>
                        <select
                          value={selectedMonthFilter}
                          onChange={(e) => setSelectedMonthFilter(e.target.value)}
                          className="text-xs font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="TODOS">Todos los meses ({driveDatesList.length} días)</option>
                          {availableMonths.map(m => (
                            <option key={m} value={m}>
                              {m} ({(driveMonthsMap[m] || []).length} días)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar fecha (DD-MM-YYYY)..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {onSelectMonthAttendance && selectedMonthFilter !== 'TODOS' && (
                        <Button
                          onClick={() => handleLoadMonthAttendanceFromDrive(selectedMonthFilter)}
                          disabled={loadingDateKey === selectedMonthFilter}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                        >
                          <Download size={13} />
                          Cargar Mes Completo ({selectedMonthFilter}) en Asistencia
                        </Button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={loadDriveCatalog}
                      disabled={isLoadingDrive}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 cursor-pointer"
                    >
                      <RefreshCw size={13} className={isLoadingDrive ? 'animate-spin text-indigo-600' : ''} />
                      Actualizar lista Drive
                    </button>
                  </div>

                  {/* Tabla de Fechas en Google Drive */}
                  {isLoadingDrive ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <RefreshCw size={24} className="animate-spin text-indigo-600" />
                      <p className="text-xs font-semibold">Consultando carpeta histórica en Google Drive...</p>
                    </div>
                  ) : filteredDriveDates.length === 0 ? (
                    <div className="py-10 px-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                      <FolderArchive size={32} className="mx-auto text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">
                        Aún no hay fechas archivadas en tu carpeta de Google Drive
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Ve a la pestaña <strong>"2. Archivar Mes Anterior (&gt;30 días) y Liberar Supabase"</strong> o haz clic en el botón azul <strong>"Respaldar día actual en Drive"</strong> arriba a la derecha para guardar tu primer respaldo.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3.5 py-2.5">Fecha Archivada</th>
                            <th className="px-3.5 py-2.5">Carpeta Mes</th>
                            <th className="px-3.5 py-2.5">Tamaño</th>
                            <th className="px-3.5 py-2.5">Último Respaldo</th>
                            <th className="px-3.5 py-2.5 text-right">Acciones de Consulta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDriveDates.map((item) => {
                            const isLoaded = Boolean(loadedDriveDates[normalizeDate(item.fecha)]);
                            const isThisLoading = loadingDateKey === item.fecha;
                            const sizeKb = item.sizeBytes ? `${(item.sizeBytes / 1024).toFixed(1)} KB` : '—';
                            const updatedStr = item.updatedAt ? new Date(item.updatedAt).toLocaleString('es-CL') : '—';

                            return (
                              <tr key={item.fileId || item.fecha} className="hover:bg-indigo-50/40 transition-colors">
                                <td className="px-3.5 py-2.5 font-black text-slate-900 flex items-center gap-2">
                                  <Calendar size={14} className="text-indigo-600" />
                                  {item.fecha}
                                  {isLoaded && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-bold">
                                      Cargado en vista
                                    </span>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 font-semibold text-slate-600">{item.month}</td>
                                <td className="px-3.5 py-2.5 font-mono text-slate-500">{sizeKb}</td>
                                <td className="px-3.5 py-2.5 text-slate-500">{updatedStr}</td>
                                <td className="px-3.5 py-2.5 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleLoadDayFromDrive(item.fecha, false)}
                                      disabled={isThisLoading}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                      title="Carga los datos en este menú temporalmente en memoria sin gastar espacio en Supabase"
                                    >
                                      <Eye size={13} />
                                      {isThisLoading ? 'Cargando...' : 'Consultar en Pantalla'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleLoadDayFromDrive(item.fecha, true)}
                                      disabled={isThisLoading}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
                                      title="Restaurar esta fecha de vuelta a la base de datos Supabase si necesitas volver a editarla permanentemente"
                                    >
                                      <Database size={12} />
                                      Restaurar a Supabase
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* PESTAÑA 2: ARCHIVAR MES ANTERIOR (> 30 DÍAS) Y LIBERAR SUPABASE */}
              {activeTab === 'archivar' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-xl">
                      <h3 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-600" />
                        Retención Diferenciada: 1 Mes Operación (30 días) | 2 Meses Gestión de Dotación (60 días)
                      </h3>
                      <p className="text-[11px] text-emerald-800">
                        Los módulos de <strong>Planificación y Transporte</strong> se envían a Google Drive y liberan espacio tras <strong>1 mes (30 días)</strong>. La información de <strong>Gestión de Dotación (Asistencia)</strong> se conserva en Supabase durante <strong>2 meses (60 días)</strong> antes de liberarse.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-700">Antigüedad a archivar:</label>
                      <select
                        value={retentionDays}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setRetentionDays(val);
                          const attVal = val === 0 ? 0 : Math.max(60, val);
                          setAttendanceRetentionDays(attVal);
                          runSupabaseScan(val, attVal);
                        }}
                        className="text-xs font-bold bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                      >
                        <option value={60}>Más de 60 días (2 meses — Gestión de Dotación)</option>
                        <option value={30}>Más de 30 días (1 mes — Planificación y Transporte)</option>
                        <option value={15}>Más de 15 días</option>
                        <option value={7}>Más de 7 días</option>
                        <option value={0}>Mostrar todas las fechas en Supabase</option>
                      </select>
                    </div>
                  </div>

                  {/* Controles de selección y ejecución */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const oldDates = (scanResult?.archivableOldDays || []).map(d => d.fecha);
                          setSelectedToArchive(oldDates);
                        }}
                        className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Seleccionar &gt;{retentionDays} días ({scanResult?.archivableOldDays?.length || 0})
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const all = (scanResult?.allDays || []).map(d => d.fecha);
                          setSelectedToArchive(all);
                        }}
                        className="text-xs font-semibold text-slate-600 hover:underline cursor-pointer"
                      >
                        Seleccionar todas ({scanResult?.allDays?.length || 0})
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedToArchive([])}
                        className="text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
                      >
                        Limpiar selección
                      </button>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={purgeAfterArchive}
                        onChange={(e) => setPurgeAfterArchive(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Eliminar de Supabase tras confirmar respaldo en Google Drive (Liberar espacio)</span>
                    </label>
                  </div>

                  {/* Lista de fechas detectadas en Supabase */}
                  {isScanningSupabase ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <RefreshCw size={24} className="animate-spin text-emerald-600" />
                      <p className="text-xs font-semibold">Analizando tablas de Supabase...</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2.5 w-10 text-center">Sel.</th>
                            <th className="px-3 py-2.5">Fecha en Supabase</th>
                            <th className="px-3 py-2.5">Antigüedad</th>
                            <th className="px-3 py-2.5 text-center">Rutas / Disp.</th>
                            <th className="px-3 py-2.5 text-center">Cambios Audit.</th>
                            <th className="px-3 py-2.5 text-center">Asistencia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(scanResult?.allDays || []).map((day) => {
                            const isChecked = selectedToArchive.includes(day.fecha);
                            return (
                              <tr
                                key={day.fecha}
                                onClick={() => toggleSelectArchiveDate(day.fecha)}
                                className={`cursor-pointer transition-colors ${
                                  isChecked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                  />
                                </td>
                                <td className="px-3 py-2 font-black text-slate-900">{day.fecha}</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {day.isOlderThanCutoff ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                        Operación &gt; 1 mes (Archivar)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                        Operación &le; 1 mes
                                      </span>
                                    )}
                                    {day.attendance?.length > 0 && (
                                      day.isOlderThanAttendanceCutoff ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                          Dotación &gt; 2 meses (Archivar)
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          Dotación protegida (&le; 2 meses)
                                        </span>
                                      )
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-slate-700">
                                  {day.assignments?.length || 0} rutas
                                </td>
                                <td className="px-3 py-2 text-center text-slate-600">
                                  {day.changeHistory?.length || 0}
                                </td>
                                <td className="px-3 py-2 text-center text-slate-600">
                                  {day.attendance?.length || 0} reg.
                                </td>
                              </tr>
                            );
                          })}
                          {(!scanResult?.allDays || scanResult.allDays.length === 0) && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                                No se encontraron fechas registradas en Supabase.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Botón de Ejecución */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      onClick={handleExecuteArchiveAndPurge}
                      disabled={isArchiving || selectedToArchive.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <UploadCloud size={16} />
                      {isArchiving
                        ? 'Archivando en Google Drive...'
                        : purgeAfterArchive
                          ? `Archivar en Drive y Liberar ${selectedToArchive.length} fecha(s) de Supabase`
                          : `Solo Respaldar ${selectedToArchive.length} fecha(s) en Google Drive`}
                    </Button>
                  </div>
                </div>
              )}

            </div>

            {/* Pie del Modal */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
              <span>
                📂 Los archivos se organizan automáticamente en carpetas <strong>YYYY-MM / DD-MM-YYYY.json</strong> en tu Google Drive.
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-xl font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
