import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Download, Calendar, Search, Filter, Layers, 
  MapPin, User, Truck, Package, Weight, CheckCircle2,
  ChevronDown, ChevronRight, ArrowUpDown, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

export default function RuteoView() {
  const { 
    savedRuteoByDate, 
    transmittedAssignments, 
    selectedRuteoDate, 
    setSelectedRuteoDate 
  } = usePlanningStore();

  // Fechas disponibles: combinamos las guardadas formalmente y las transmitidas
  const availableDates = useMemo(() => {
    const setDates = new Set([
      ...Object.keys(savedRuteoByDate || {}),
      ...Object.keys(transmittedAssignments || {})
    ]);
    return Array.from(setDates).sort();
  }, [savedRuteoByDate, transmittedAssignments]);

  const activeDate = selectedRuteoDate || availableDates[0] || '14-10-2026';

  // Rutas de la fecha activa: priorizamos las guardadas de Disponibilización, o usamos las transmitidas
  const currentRoutes = useMemo(() => {
    if (savedRuteoByDate && savedRuteoByDate[activeDate] && savedRuteoByDate[activeDate].length > 0) {
      return savedRuteoByDate[activeDate];
    }
    return transmittedAssignments[activeDate] || [];
  }, [savedRuteoByDate, transmittedAssignments, activeDate]);

  // Filtros
  const [filterCliente, setFilterCliente] = useState('');
  const [filterRuta, setFilterRuta] = useState('');
  const [filterConductor, setFilterConductor] = useState('');

  // Filas filtradas
  const filteredRoutes = useMemo(() => {
    return currentRoutes.filter(r => {
      if (filterRuta && !String(r.ruta || '').toLowerCase().includes(filterRuta.toLowerCase())) return false;
      if (filterCliente && !String(r.cliente || '').toLowerCase().includes(filterCliente.toLowerCase())) return false;
      if (filterConductor && !String(r.conductor_name || '').toLowerCase().includes(filterConductor.toLowerCase())) return false;
      return true;
    });
  }, [currentRoutes, filterRuta, filterCliente, filterConductor]);

  // Lista única de clientes y conductores para filtros
  const clientesList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.cliente).filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  const conductoresList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.conductor_name).filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  // Totales sumados requeridos: m³, Locales, Suma de Peso (kg), Cajas CJ
  const totalM3 = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(4);
  }, [filteredRoutes]);

  const totalLocales = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
  }, [filteredRoutes]);

  const totalPeso = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      // Suma el peso de la ruta o de sus paradas
      const pesoRow = parseFloat(r.peso) || (r.paradas || []).reduce((pAcc, p) => pAcc + (parseFloat(p.peso) || 0), 0);
      return acc + pesoRow;
    }, 0).toFixed(2);
  }, [filteredRoutes]);

  const totalCajas = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      const cjRow = parseInt(r.cantCJ, 10) || (r.paradas || []).reduce((cAcc, p) => cAcc + (parseInt(p.cantCJ, 10) || 0), 0);
      return acc + cjRow;
    }, 0);
  }, [filteredRoutes]);

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredRoutes.length === 0) {
      toast.error('No hay datos para exportar.');
      return;
    }

    try {
      const exportRows = [];

      filteredRoutes.forEach(r => {
        const paradas = r.paradas || [];
        if (paradas.length > 0) {
          paradas.forEach(p => {
            exportRows.push({
              'Fecha': r.fecha,
              'N° de Vuelta': r.n_vuelta || '1',
              'N° de Ruta': r.ruta,
              'Cliente / Nombre Ruta': r.cliente,
              'Conductor': r.conductor_name || 'Sin asignar',
              'RUT Conductor': r.conductor_rut || '',
              'Auxiliar 1': r.aux1_name || '',
              'RUT Auxiliar 1': r.aux1_rut || '',
              'Auxiliar 2': r.aux2_name || '',
              'RUT Auxiliar 2': r.aux2_rut || '',
              'Camión': r.camion || '',
              'Tipo de Equipo': r.tipo_equipo || '',
              'Rampla': r.rampla || '',
              'Tipo de Servicio': r.tipo_servicio || '',
              'Secuencia': p.secuencia,
              'Destino': p.destino,
              'Dirección': p.direccion,
              'Comuna': p.comuna,
              'Horario': p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '',
              'm³': p.volumen,
              'Peso (kg)': p.peso,
              'Cajas (CJ)': p.cantCJ,
              'Referencia': r.referencia || ''
            });
          });
        } else {
          exportRows.push({
            'Fecha': r.fecha,
            'N° de Vuelta': r.n_vuelta || '1',
            'N° de Ruta': r.ruta,
            'Cliente / Nombre Ruta': r.cliente,
            'Conductor': r.conductor_name || 'Sin asignar',
            'RUT Conductor': r.conductor_rut || '',
            'Auxiliar 1': r.aux1_name || '',
            'RUT Auxiliar 1': r.aux1_rut || '',
            'Auxiliar 2': r.aux2_name || '',
            'RUT Auxiliar 2': r.aux2_rut || '',
            'Camión': r.camion || '',
            'Tipo de Equipo': r.tipo_equipo || '',
            'Rampla': r.rampla || '',
            'Tipo de Servicio': r.tipo_servicio || '',
            'Secuencia': 1,
            'Destino': r.cliente,
            'Dirección': '',
            'Comuna': '',
            'Horario': '',
            'm³': r.m3,
            'Peso (kg)': r.peso || 0,
            'Cajas (CJ)': r.cantCJ || 0,
            'Referencia': r.referencia || ''
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ruteo Detallado');
      XLSX.writeFile(wb, `Ruteo_Detallado_${activeDate}.xlsx`);

      toast.success('Excel de Ruteo exportado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar archivo Excel.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* 1. Header Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800">Ruteo</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Detalle de servicios y paradas disponibilizados por fecha, listos para descargar y control operacional.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm"
          >
            <Download size={15} />
            Descargar en Excel
          </Button>
        </div>
      </div>

      {/* 2. Barra de Filtros y Selector de Fecha */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                Fecha
              </span>
              <select 
                value={activeDate}
                onChange={e => setSelectedRuteoDate(e.target.value)}
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

          {/* Filtro Ruta */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Filtrar Ruta..." 
              value={filterRuta}
              onChange={e => setFilterRuta(e.target.value)}
              className="pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-xl w-32 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Filtro Cliente */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Filtrar Cliente..." 
              value={filterCliente}
              onChange={e => setFilterCliente(e.target.value)}
              className="pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-xl w-40 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Filtro Conductor */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Filtrar Conductor..." 
              value={filterConductor}
              onChange={e => setFilterConductor(e.target.value)}
              className="pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-xl w-44 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {(filterRuta || filterCliente || filterConductor) && (
            <Button 
              variant="outline" 
              onClick={() => {
                setFilterRuta('');
                setFilterCliente('');
                setFilterConductor('');
              }}
              className="text-xs h-8 px-2.5"
            >
              Limpiar
            </Button>
          )}
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Mostrando {filteredRoutes.length} rutas para {activeDate}
        </span>
      </div>

      {/* 3. Tarjetas de Totales Solicitadas: m³, Locales, Suma de Peso (kg), Cajas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total m³</p>
            <p className="text-2xl font-black text-emerald-700">{totalM3}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Package size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Locales</p>
            <p className="text-2xl font-black text-indigo-700">{totalLocales}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <MapPin size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suma de Peso (kg)</p>
            <p className="text-2xl font-black text-amber-700">{totalPeso}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Weight size={20} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cajas (CJ)</p>
            <p className="text-2xl font-black text-blue-700">{totalCajas}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Layers size={20} />
          </div>
        </div>
      </div>

      {/* 4. Visualización de Información: Detalle completo de Rutas y Paradas (Formato de referencia) */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Detalle Operacional de Ruteo — {activeDate}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Formato consolidado con Conductor, Camión y paradas desglosadas.
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {filteredRoutes.map((route) => {
            const paradas = route.paradas || [];
            return (
              <div 
                key={route.id} 
                className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs hover:border-blue-300 transition-colors"
              >
                {/* Banner de la Ruta */}
                <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-slate-900 text-white font-black px-2.5 py-0.5 rounded-lg text-xs tracking-wide">
                      Ruta {route.ruta}
                    </span>
                    {route.n_vuelta && (
                      <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded-md text-[11px]">
                        Vuelta {route.n_vuelta}
                      </span>
                    )}
                    <span className="font-bold text-slate-800 text-sm">{route.cliente}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="text-slate-600">
                      Chofer: <strong className="text-slate-900">{route.conductor_name || <span className="text-slate-400 italic">Sin asignar</span>}</strong>
                      {route.conductor_rut && <span className="text-slate-400 font-mono text-[10px] ml-1">({route.conductor_rut})</span>}
                    </span>
                    <span className="text-slate-600">
                      Aux: <strong className="text-slate-900">{[route.aux1_name, route.aux2_name].filter(Boolean).join(', ') || <span className="text-slate-400 italic">Sin aux</span>}</strong>
                    </span>
                    <span className="text-slate-600">
                      Camión: <strong className="text-emerald-700">{route.camion || <span className="text-slate-400 italic">Sin camión</span>}</strong>
                      {route.tipo_equipo && <span className="text-slate-400 text-[10px] ml-1">({route.tipo_equipo})</span>}
                    </span>
                    <span className="text-slate-600 font-bold text-emerald-700 font-mono">
                      {route.m3} m³
                    </span>
                    <span className="text-slate-600 font-bold text-indigo-700">
                      {route.locales} Locales
                    </span>
                  </div>
                </div>

                {/* Tabla de Paradas / Destinos (Exacto formato de imagen de referencia) */}
                <div className="p-3 bg-white">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                    <MapPin size={14} className="text-red-500" />
                    Detalle de Destinos / Paradas de Ruta {route.ruta} ({paradas.length} paradas):
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-1.5 w-10">Sec</th>
                          <th className="px-3 py-1.5">Destino</th>
                          <th className="px-3 py-1.5">Dirección</th>
                          <th className="px-3 py-1.5">Comuna</th>
                          <th className="px-3 py-1.5">Horario</th>
                          <th className="px-3 py-1.5 text-right">m³</th>
                          <th className="px-3 py-1.5 text-right">Peso</th>
                          <th className="px-3 py-1.5 text-right">CJ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paradas.map((p, pIdx) => (
                          <tr key={pIdx} className="hover:bg-slate-50/70">
                            <td className="px-3 py-1 text-slate-400 font-bold">{p.secuencia || pIdx + 1}</td>
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
                            <td colSpan="8" className="px-3 py-3 text-center text-slate-400 italic">
                              Destino directo / Sin paradas detalladas en el archivo original.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredRoutes.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              <FileSpreadsheet size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm text-slate-700">No hay rutas disponibilizadas para {activeDate}</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Para guardar una ruta aquí, ve a <strong>Transporte &gt; Disponibilización</strong>, realiza tus asignaciones y pulsa <strong>"Guardar Disponibilización"</strong>.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
