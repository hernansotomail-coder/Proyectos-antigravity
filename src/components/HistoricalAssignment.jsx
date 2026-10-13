import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Calendar, Search, Download, Clock, MapPin, 
  User, Truck, Layers, CheckCircle2, ChevronDown, ChevronRight,
  FileSpreadsheet, ArrowRight, History
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

export default function HistoricalAssignment() {
  const { savedHistoryList, savedRuteoByDate } = usePlanningStore();

  // Fechas disponibles en el historial
  const historyDates = useMemo(() => {
    const set = new Set();
    savedHistoryList.forEach(h => set.add(h.fecha));
    Object.keys(savedRuteoByDate || {}).forEach(f => set.add(f));
    return Array.from(set).sort().reverse();
  }, [savedHistoryList, savedRuteoByDate]);

  const [selectedDate, setSelectedDate] = useState(historyDates[0] || '14-10-2026');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});

  // Filas de la fecha seleccionada
  const activeRecords = useMemo(() => {
    // Buscar en savedHistoryList primero
    const histEntry = savedHistoryList.find(h => h.fecha === selectedDate);
    if (histEntry && histEntry.rows) {
      return histEntry.rows;
    }
    return savedRuteoByDate[selectedDate] || [];
  }, [savedHistoryList, savedRuteoByDate, selectedDate]);

  // Agrupado por Conductor + Vuelta
  const groupedHistory = useMemo(() => {
    const map = new Map();

    activeRecords.forEach(row => {
      const conductor = row.conductor_name || 'Sin Conductor';
      const vuelta = row.n_vuelta ? `Vuelta ${row.n_vuelta}` : 'Sin Vuelta';
      const key = `${conductor}:::${vuelta}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          conductor,
          conductor_rut: row.conductor_rut || '',
          vuelta,
          camion: row.camion || 'Sin camión',
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
      g.rutas.push(row);
    });

    return Array.from(map.values()).map(g => ({
      ...g,
      totalM3: Number(g.totalM3.toFixed(4)),
      totalPeso: Number(g.totalPeso.toFixed(2))
    }));
  }, [activeRecords]);

  // Filtro de búsqueda
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groupedHistory;
    const lower = searchTerm.toLowerCase();
    return groupedHistory.filter(g => 
      g.conductor.toLowerCase().includes(lower) ||
      g.camion.toLowerCase().includes(lower) ||
      g.rutas.some(r => String(r.ruta).includes(lower) || (r.cliente || '').toLowerCase().includes(lower))
    );
  }, [groupedHistory, searchTerm]);

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Totales
  const totalM3 = filteredGroups.reduce((acc, g) => acc + g.totalM3, 0).toFixed(2);
  const totalLocales = filteredGroups.reduce((acc, g) => acc + g.totalLocales, 0);
  const totalPeso = filteredGroups.reduce((acc, g) => acc + g.totalPeso, 0).toFixed(2);
  const totalViajes = filteredGroups.length;

  // Exportar Excel
  const handleExport = () => {
    if (activeRecords.length === 0) {
      toast.error('No hay registros históricos para exportar.');
      return;
    }

    try {
      const rows = [];
      activeRecords.forEach(r => {
        const paradas = r.paradas || [];
        if (paradas.length > 0) {
          paradas.forEach(p => {
            rows.push({
              'Fecha': r.fecha,
              'N° Vuelta': r.n_vuelta || '1',
              'N° Ruta': r.ruta,
              'Cliente': r.cliente,
              'Conductor': r.conductor_name || 'Sin asignar',
              'RUT Conductor': r.conductor_rut || '',
              'Auxiliar 1': r.aux1_name || '',
              'Auxiliar 2': r.aux2_name || '',
              'Camión': r.camion || '',
              'Tipo Equipo': r.tipo_equipo || '',
              'Rampla': r.rampla || '',
              'Secuencia': p.secuencia,
              'Destino': p.destino,
              'Dirección': p.direccion,
              'Comuna': p.comuna,
              'Horario': p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '',
              'm³': p.volumen,
              'Peso (kg)': p.peso,
              'Cajas (CJ)': p.cantCJ
            });
          });
        } else {
          rows.push({
            'Fecha': r.fecha,
            'N° Vuelta': r.n_vuelta || '1',
            'N° Ruta': r.ruta,
            'Cliente': r.cliente,
            'Conductor': r.conductor_name || 'Sin asignar',
            'RUT Conductor': r.conductor_rut || '',
            'Camión': r.camion || '',
            'm³': r.m3,
            'Peso (kg)': r.peso || 0,
            'Locales': r.locales
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Histórico Disponibilización');
      XLSX.writeFile(wb, `Historico_Disponibilizacion_${selectedDate}.xlsx`);
      toast.success('Excel histórico generado correctamente.');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar Excel.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Transporte
            </span>
            <h1 className="text-xl font-bold text-slate-800">Histórico de Disponibilización</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro auditable de todas las disponibilizaciones guardadas y confirmadas en la operación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm"
          >
            <Download size={15} />
            Exportar Histórico
          </Button>
        </div>
      </div>

      {/* Selector de Fecha y Filtro */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            <Calendar size={18} className="text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                Fecha Guardada
              </span>
              <select 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                {historyDates.length > 0 ? (
                  historyDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))
                ) : (
                  <option value={selectedDate}>{selectedDate}</option>
                )}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
            <input 
              type="text" 
              placeholder="Buscar por Chofer, Camión o Ruta..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl w-64 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span>Viajes: <strong className="text-slate-800">{totalViajes}</strong></span>
          <span>Locales: <strong className="text-indigo-700">{totalLocales}</strong></span>
          <span>Peso: <strong className="text-amber-700">{totalPeso} kg</strong></span>
          <span>Total m³: <strong className="text-emerald-700">{totalM3}</strong></span>
        </div>
      </div>

      {/* Listado de Servicios Guardados */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-blue-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Detalle de Disponibilizaciones — {selectedDate}
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Haz clic en cualquier viaje para ver el desglose de paradas y destinos.
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2.5">
          {filteredGroups.map(group => {
            const isExpanded = !!expandedKeys[group.key];
            return (
              <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {/* Header Viaje */}
                <div 
                  onClick={() => toggleExpand(group.key)}
                  className="bg-slate-50/80 hover:bg-blue-50/50 cursor-pointer px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2 transition-colors select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="font-black text-slate-800 text-sm">{group.conductor}</span>
                    {group.conductor_rut && <span className="text-slate-400 font-mono text-[10px]">({group.conductor_rut})</span>}
                    
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                      <Truck size={12} /> {group.camion}
                    </span>

                    <span className="bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded text-[11px]">
                      {group.vuelta}
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

                {/* Desglose de Paradas */}
                {isExpanded && (
                  <div className="p-3 bg-slate-50/30 space-y-3">
                    {group.rutas.map(r => {
                      const paradas = r.paradas || [];
                      return (
                        <div key={`hist-sub-${r.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                          <div className="bg-slate-100/70 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800">
                              Ruta {r.ruta} — {r.cliente}
                            </span>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span>{paradas.length} paradas</span>
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

          {filteredGroups.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs italic">
              No hay registros históricos encontrados para {selectedDate}.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
