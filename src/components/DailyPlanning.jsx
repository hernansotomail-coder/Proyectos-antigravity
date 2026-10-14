import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  Upload, FileSpreadsheet, Sparkles, Send, CheckCircle2, 
  ChevronRight, ChevronDown, Search, ArrowRight, Table, 
  Layers, Package, MapPin, Calendar, Clock, AlertCircle,
  GitFork, Scissors, Plus, X, CheckSquare, Square, CornerDownRight
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { Button } from './ui/Button';

// Componente de Badge para columna Ambiente (Requisitos 2 y 3)
export function AmbienteBadge({ ambiente }) {
  const amb = String(ambiente || 'S').trim().toUpperCase();
  if (amb === 'C') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs" title="Congelado (C)">
        C
      </span>
    );
  }
  if (amb === 'R') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" title="Refrigerado (R)">
        R
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs" title="Seco (S)">
      S
    </span>
  );
}

export default function DailyPlanning() {
  const navigate = useNavigate();
  const { 
    rawRows, 
    fileName, 
    transformedRoutes, 
    isTransformed, 
    setRawRows, 
    transformRawRows, 
    transmitToDisponibilizacion,
    aperturarRuta,
    transmitSpecificRoutesToDisponibilizacion
  } = usePlanningStore();

  const [activeTab, setActiveTab] = useState(isTransformed ? 'ruteo' : 'carga'); // 'carga' | 'ruteo'
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Estados para Modal "Aperturar Ruta" (Requisitos 2, 3 y 4)
  const [isAperturarModalOpen, setIsAperturarModalOpen] = useState(false);
  const [selectedSourceRouteId, setSelectedSourceRouteId] = useState('');
  const [newRouteNumber, setNewRouteNumber] = useState('');
  const [newRouteName, setNewRouteName] = useState('');
  const [newTransportista, setNewTransportista] = useState('');
  const [selectedParadaIds, setSelectedParadaIds] = useState([]);
  const [selectedAmbientes, setSelectedAmbientes] = useState(['C', 'R', 'S']);
  const [filterTableAmbiente, setFilterTableAmbiente] = useState('TODOS');

  // Handle Excel file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });

        // Find sheet named 'Sheet1' (case insensitive) or fallback to first sheet
        const sheetName = wb.SheetNames.find(s => s.toLowerCase() === 'sheet1') || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // Convert to JSON
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          toast.error('El archivo Excel no contiene filas o está vacío.');
          setIsLoading(false);
          return;
        }

        setRawRows(data, file.name);
        toast.success(`Archivo cargado: ${data.length} filas leídas de "${sheetName}"`);
        setActiveTab('carga');
      } catch (err) {
        console.error('Error al leer Excel:', err);
        toast.error('No se pudo procesar el archivo Excel. Verifica el formato.');
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo en el navegador.');
      setIsLoading(false);
    };

    reader.readAsBinaryString(file);
    e.target.value = ''; // reset input
  };

  // Run transformation
  const handleTransform = () => {
    const ok = transformRawRows();
    if (ok) {
      setActiveTab('ruteo');
    }
  };

  // Transmit ALL to Disponibilización
  const handleTransmit = () => {
    const ok = transmitToDisponibilizacion();
    if (ok) {
      toast.success('Rutas transmitidas. Redirigiendo a Disponibilización...', {
        action: {
          label: 'Ir Ahora',
          onClick: () => navigate('/assignment')
        }
      });
    }
  };

  // Transmit ONLY specific routes (Requisito 4: mantiene el resto en Disponibilización)
  const handleTransmitSpecific = (routeIds) => {
    const ok = transmitSpecificRoutesToDisponibilizacion(routeIds);
    if (ok) {
      toast.success('Ruta(s) transmitida(s) a Disponibilización manteniendo el resto intacto.', {
        action: {
          label: 'Ver Disponibilización',
          onClick: () => navigate('/assignment')
        }
      });
    }
  };

  // Transmit ALL modified/aperturadas routes (Requisito 4)
  const handleTransmitModified = () => {
    const modified = transformedRoutes.filter(r => r.isModified);
    if (modified.length === 0) {
      toast.info('No hay rutas modificadas o aperturadas pendientes de transmitir.');
      return;
    }
    handleTransmitSpecific(modified.map(r => r.id));
  };

  // Aperturar Ruta Modal Handlers (Requisitos 2, 3 y 4)
  const handleOpenAperturarModal = (preselectedRoute = null) => {
    const source = preselectedRoute || transformedRoutes[0] || null;
    if (source) {
      setSelectedSourceRouteId(source.id);
      setNewRouteNumber(`${source.ruta}-B`);
      setNewRouteName(`${source.nombreRuta} (Aperturada)`);
      setNewTransportista(source.transportista || '');
      setSelectedParadaIds([]);
      const sourceAmbs = Array.from(new Set((source.paradas || []).map(p => p.ambiente))).filter(Boolean);
      setSelectedAmbientes(sourceAmbs.length > 0 ? sourceAmbs : ['C', 'R', 'S']);
      setFilterTableAmbiente('TODOS');
    } else {
      setSelectedSourceRouteId('');
      setNewRouteNumber('');
      setNewRouteName('');
      setNewTransportista('');
      setSelectedParadaIds([]);
      setSelectedAmbientes(['C', 'R', 'S']);
      setFilterTableAmbiente('TODOS');
    }
    setIsAperturarModalOpen(true);
  };

  const currentSourceRoute = useMemo(() => {
    return transformedRoutes.find(r => r.id === selectedSourceRouteId) || transformedRoutes[0] || null;
  }, [transformedRoutes, selectedSourceRouteId]);

  const toggleSelectParada = (paradaId) => {
    setSelectedParadaIds(prev => 
      prev.includes(paradaId) ? prev.filter(id => id !== paradaId) : [...prev, paradaId]
    );
  };

  const handleSelectAllParadas = () => {
    if (!currentSourceRoute?.paradas) return;
    const allIds = currentSourceRoute.paradas.map((p, idx) => p.id || `${currentSourceRoute.ruta}-${idx}`);
    setSelectedParadaIds(allIds);
  };

  const handleClearAllParadas = () => {
    setSelectedParadaIds([]);
  };

  const handleSelectParadasByAmbiente = (amb) => {
    if (!currentSourceRoute?.paradas) return;
    const matchingIds = currentSourceRoute.paradas
      .filter(p => !amb || amb === 'TODOS' || p.ambiente === amb)
      .map((p, idx) => p.id || `${currentSourceRoute.ruta}-${idx}`);
    setSelectedParadaIds(prev => Array.from(new Set([...prev, ...matchingIds])));
  };

  const handleConfirmAperturar = () => {
    if (!currentSourceRoute) {
      toast.error('Selecciona una ruta de origen');
      return;
    }
    if (!newRouteNumber.trim()) {
      toast.error('Ingresa una nueva numeración para la ruta (Ej: 1611-B)');
      return;
    }
    if (selectedParadaIds.length === 0) {
      toast.error('Debes seleccionar al menos una fila/parada para mover a la nueva ruta');
      return;
    }

    const selectedParadasAmbientes = Array.from(new Set(
      (currentSourceRoute.paradas || [])
        .filter(p => selectedParadaIds.includes(p.id || `${currentSourceRoute.ruta}-${p.secuencia}`))
        .map(p => p.ambiente)
    ));

    const ok = aperturarRuta(
      currentSourceRoute.id,
      newRouteNumber.trim(),
      newRouteName.trim(),
      newTransportista.trim(),
      selectedParadaIds,
      selectedParadasAmbientes
    );

    if (ok) {
      setIsAperturarModalOpen(false);
      setExpandedRoute(currentSourceRoute.id);
    }
  };

  // Filter transformed routes
  const filteredRoutes = transformedRoutes.filter(r => 
    r.ruta.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.nombreRuta.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.fecha.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Aggregated KPI numbers for Ruteo
  const totalRutas = transformedRoutes.length;
  const totalLocales = transformedRoutes.reduce((acc, r) => acc + (r.recuentoDestino || 0), 0);
  const totalVolumen = transformedRoutes.reduce((acc, r) => acc + (r.sumaVolumen || 0), 0).toFixed(2);
  const totalCajas = transformedRoutes.reduce((acc, r) => acc + (r.sumaCantCJ || 0), 0);
  const countModified = transformedRoutes.filter(r => r.isModified).length;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800">Asignación Diaria</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Importa el archivo de ruteo Sheet1, transforma en tabla dinámica y transmite a Disponibilización.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('carga')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'carga'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload size={15} />
              1. Importar Sheet1
              {rawRows.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {rawRows.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                if (!isTransformed && rawRows.length > 0) {
                  transformRawRows();
                }
                setActiveTab('ruteo');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'ruteo'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={15} />
              2. Ruteo (Tabla Dinámica)
              {transformedRoutes.length > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {transformedRoutes.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'carga' && rawRows.length > 0 && (
            <Button 
              onClick={handleTransform}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm text-xs font-bold px-4 py-2"
            >
              <Sparkles size={16} />
              Transformar
            </Button>
          )}

          {activeTab === 'ruteo' && transformedRoutes.length > 0 && (
            <Button 
              onClick={handleTransmit}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm text-xs font-bold px-4 py-2"
            >
              <Send size={15} />
              Transmitir a Disponibilización
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'carga' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          
          {/* Upload Area */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <FileSpreadsheet size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {fileName ? `Archivo: ${fileName}` : 'Carga Masiva de Planificación (Sheet1)'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              Arrastra o selecciona un archivo Excel (.xlsx, .xls) que contenga la hoja <span className="font-semibold text-slate-700">Sheet1</span> con las columnas de ruta, destinos, secuencia, volumen y fecha.
            </p>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <span className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm">
                  <Upload size={16} />
                  {rawRows.length > 0 ? 'Reemplazar Archivo Excel' : 'Seleccionar Archivo Excel'}
                </span>
              </label>

              {rawRows.length > 0 && (
                <Button 
                  onClick={handleTransform}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm"
                >
                  <Sparkles size={16} />
                  Transformar a Ruteo Dinámico
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>

          {/* Raw Rows Preview */}
          {rawRows.length > 0 && (
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Table size={16} className="text-blue-600" />
                  <h4 className="font-bold text-xs text-slate-800">
                    Vista Previa de Filas Importadas ({rawRows.length} registros)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500">
                  Listo para transformar en tabla dinámica tipo Hoja1
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-3 py-2 border-b">#</th>
                      <th className="px-3 py-2 border-b">Fecha</th>
                      <th className="px-3 py-2 border-b">Ruta</th>
                      <th className="px-3 py-2 border-b">Nombre Ruta</th>
                      <th className="px-3 py-2 border-b">Secuencia</th>
                      <th className="px-3 py-2 border-b">Destino</th>
                      <th className="px-3 py-2 border-b">Dirección</th>
                      <th className="px-3 py-2 border-b">Comuna</th>
                      <th className="px-3 py-2 border-b text-right">Volumen (m³)</th>
                      <th className="px-3 py-2 border-b text-right">Peso (kg)</th>
                      <th className="px-3 py-2 border-b text-right">Cant CJ</th>
                      <th className="px-3 py-2 border-b">Transportista</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rawRows.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-blue-700">{normalizeDate(row.Fecha || row.fecha)}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{row.Ruta || row.ruta}</td>
                        <td className="px-3 py-2 text-slate-700">{row['Nombre Ruta'] || row.nombre_ruta}</td>
                        <td className="px-3 py-2 text-slate-500">{row.Secuencia || row.secuencia}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{row.Destino || row.destino}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{row.Direccion || row.direccion}</td>
                        <td className="px-3 py-2 text-slate-600">{row.Comuna || row.comuna}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.Volumen || row.volumen || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.Peso || row.peso || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.cantCJ || row.cantcj || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.Transportista || row.transportista || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawRows.length > 100 && (
                <div className="p-2 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                  Mostrando las primeras 100 filas de {rawRows.length}. Presiona "Transformar" para agrupar todas las rutas.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ruteo Tab (Dynamic Pivot Table) */}
      {activeTab === 'ruteo' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rutas</p>
                <p className="text-2xl font-black text-slate-800">{totalRutas}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Layers size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Locales</p>
                <p className="text-2xl font-black text-indigo-700">{totalLocales}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <MapPin size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metros Cúbicos (m³)</p>
                <p className="text-2xl font-black text-emerald-700">{totalVolumen}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Package size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cajas</p>
                <p className="text-2xl font-black text-purple-700">{totalCajas}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Table size={20} />
              </div>
            </div>
          </div>

          {/* Ruteo Pivot Table */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Filtrar por Ruta o Nombre..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 bg-white"
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {filteredRoutes.length} de {transformedRoutes.length} rutas
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Botón Aperturar Ruta (Requisito 4) */}
                <Button 
                  onClick={() => handleOpenAperturarModal()}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm"
                  title="Dividir o aperturar una ruta quitando filas/paradas hacia una nueva numeración"
                >
                  <Scissors size={14} />
                  Aperturar Ruta
                </Button>

                {/* Botón Transmitir Modificadas (Requisito 4) */}
                {countModified > 0 && (
                  <Button 
                    onClick={handleTransmitModified}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm animate-pulse"
                    title="Transmite solo las rutas que fueron aperturadas o modificadas, manteniendo el resto en Disponibilización intacto"
                  >
                    <Sparkles size={14} />
                    Transmitir Modificadas ({countModified})
                  </Button>
                )}

                <Button 
                  onClick={handleTransmit}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm"
                  title="Transmite todas las rutas a Disponibilización"
                >
                  <Send size={14} />
                  Transmitir Todo
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => navigate('/assignment')}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-700"
                >
                  Ver Disponibilización <ArrowRight size={14} />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 w-10 text-center"></th>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Ruta</th>
                    <th className="px-4 py-2.5">Nombre Ruta (Cliente)</th>
                    <th className="px-4 py-2.5 text-center">Recuento distinto de Destino</th>
                    <th className="px-4 py-2.5 text-right">Suma de Volumen (m³)</th>
                    <th className="px-4 py-2.5 text-right">Suma de Peso (kg)</th>
                    <th className="px-4 py-2.5 text-right">Suma de cantCJ</th>
                    <th className="px-4 py-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRoutes.map((route) => {
                    const isExpanded = expandedRoute === route.id;
                    return (
                      <React.Fragment key={route.id}>
                        <tr 
                          onClick={() => setExpandedRoute(isExpanded ? null : route.id)}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 text-center text-slate-400">
                            {isExpanded ? <ChevronDown size={16} className="text-blue-600" /> : <ChevronRight size={16} />}
                          </td>
                          <td className="px-4 py-2 font-medium text-blue-700">{route.fecha}</td>
                          <td className="px-4 py-2 font-black text-slate-800 text-sm">
                            <div className="flex items-center gap-1.5">
                              <span>{route.ruta}</span>
                              {route.isAperturada && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded-full" title={`Aperturada desde Ruta ${route.parentRuta || ''}`}>
                                  Aperturada
                                </span>
                              )}
                              {route.isModified && !route.isAperturada && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.2 rounded-full" title="Ruta con paradas modificadas">
                                  Modificada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-700">{route.nombreRuta}</td>
                          <td className="px-4 py-2 text-center font-bold">
                            <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full text-xs">
                              {route.recuentoDestino}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">{route.sumaVolumen}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaPeso}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaCantCJ}</td>
                          <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenAperturarModal(route)}
                                className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors"
                                title="Aperturar / quitar paradas de esta ruta para crear una nueva"
                              >
                                <Scissors size={12} />
                                Aperturar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTransmitSpecific([route.id])}
                                className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition-colors"
                                title="Transmitir solo esta ruta a Disponibilización manteniendo el resto intacto"
                              >
                                <Send size={11} />
                                Transmitir
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Paradas Detail Accordion */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan="9" className="p-3 pl-12">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                                    <MapPin size={14} className="text-red-500" />
                                    Detalle de Destinos / Paradas de Ruta {route.ruta} ({route.paradas.length} paradas):
                                  </h5>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAperturarModal(route)}
                                    className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs hover:bg-blue-50"
                                  >
                                    <Scissors size={13} />
                                    Aperturar ruta desde aquí
                                  </button>
                                </div>
                                <div className="max-h-60 overflow-auto">
                                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-600">
                                      <tr>
                                        <th className="px-2.5 py-1.5">Sec</th>
                                        <th className="px-2.5 py-1.5 text-center">Ambiente</th>
                                        <th className="px-2.5 py-1.5">Destino</th>
                                        <th className="px-2.5 py-1.5">Dirección</th>
                                        <th className="px-2.5 py-1.5">Comuna</th>
                                        <th className="px-2.5 py-1.5">Horario</th>
                                        <th className="px-2.5 py-1.5 text-right">m³</th>
                                        <th className="px-2.5 py-1.5 text-right">Peso</th>
                                        <th className="px-2.5 py-1.5 text-right">CJ</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {route.paradas.map((p, pIdx) => (
                                        <tr key={p.id || pIdx} className="hover:bg-slate-50">
                                          <td className="px-2.5 py-1 font-bold text-slate-500">{p.secuencia}</td>
                                          <td className="px-2.5 py-1 text-center">
                                            <AmbienteBadge ambiente={p.ambiente} />
                                          </td>
                                          <td className="px-2.5 py-1 font-semibold text-slate-800">{p.destino}</td>
                                          <td className="px-2.5 py-1 text-slate-500">{p.direccion}</td>
                                          <td className="px-2.5 py-1 text-slate-600">{p.comuna}</td>
                                          <td className="px-2.5 py-1 text-slate-500 font-mono">
                                            {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                                          </td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.volumen}</td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.peso}</td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.cantCJ}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredRoutes.length === 0 && (
                    <tr>
                      <td colSpan="9" className="px-4 py-12 text-center text-slate-500">
                        {transformedRoutes.length === 0 
                          ? 'No se han transformado rutas aún. Ve a "1. Importar Sheet1" y haz clic en "Transformar".' 
                          : 'No se encontraron rutas con el filtro ingresado.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL APERTURAR RUTA (Requisito 4) */}
      {isAperturarModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Scissors size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Aperturar / Dividir Ruta</h3>
                  <p className="text-xs text-slate-500">
                    Selecciona una ruta de origen, quita filas/paradas y asígnalas a una nueva ruta con su propia numeración.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsAperturarModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
              
              {/* Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Ruta de Origen</label>
                  <select
                    value={selectedSourceRouteId}
                    onChange={(e) => {
                      setSelectedSourceRouteId(e.target.value);
                      const r = transformedRoutes.find(x => x.id === e.target.value);
                      if (r) {
                        setNewRouteNumber(`${r.ruta}-B`);
                        setNewRouteName(`${r.nombreRuta} (Aperturada)`);
                        setNewTransportista(r.transportista || '');
                        setSelectedParadaIds([]);
                        setFilterTableAmbiente('TODOS');
                      }
                    }}
                    className="w-full text-xs font-bold border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {transformedRoutes.map(r => (
                      <option key={r.id} value={r.id}>
                        Ruta {r.ruta} - {r.nombreRuta} ({r.paradas?.length || 0} paradas)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-blue-700 uppercase">Nueva Numeración *</label>
                  <input
                    type="text"
                    value={newRouteNumber}
                    onChange={(e) => setNewRouteNumber(e.target.value)}
                    placeholder="Ej: 1611-B o 1700"
                    className="w-full text-xs font-black border border-blue-300 rounded-lg p-1.5 bg-white text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nombre / Cliente</label>
                  <input
                    type="text"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    placeholder="Cliente de la nueva ruta"
                    className="w-full text-xs border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Transportista</label>
                  <input
                    type="text"
                    value={newTransportista}
                    onChange={(e) => setNewTransportista(e.target.value)}
                    placeholder="Ej: T300 o T405"
                    className="w-full text-xs border border-slate-200 rounded-lg p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Table of Paradas to transfer */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    Selecciona las filas / paradas a transferir a la nueva Ruta {newRouteNumber || '...'}:
                  </span>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {/* Filtro por Ambiente para la tabla */}
                    <div className="flex items-center gap-1 text-[10px] bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 font-semibold px-1">Ver:</span>
                      {['TODOS', 'C', 'R', 'S'].map(amb => (
                        <button
                          key={amb}
                          type="button"
                          onClick={() => setFilterTableAmbiente(amb)}
                          className={`px-1.5 py-0.5 rounded font-black transition-colors ${
                            filterTableAmbiente === amb 
                              ? 'bg-white text-blue-700 shadow-2xs' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {amb}
                        </button>
                      ))}
                    </div>

                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleSelectAllParadas}
                      className="text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Todas
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleSelectParadasByAmbiente('C')}
                      className="text-sky-700 hover:text-sky-900 font-bold"
                      title="Seleccionar paradas de Congelado (C)"
                    >
                      +Solo C
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectParadasByAmbiente('R')}
                      className="text-amber-700 hover:text-amber-900 font-bold"
                      title="Seleccionar paradas de Refrigerado (R)"
                    >
                      +Solo R
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectParadasByAmbiente('S')}
                      className="text-emerald-700 hover:text-emerald-900 font-bold"
                      title="Seleccionar paradas de Seco (S)"
                    >
                      +Solo S
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearAllParadas}
                      className="text-slate-500 hover:text-red-600 font-semibold"
                    >
                      Deseleccionar
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 text-[11px]">
                      <tr>
                        <th className="px-2.5 py-1.5 w-8 text-center">✓</th>
                        <th className="px-2 py-1.5">Sec</th>
                        <th className="px-2 py-1.5 text-center">Ambiente</th>
                        <th className="px-2 py-1.5">Destino</th>
                        <th className="px-2 py-1.5">Dirección</th>
                        <th className="px-2 py-1.5">Comuna</th>
                        <th className="px-2 py-1.5">Horario</th>
                        <th className="px-2 py-1.5 text-right">m³</th>
                        <th className="px-2 py-1.5 text-right">Peso (kg)</th>
                        <th className="px-2 py-1.5 text-right">CJ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(currentSourceRoute?.paradas || [])
                        .filter(p => filterTableAmbiente === 'TODOS' || p.ambiente === filterTableAmbiente)
                        .map((p, pIdx) => {
                          const pId = p.id || `${currentSourceRoute.ruta}-${pIdx}`;
                          const isChecked = selectedParadaIds.includes(pId);
                          return (
                            <tr 
                              key={pId} 
                              onClick={() => toggleSelectParada(pId)}
                              className={`cursor-pointer transition-colors ${
                                isChecked ? 'bg-blue-50/90 font-medium' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2.5 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectParada(pId)}
                                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-2 py-1 font-mono text-slate-500 text-[11px]">{p.secuencia}</td>
                              <td className="px-2 py-1 text-center">
                                <AmbienteBadge ambiente={p.ambiente} />
                              </td>
                              <td className="px-2 py-1 font-bold text-slate-800">{p.destino}</td>
                              <td className="px-2 py-1 text-slate-500 max-w-[150px] truncate">{p.direccion}</td>
                              <td className="px-2 py-1 text-slate-600">{p.comuna}</td>
                              <td className="px-2 py-1 text-slate-500 font-mono text-[11px]">
                                {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono font-bold text-emerald-700">{p.volumen}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-600">{p.peso}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-600">{p.cantCJ}</td>
                            </tr>
                          );
                        })}
                      {(currentSourceRoute?.paradas || []).length === 0 && (
                        <tr>
                          <td colSpan="10" className="p-4 text-center text-slate-400 italic">
                            Esta ruta no tiene paradas registradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Counter / Balance preview */}
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-2.5 mt-2 flex items-center justify-between text-xs text-blue-900 flex-wrap gap-2">
                  <div>
                    <span className="font-semibold">A transferir a Ruta {newRouteNumber || 'Nueva'}: </span>
                    <strong className="text-blue-800 font-bold">{selectedParadaIds.length} parada(s)</strong>
                  </div>
                  <div>
                    <span className="font-semibold">Quedarán en Ruta {currentSourceRoute?.ruta}: </span>
                    <strong className="text-slate-800 font-bold">
                      {Math.max(0, (currentSourceRoute?.paradas?.length || 0) - selectedParadaIds.length)} parada(s)
                    </strong>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
              <Button 
                variant="outline" 
                onClick={() => setIsAperturarModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmAperturar}
                disabled={selectedParadaIds.length === 0 || !newRouteNumber.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Scissors size={14} />
                Confirmar y Crear Ruta {newRouteNumber || ''}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
