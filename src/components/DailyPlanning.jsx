import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  Upload, FileSpreadsheet, Sparkles, Send, CheckCircle2, 
  ChevronRight, ChevronDown, Search, ArrowRight, Table, 
  Layers, Package, MapPin, Calendar, Clock, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { Button } from './ui/Button';

export default function DailyPlanning() {
  const navigate = useNavigate();
  const { 
    rawRows, 
    fileName, 
    transformedRoutes, 
    isTransformed, 
    setRawRows, 
    transformRawRows, 
    transmitToDisponibilizacion 
  } = usePlanningStore();

  const [activeTab, setActiveTab] = useState(isTransformed ? 'ruteo' : 'carga'); // 'carga' | 'ruteo'
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  // Transmit to Disponibilización
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

              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleTransmit}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm"
                >
                  <Send size={14} />
                  Transmitir a Disponibilización
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
                          <td className="px-4 py-2 font-black text-slate-800 text-sm">{route.ruta}</td>
                          <td className="px-4 py-2 font-semibold text-slate-700">{route.nombreRuta}</td>
                          <td className="px-4 py-2 text-center font-bold">
                            <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full text-xs">
                              {route.recuentoDestino}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">{route.sumaVolumen}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaPeso}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaCantCJ}</td>
                        </tr>

                        {/* Paradas Detail Accordion */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan="8" className="p-3 pl-12">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner">
                                <h5 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                                  <MapPin size={14} className="text-red-500" />
                                  Detalle de Destinos / Paradas de Ruta {route.ruta} ({route.paradas.length} paradas):
                                </h5>
                                <div className="max-h-60 overflow-auto">
                                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-600">
                                      <tr>
                                        <th className="px-2.5 py-1.5">Sec</th>
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
                                        <tr key={pIdx} className="hover:bg-slate-50">
                                          <td className="px-2.5 py-1 font-bold text-slate-500">{p.secuencia}</td>
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
                      <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
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

    </div>
  );
}
