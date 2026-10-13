import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Download, Calendar, Search, Filter, Layers, 
  MapPin, User, Truck, Package, Weight, CheckCircle2,
  ChevronDown, ChevronRight, ArrowUpDown, FileSpreadsheet, RefreshCw
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

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const setDates = new Set([
      ...Object.keys(savedRuteoByDate || {}),
      ...Object.keys(transmittedAssignments || {})
    ]);
    return Array.from(setDates).sort();
  }, [savedRuteoByDate, transmittedAssignments]);

  const activeDate = selectedRuteoDate || availableDates[0] || '14-10-2026';

  // Rutas de la fecha activa
  const currentRoutes = useMemo(() => {
    if (savedRuteoByDate && savedRuteoByDate[activeDate] && savedRuteoByDate[activeDate].length > 0) {
      return savedRuteoByDate[activeDate];
    }
    return transmittedAssignments[activeDate] || [];
  }, [savedRuteoByDate, transmittedAssignments, activeDate]);

  // Filtros dinámicos seleccionables
  const [filterCliente, setFilterCliente] = useState('Todos');
  const [filterRuta, setFilterRuta] = useState('');
  const [filterConductor, setFilterConductor] = useState('Todos');
  const [filterVuelta, setFilterVuelta] = useState('Todas');
  const [expandedKeys, setExpandedKeys] = useState({});

  // Listas únicas para opciones de dropdown
  const clientesList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.cliente).filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  const conductoresList = useMemo(() => {
    const set = new Set(currentRoutes.map(r => r.conductor_name).filter(Boolean));
    return Array.from(set).sort();
  }, [currentRoutes]);

  // Rutas filtradas
  const filteredRoutes = useMemo(() => {
    return currentRoutes.filter(r => {
      if (filterRuta && !String(r.ruta || '').toLowerCase().includes(filterRuta.toLowerCase())) return false;
      if (filterCliente !== 'Todos' && r.cliente !== filterCliente) return false;
      if (filterConductor !== 'Todos' && r.conductor_name !== filterConductor) return false;
      if (filterVuelta !== 'Todas' && String(r.n_vuelta || '') !== filterVuelta) return false;
      return true;
    });
  }, [currentRoutes, filterRuta, filterCliente, filterConductor, filterVuelta]);

  // AGRUPACIÓN POR CONDUCTOR + N° DE VUELTA (Formato idéntico a Resumen de Asignación)
  const groupedSummary = useMemo(() => {
    const map = new Map();

    filteredRoutes.forEach(row => {
      const conductor = row.conductor_name || 'Sin Conductor';
      const vueltaLabel = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';
      const key = `${conductor}:::${vueltaLabel}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          conductor,
          conductor_rut: row.conductor_rut || '',
          vuelta: row.n_vuelta || '',
          vueltaLabel,
          camion: row.camion || 'Sin camión',
          tipo_equipo: row.tipo_equipo || '',
          rampla: row.rampla || '',
          auxiliares: [row.aux1_name, row.aux2_name].filter(Boolean),
          totalM3: 0,
          totalPeso: 0,
          totalLocales: 0,
          totalCajas: 0,
          rutas: []
        });
      }

      const g = map.get(key);
      g.totalM3 += parseFloat(row.m3) || 0;
      g.totalPeso += parseFloat(row.peso) || 0;
      g.totalLocales += parseInt(row.locales, 10) || 0;
      g.totalCajas += parseInt(row.cantCJ, 10) || 0;
      if (row.camion && g.camion === 'Sin camión') g.camion = row.camion;

      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [filteredRoutes]);

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // TOTALES SUMADOS REQUERIDOS: m³, Locales y Suma de Peso (kg)
  const totalM3 = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(4);
  }, [filteredRoutes]);

  const totalLocales = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (parseInt(r.locales, 10) || 0), 0);
  }, [filteredRoutes]);

  const totalPeso = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      const p = parseFloat(r.peso) || (r.paradas || []).reduce((pAcc, item) => pAcc + (parseFloat(item.peso) || 0), 0);
      return acc + p;
    }, 0).toFixed(2);
  }, [filteredRoutes]);

  const totalCajas = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => {
      const c = parseInt(r.cantCJ, 10) || (r.paradas || []).reduce((cAcc, item) => cAcc + (parseInt(item.cantCJ, 10) || 0), 0);
      return acc + c;
    }, 0);
  }, [filteredRoutes]);

  // Exportar a Excel según los filtros seleccionados
  const handleExportExcel = () => {
    if (filteredRoutes.length === 0) {
      toast.error('No hay datos en la tabla para exportar.');
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
              'Auxiliar 2': r.aux2_name || '',
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
            'Camión': r.camion || '',
            'm³': r.m3,
            'Peso (kg)': r.peso || 0,
            'Locales': r.locales,
            'Cajas (CJ)': r.cantCJ || 0,
            'Referencia': r.referencia || ''
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ruteo Filtrado');
      XLSX.writeFile(wb, `Ruteo_Operacional_${activeDate}.xlsx`);

      toast.success(`Archivo Excel exportado exitosamente (${exportRows.length} registros).`);
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
            Arma tu tabla con filtros de Conductor, Cliente y Ruta, y descarga el reporte en Excel.
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

      {/* 2. Barra de Filtros Dinámicos */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Fecha */}
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

          {/* Filtro Conductor */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Conductor</span>
            <select
              value={filterConductor}
              onChange={e => setFilterConductor(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
            >
              <option value="Todos">Todos los Conductores</option>
              {conductoresList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Filtro Cliente */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Cliente</span>
            <select
              value={filterCliente}
              onChange={e => setFilterCliente(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            >
              <option value="Todos">Todos los Clientes</option>
              {clientesList.map(cl => (
                <option key={cl} value={cl}>{cl}</option>
              ))}
            </select>
          </div>

          {/* Filtro N° de Ruta */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase">N° de Ruta</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={12} />
              <input 
                type="text" 
                placeholder="Buscar ruta..." 
                value={filterRuta}
                onChange={e => setFilterRuta(e.target.value)}
                className="pl-7 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-xl w-32 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filtro N° de Vuelta */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Vuelta</span>
            <select
              value={filterVuelta}
              onChange={e => setFilterVuelta(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 bg-slate-50 focus:bg-white focus:outline-none w-24"
            >
              <option value="Todas">Todas</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(v => (
                <option key={v} value={String(v)}>Vuelta {v}</option>
              ))}
            </select>
          </div>

          {(filterRuta || filterCliente !== 'Todos' || filterConductor !== 'Todos' || filterVuelta !== 'Todas') && (
            <Button 
              variant="outline" 
              onClick={() => {
                setFilterRuta('');
                setFilterCliente('Todos');
                setFilterConductor('Todos');
                setFilterVuelta('Todas');
              }}
              className="text-xs h-8 px-2.5 self-end"
            >
              Limpiar Filtros
            </Button>
          )}
        </div>

        <span className="text-xs text-slate-500 font-medium">
          {filteredRoutes.length} rutas filtradas ({groupedSummary.length} viajes)
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

      {/* 4. Tabla de Ruteo: Formato Idéntico a Resumen de Asignación por Ruta con desglose y paradas */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Tabla Consolidada de Ruteo — {activeDate}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Pulsa en cualquier conductor para ver el desglose de paradas y destinos.
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {groupedSummary.map(group => {
            const isExpanded = !!expandedKeys[group.key];
            return (
              <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {/* Fila Encabezado por Conductor y Vuelta */}
                <div 
                  onClick={() => toggleExpand(group.key)}
                  className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-3.5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2 transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-blue-600">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>

                    <span className="font-black text-slate-800 text-sm">{group.conductor}</span>
                    {group.conductor_rut && <span className="text-slate-400 font-mono text-[10px]">({group.conductor_rut})</span>}

                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                      <Truck size={12} /> {group.camion}
                    </span>

                    {group.rampla && (
                      <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded text-[11px]">
                        Rampla: {group.rampla}
                      </span>
                    )}

                    <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded text-[11px]">
                      {group.vueltaLabel}
                    </span>

                    <span className="text-slate-400 text-[11px]">
                      [{group.rutas.map(r => `Ruta ${r.ruta}`).join(', ')}]
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-600">Locales: <strong className="text-indigo-700">{group.totalLocales}</strong></span>
                    <span className="text-slate-600">Peso: <strong className="text-amber-700">{group.totalPeso} kg</strong></span>
                    <span className="text-slate-600 font-mono font-black text-emerald-700 text-sm">{group.totalM3} m³</span>
                  </div>
                </div>

                {/* Desglose de Paradas al expandir */}
                {isExpanded && (
                  <div className="p-3 bg-slate-50/30 space-y-3">
                    {group.rutas.map(r => {
                      const paradas = r.paradas || [];
                      return (
                        <div key={`ruteo-route-${r.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
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
                                {paradas.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-1 text-slate-500 font-bold">{p.secuencia || idx + 1}</td>
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
                                      Sin paradas detalladas.
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
            <div className="p-12 text-center text-slate-400 text-xs italic">
              No hay rutas que coincidan con los filtros seleccionados para {activeDate}.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
