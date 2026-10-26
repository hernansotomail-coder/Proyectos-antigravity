import React, { useState, useMemo } from 'react';
import { 
  Calendar, Download, Search, Filter, Layers, Truck, 
  Package, Scale, Snowflake, Thermometer, Wind, 
  MapPin, AlertCircle, FileSpreadsheet, Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { findOperationForRoute, getOperacionName, ALL_OPERACIONES } from '../data/operacionesMaster';
import { Button } from './ui/Button';

// Normalizador de Operación / Cliente para agrupar exactamente como en el Briefing oficial
export const getBriefingOperation = (route) => {
  if (!route) return 'Otros';
  const rawClient = String(route.cliente || route.servicio || route.Operacion || '').trim();
  const rawRuta = String(route.ruta || '').trim();

  // Si es servicio SPID explícito (ej: desde Servicios Extras o ruta directa)
  if (rawClient.toUpperCase().includes('SPID') || rawRuta.toUpperCase().includes('SPID')) {
    return 'SPID';
  }

  // Si la ruta ya tiene operacion oficial asignada
  if (route.operacion && route.operacion !== 'Sin Operación') {
    return route.operacion;
  }

  // Buscar en el catálogo maestro por número de ruta
  if (rawRuta) {
    const master = findOperationForRoute(rawRuta);
    if (master && master.operacion && master.operacion !== 'Sin Operación') {
      return master.operacion;
    }
  }

  return getOperacionName(rawRuta, rawClient || route.nombreRuta || 'Otros');
};

export const normalizeClientForBriefing = (rawName) => {
  if (!rawName) return 'OTROS';
  const upper = String(rawName).toUpperCase().trim();
  if (upper.includes('SPID')) return 'SPID';
  return getOperacionName('', rawName);
};

// Formateadores numéricos de estilo chileno
const formatInt = (num) => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '';
  return Math.round(num).toLocaleString('de-DE');
};

const formatIntAlways = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toLocaleString('de-DE');
};

const formatDecimal = (num) => {
  if (num === null || num === undefined || isNaN(num) || Math.abs(num) < 0.0001) return '';
  return Number(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDecimalAlways = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0,00';
  return Number(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function Briefing() {
  const { 
    transmittedAssignments, 
    savedRuteoByDate, 
    selectedDisponibilizarDate, 
    transformedRoutes,
    rawRows
  } = usePlanningStore();
  
  const { fleetList } = useFleetStore();

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const dSet = new Set();
    if (transmittedAssignments) Object.keys(transmittedAssignments).forEach(d => dSet.add(d));
    if (savedRuteoByDate) Object.keys(savedRuteoByDate).forEach(d => dSet.add(d));
    if (transformedRoutes) transformedRoutes.forEach(r => r.fecha && dSet.add(r.fecha));
    if (selectedDisponibilizarDate) dSet.add(selectedDisponibilizarDate);
    const arr = Array.from(dSet).filter(Boolean);
    return arr.length > 0 ? arr : ['22-10-2026'];
  }, [transmittedAssignments, savedRuteoByDate, transformedRoutes, selectedDisponibilizarDate]);

  const [activeDate, setActiveDate] = useState(() => {
    return availableDates.includes('22-10-2026') ? '22-10-2026' : (availableDates[0] || '14-10-2026');
  });

  const [searchTerm, setSearchTerm] = useState('');
  // Multi-selección de Operaciones (Requisito 3)
  const [selectedOperations, setSelectedOperations] = useState([]);

  const toggleOperation = (op) => {
    setSelectedOperations(prev => {
      const exists = prev.some(item => item.toLowerCase() === op.toLowerCase());
      if (exists) {
        return prev.filter(item => item.toLowerCase() !== op.toLowerCase());
      } else {
        return [...prev, op];
      }
    });
  };

  const clearOperationFilter = () => {
    setSelectedOperations([]);
  };

  // Filas del día seleccionado (Disponibilización / Ruteo)
  const currentAssignedRows = useMemo(() => {
    if (savedRuteoByDate?.[activeDate] && savedRuteoByDate[activeDate].length > 0) {
      return savedRuteoByDate[activeDate];
    }
    if (transmittedAssignments?.[activeDate] && transmittedAssignments[activeDate].length > 0) {
      return transmittedAssignments[activeDate];
    }
    // Fallback a transformedRoutes filtradas por fecha o todas si coincide
    const matchedTrans = (transformedRoutes || []).filter(r => r.fecha === activeDate);
    if (matchedTrans.length > 0) {
      return matchedTrans;
    }
    return transformedRoutes || [];
  }, [savedRuteoByDate, transmittedAssignments, transformedRoutes, activeDate]);

  // Construcción de la Matriz de Briefing agrupada por Operación (Cliente)
  const briefingData = useMemo(() => {
    // 1. Agrupar rutas por Cliente normalizado
    const clientsMap = new Map();

    currentAssignedRows.forEach((r, idx) => {
      const clientName = getBriefingOperation(r);
      if (!clientsMap.has(clientName)) {
        clientsMap.set(clientName, {
          operacion: clientName,
          routes: []
        });
      }
      clientsMap.get(clientName).routes.push(r);
    });

    // 2. Mapeo preliminar de camiones por cliente para resolver el desempate de camiones compartidos
    // "#Rutas: Cuenta la cantidad de camiones por clientes sin repetirlos, considera que si hay dos clientes con el mismo camión, visualizalo al que tiene menos camiones"
    const truckToClientsMap = new Map();
    clientsMap.forEach((cData, cName) => {
      cData.routes.forEach(r => {
        const camion = (r.camion || '').trim();
        if (camion && camion.toLowerCase() !== 'sin camión' && camion.toLowerCase() !== 'sin camion') {
          if (!truckToClientsMap.has(camion)) {
            truckToClientsMap.set(camion, new Set());
          }
          truckToClientsMap.get(camion).add(cName);
        }
      });
    });

    // Cantidad bruta de camiones por cliente (para desempatar)
    const clientTruckCounts = new Map();
    clientsMap.forEach((cData, cName) => {
      const distinctTrucks = new Set(
        cData.routes.map(r => (r.camion || '').trim()).filter(c => c && !c.toLowerCase().includes('sin cami'))
      );
      clientTruckCounts.set(cName, distinctTrucks.size);
    });

    // Asignar cada camión a UN SOLO cliente (el que tenga menor cantidad de camiones brutos)
    const truckOwnerMap = new Map();
    truckToClientsMap.forEach((clientsSet, camion) => {
      const clientArr = Array.from(clientsSet);
      if (clientArr.length === 1) {
        truckOwnerMap.set(camion, clientArr[0]);
      } else {
        // Encontrar cliente con menos camiones
        clientArr.sort((a, b) => {
          const countA = clientTruckCounts.get(a) || 0;
          const countB = clientTruckCounts.get(b) || 0;
          if (countA !== countB) return countA - countB;
          return a.localeCompare(b);
        });
        truckOwnerMap.set(camion, clientArr[0]);
      }
    });

    // 3. Procesar métricas por cliente
    const rows = Array.from(clientsMap.values()).map(cData => {
      const { operacion, routes } = cData;

      const trucks1vPropia = new Set();
      const trucks1vExterna = new Set();
      const trucks2vPropia = new Set();
      const trucks2vExterna = new Set();
      let sinCoberturaCount = 0;

      let totalCajas = 0;
      let totalKilos = 0;
      let totalCongeladoM3 = 0;
      let totalRefrigeradoM3 = 0;
      let totalSecoM3 = 0;
      let totalVolumenM3 = 0;
      const destinosSet = new Set();

      routes.forEach(r => {
        const camion = (r.camion || '').trim();
        const conductor = (r.conductor_name || '').trim();
        const aux = (r.aux1_name || '').trim();

        // Sin cobertura: Rutas que no tienen Conductor, ni auxiliar ni Camión
        const isSinCobertura = !camion || camion.toLowerCase().includes('sin cami') || (!conductor && !aux);
        if (isSinCobertura) {
          sinCoberturaCount++;
        }

        // Vuelta
        const rawVuelta = String(r.n_vuelta || r.vuelta || '1').trim();
        const matchVuelta = rawVuelta.match(/\d+/);
        const vueltaNum = matchVuelta ? parseInt(matchVuelta[0], 10) : 1;

        // Tipo de Flota (Propia vs Externa)
        let isExt = false;
        if (camion && !camion.toLowerCase().includes('sin cami')) {
          const foundTruck = fleetList.find(f => 
            (f.internal_number || '').trim().toLowerCase() === camion.toLowerCase() ||
            (f.plate || '').trim().toLowerCase() === camion.toLowerCase()
          );
          if (foundTruck) {
            isExt = isVehicleExternal(foundTruck);
          } else {
            isExt = isVehicleExternal({
              internal_number: camion,
              plate: r.patente,
              transportista: r.transportista,
              tipo_flota: r.tipo_flota,
              empresa_externa: r.empresa_externa
            });
          }

          if (vueltaNum === 1) {
            if (isExt) trucks1vExterna.add(camion);
            else trucks1vPropia.add(camion);
          } else {
            if (isExt) trucks2vExterna.add(camion);
            else trucks2vPropia.add(camion);
          }
        }

        // Cajas, Kilos, Ambientes (Congelado, Refrigerado, Seco), Volumen y Destinos
        const paradas = r.paradas || [];
        if (paradas.length > 0) {
          paradas.forEach(p => {
            if (p.destino) destinosSet.add(String(p.destino).trim());

            const cj = parseFloat(String(p.cantCJ || p.cajas || 0).replace(',', '.')) || 0;
            const kg = parseFloat(String(p.peso || p.kilos || 0).replace(',', '.')) || 0;
            const vol = parseFloat(String(p.volumen || p.m3 || 0).replace(',', '.')) || 0;

            totalCajas += cj;
            totalKilos += kg;
            totalVolumenM3 += vol;

            const amb = String(p.ambiente || 'S').trim().toUpperCase();
            if (amb === 'C') totalCongeladoM3 += vol;
            else if (amb === 'R') totalRefrigeradoM3 += vol;
            else totalSecoM3 += vol;
          });
        } else {
          // Si no tiene desglose de paradas, tomar totales de la fila
          const cj = parseFloat(String(r.cantCJ || r.cajas || 0).replace(',', '.')) || 0;
          const kg = parseFloat(String(r.peso || r.kilos || 0).replace(',', '.')) || 0;
          const vol = parseFloat(String(r.volumen || r.m3 || 0).replace(',', '.')) || 0;

          totalCajas += cj;
          totalKilos += kg;
          totalVolumenM3 += vol;

          // Si tiene destino asignado
          if (r.destino) destinosSet.add(String(r.destino).trim());
          if (r.recuentoDestino) {
            for (let i = 0; i < r.recuentoDestino; i++) {
              destinosSet.add(`dest-${r.ruta}-${i}`);
            }
          }

          const amb = String(r.ambiente || 'S').trim().toUpperCase();
          if (amb === 'C') totalCongeladoM3 += vol;
          else if (amb === 'R') totalRefrigeradoM3 += vol;
          else totalSecoM3 += vol;
        }
      });

      // Contar #Rutas deduplicadas asignadas exclusivamente a este cliente
      let rutasDeduplicadas = 0;
      truckOwnerMap.forEach((ownerClient, camion) => {
        if (ownerClient === operacion) {
          rutasDeduplicadas++;
        }
      });
      // Si hay rutas sin camión asignado, se suman
      rutasDeduplicadas += sinCoberturaCount;

      // Si por alguna razón la suma de vueltas es mayor o no hubo camiones registrados, asegurar coherencia
      const sumaVueltas = trucks1vPropia.size + trucks1vExterna.size + trucks2vPropia.size + trucks2vExterna.size + sinCoberturaCount;
      const numRutasFinal = rutasDeduplicadas > 0 ? rutasDeduplicadas : sumaVueltas;

      return {
        operacion,
        numRutas: numRutasFinal,
        propia1v: trucks1vPropia.size,
        externa1v: trucks1vExterna.size,
        propia2v: trucks2vPropia.size,
        externa2v: trucks2vExterna.size,
        sinCobertura: sinCoberturaCount,
        cajas: Math.round(totalCajas),
        kilos: Number(totalKilos.toFixed(2)),
        congeladoM3: Number(totalCongeladoM3.toFixed(2)),
        refrigeradoM3: Number(totalRefrigeradoM3.toFixed(2)),
        secoM3: Number(totalSecoM3.toFixed(2)),
        volumenM3: Number(totalVolumenM3.toFixed(2)),
        numDestinos: destinosSet.size || routes.length
      };
    });

    // Ordenar filas: primero las operaciones que tienen servicios registrados (numRutas > 0 o cajas > 0 o volumenM3 > 0), luego las que no
    rows.sort((a, b) => {
      const hasServicesA = (a.numRutas > 0 || a.cajas > 0 || a.volumenM3 > 0) ? 1 : 0;
      const hasServicesB = (b.numRutas > 0 || b.cajas > 0 || b.volumenM3 > 0) ? 1 : 0;
      if (hasServicesA !== hasServicesB) {
        return hasServicesB - hasServicesA;
      }
      if (a.numRutas !== b.numRutas) {
        return b.numRutas - a.numRutas;
      }
      return a.operacion.localeCompare(b.operacion);
    });

    // Totales Generales
    const totals = {
      operacion: 'Total general',
      numRutas: rows.reduce((acc, r) => acc + r.numRutas, 0),
      propia1v: rows.reduce((acc, r) => acc + r.propia1v, 0),
      externa1v: rows.reduce((acc, r) => acc + r.externa1v, 0),
      propia2v: rows.reduce((acc, r) => acc + r.propia2v, 0),
      externa2v: rows.reduce((acc, r) => acc + r.externa2v, 0),
      sinCobertura: rows.reduce((acc, r) => acc + r.sinCobertura, 0),
      cajas: rows.reduce((acc, r) => acc + r.cajas, 0),
      kilos: Number(rows.reduce((acc, r) => acc + r.kilos, 0).toFixed(2)),
      congeladoM3: Number(rows.reduce((acc, r) => acc + r.congeladoM3, 0).toFixed(2)),
      refrigeradoM3: Number(rows.reduce((acc, r) => acc + r.refrigeradoM3, 0).toFixed(2)),
      secoM3: Number(rows.reduce((acc, r) => acc + r.secoM3, 0).toFixed(2)),
      volumenM3: Number(rows.reduce((acc, r) => acc + r.volumenM3, 0).toFixed(2)),
      numDestinos: rows.reduce((acc, r) => acc + r.numDestinos, 0)
    };

    return { rows, totals };
  }, [currentAssignedRows, fleetList]);

  // Mini-etiquetas de todas las operaciones disponibles (Requisito 3)
  // Al comienzo van todas las tarjetas que tienen servicios registrados y al final las que no tienen servicios
  const operationsList = useMemo(() => {
    const presentOps = new Set(briefingData.rows.map(r => r.operacion));
    ALL_OPERACIONES.forEach(op => presentOps.add(op));

    const opsArray = Array.from(presentOps);
    const opCountMap = new Map();
    briefingData.rows.forEach(r => {
      opCountMap.set(r.operacion.toLowerCase(), {
        count: r.numRutas || 0,
        hasServices: (r.numRutas > 0 || r.cajas > 0 || r.volumenM3 > 0)
      });
    });

    return opsArray.sort((a, b) => {
      const infoA = opCountMap.get(a.toLowerCase()) || { count: 0, hasServices: false };
      const infoB = opCountMap.get(b.toLowerCase()) || { count: 0, hasServices: false };

      const hasServicesA = infoA.hasServices ? 1 : 0;
      const hasServicesB = infoB.hasServices ? 1 : 0;

      // 1. Tarjetas con servicios registrados al comienzo, sin servicios al final
      if (hasServicesA !== hasServicesB) {
        return hasServicesB - hasServicesA;
      }
      // 2. Si ambas tienen servicios, ordenar por mayor número de rutas/camiones
      if (infoA.count !== infoB.count) {
        return infoB.count - infoA.count;
      }
      // 3. Fallback alfabético
      return a.localeCompare(b);
    });
  }, [briefingData.rows]);

  // Filtro de búsqueda y multi-etiquetas de operación (Requisito 3)
  const displayedRows = useMemo(() => {
    let list = briefingData.rows;
    if (selectedOperations.length > 0) {
      const lowerSelected = new Set(selectedOperations.map(o => o.toLowerCase()));
      list = list.filter(r => lowerSelected.has(r.operacion.toLowerCase()));
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(r => r.operacion.toLowerCase().includes(lower));
    }
    return list;
  }, [briefingData.rows, selectedOperations, searchTerm]);

  // Totales dinámicos calculados sobre las filas mostradas (para tarjetas y pie de tabla)
  const displayedTotals = useMemo(() => {
    return {
      operacion: selectedOperations.length > 0 ? `Subtotal (${selectedOperations.length} ops)` : 'Total general',
      numRutas: displayedRows.reduce((acc, r) => acc + r.numRutas, 0),
      propia1v: displayedRows.reduce((acc, r) => acc + r.propia1v, 0),
      externa1v: displayedRows.reduce((acc, r) => acc + r.externa1v, 0),
      propia2v: displayedRows.reduce((acc, r) => acc + r.propia2v, 0),
      externa2v: displayedRows.reduce((acc, r) => acc + r.externa2v, 0),
      sinCobertura: displayedRows.reduce((acc, r) => acc + r.sinCobertura, 0),
      cajas: displayedRows.reduce((acc, r) => acc + r.cajas, 0),
      kilos: Number(displayedRows.reduce((acc, r) => acc + r.kilos, 0).toFixed(2)),
      congeladoM3: Number(displayedRows.reduce((acc, r) => acc + r.congeladoM3, 0).toFixed(2)),
      refrigeradoM3: Number(displayedRows.reduce((acc, r) => acc + r.refrigeradoM3, 0).toFixed(2)),
      secoM3: Number(displayedRows.reduce((acc, r) => acc + r.secoM3, 0).toFixed(2)),
      volumenM3: Number(displayedRows.reduce((acc, r) => acc + r.volumenM3, 0).toFixed(2)),
      numDestinos: displayedRows.reduce((acc, r) => acc + r.numDestinos, 0)
    };
  }, [displayedRows, selectedOperations]);

  // Exportar a Excel exactamente con las columnas solicitadas
  const handleExportExcel = () => {
    const exportData = briefingData.rows.map(r => ({
      'Operación': r.operacion,
      '# Rutas': r.numRutas || 0,
      'Real Key 1era V': r.propia1v || 0,
      'Real Terceros 1era V': r.externa1v || 0,
      '2da V (Cubiertas Key)': r.propia2v || 0,
      '2da V (Terceros)': r.externa2v || 0,
      'Sin cobertura': r.sinCobertura || 0,
      'Cajas': r.cajas || 0,
      'Kilos': `${r.kilos.toFixed(2)} Kg`,
      'Congelado m3': r.congeladoM3 || 0,
      'Refrigerado m3': r.refrigeradoM3 || 0,
      'Seco m3': r.secoM3 || 0,
      'Volumen': `${r.volumenM3.toFixed(2)} m3`,
      'N° Destinos': r.numDestinos || 0
    }));

    // Fila Total General
    exportData.push({
      'Operación': 'Total general',
      '# Rutas': briefingData.totals.numRutas,
      'Real Key 1era V': briefingData.totals.propia1v,
      'Real Terceros 1era V': briefingData.totals.externa1v,
      '2da V (Cubiertas Key)': briefingData.totals.propia2v,
      '2da V (Terceros)': briefingData.totals.externa2v,
      'Sin cobertura': briefingData.totals.sinCobertura,
      'Cajas': briefingData.totals.cajas,
      'Kilos': `${briefingData.totals.kilos.toFixed(2)} Kg`,
      'Congelado m3': briefingData.totals.congeladoM3,
      'Refrigerado m3': briefingData.totals.refrigeradoM3,
      'Seco m3': briefingData.totals.secoM3,
      'Volumen': `${briefingData.totals.volumenM3.toFixed(2)} m3`,
      'N° Destinos': briefingData.totals.numDestinos
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Briefing");
    XLSX.writeFile(workbook, `Resumen_Briefing_${activeDate}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 sm:p-6 gap-4 overflow-y-auto">
      
      {/* 1. Header Ejecutivo idéntico a la plantilla oficial con Logo Key Logistics (Requisito 4) */}
      <div className="bg-[#0B2545] text-white rounded-2xl shadow-md p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center pr-3.5 border-r border-blue-400/30">
            <img 
              src="/keylogistics-logo.jpg" 
              alt="Key Logistics" 
              className="h-11 w-auto object-contain rounded-lg shadow-xs bg-white/10 p-0.5 border border-white/20"
            />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-wide uppercase text-white">
              RESUMEN DE ASIGNACIÓN · BRIEFING
            </h1>
            <p className="text-[11px] text-blue-200">
              Control operacional y balance de flota, cajas, kilos y ambientes por cliente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-[#133863] border border-blue-400/30 px-3 py-1.5 rounded-xl">
            <Calendar size={16} className="text-blue-300" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-blue-200 uppercase tracking-wider">
                Despacho
              </span>
              <select
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                className="text-xs font-bold text-white bg-transparent outline-none cursor-pointer"
              >
                {availableDates.map(d => (
                  <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-xs font-bold h-9 bg-blue-600 hover:bg-blue-500 text-white shadow-sm border border-blue-400/30"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
        </div>
      </div>

      {/* 2. Tarjetas KPI de Resumen Rápido (Calculadas dinámicamente según filtros aplicados) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total # Rutas</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{displayedTotals.numRutas}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Camiones deduplicados</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flota Propia 1V</span>
          <p className="text-2xl font-black text-blue-600 mt-1">{displayedTotals.propia1v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Real Key 1era Vuelta</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flota Externa 1V</span>
          <p className="text-2xl font-black text-amber-600 mt-1">{displayedTotals.externa1v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Real Terceros 1era Vuelta</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Segundas Vueltas</span>
          <p className="text-2xl font-black text-indigo-600 mt-1">{displayedTotals.propia2v + displayedTotals.externa2v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">{displayedTotals.propia2v} Key • {displayedTotals.externa2v} Terceros</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Kilos</span>
          <p className="text-xl font-black text-slate-800 mt-1">{formatDecimalAlways(displayedTotals.kilos)} <span className="text-xs font-bold text-slate-500">Kg</span></p>
          <span className="text-[10px] text-slate-500 mt-0.5">{formatIntAlways(displayedTotals.cajas)} Cajas totales</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Volumen Total</span>
          <p className="text-xl font-black text-emerald-600 mt-1">{formatDecimalAlways(displayedTotals.volumenM3)} <span className="text-xs font-bold text-slate-500">m³</span></p>
          <span className="text-[10px] text-slate-500 mt-0.5">{displayedTotals.numDestinos} Destinos únicos</span>
        </div>
      </div>

      {/* 3. Filtro por Mini-Etiquetas de Operación Multi-selección (Requisito 3) */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-3.5 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-blue-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Filtrar por Operación (Multi-selección):
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedOperations.length > 0 && (
              <button
                type="button"
                onClick={clearOperationFilter}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-all cursor-pointer"
              >
                Limpiar filtros ({selectedOperations.length} seleccionadas)
              </button>
            )}
            <span className="text-[11px] text-slate-500 font-semibold">
              {displayedRows.length} de {briefingData.rows.length} operaciones mostradas
            </span>
          </div>
        </div>

        {/* Mini etiquetas desplazables con scroll horizontal */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            type="button"
            onClick={clearOperationFilter}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedOperations.length === 0
                ? 'bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🌐 Vista general</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              selectedOperations.length === 0 ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {briefingData.rows.length}
            </span>
          </button>

          {operationsList.map(op => {
            const isSelected = selectedOperations.some(item => item.toLowerCase() === op.toLowerCase());
            const rowData = briefingData.rows.find(r => r.operacion.toLowerCase() === op.toLowerCase());
            const countInDay = rowData?.numRutas || 0;
            const hasServices = !!(rowData && (rowData.numRutas > 0 || rowData.cajas > 0 || rowData.volumenM3 > 0));

            return (
              <button
                key={op}
                type="button"
                onClick={() => toggleOperation(op)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                    : hasServices
                    ? 'bg-blue-50/90 hover:bg-blue-100 text-blue-900 border border-blue-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200 opacity-60'
                }`}
                title={hasServices ? `${op}: ${countInDay} camiones asignados hoy (con servicios)` : `${op} (Sin servicios registrados hoy)`}
              >
                {isSelected && <span className="text-[11px] font-black">✓</span>}
                <span>{op}</span>
                {hasServices && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-blue-200 text-blue-900'
                  }`}>
                    {countInDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Buscador de texto */}
        <div className="relative w-full max-w-sm pt-0.5">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Buscar operación o cliente en la lista..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 h-8 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
          />
        </div>
      </div>

      {/* 4. Matriz Principal de Briefing */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            {/* Encabezados Azules Oficiales */}
            <thead className="bg-[#0e2a47] text-white font-bold text-[11px] uppercase tracking-wider sticky top-0 shadow-sm">
              <tr>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-left min-w-[150px]">Operación</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[70px]"># Rutas</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[100px]">Real Key 1era V</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[110px]">Real Terceros 1era V</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[120px]">2da V (Cubiertas Key)</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[110px]">2da V (Terceros)</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[90px]">Sin cobertura</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[75px]">Cajas</th>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-right min-w-[110px]">Kilos</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[85px]">Congelado m3</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[90px]">Refrigerado m3</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[85px]">Seco m3</th>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-right min-w-[95px]">Volumen</th>
                <th className="px-3 py-3.5 text-center min-w-[85px]">N° Destinos</th>
              </tr>
            </thead>

            {/* Cuerpo con Zebra Striping */}
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan="14" className="py-12 text-center text-slate-400">
                    <FileSpreadsheet size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-sm">No hay servicios registrados para la fecha {activeDate}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Carga o transmite rutas desde Asignación Diaria / Disponibilización.</p>
                  </td>
                </tr>
              ) : (
                displayedRows.map((r, idx) => {
                  const isZebra = idx % 2 === 1;
                  const rowBg = isZebra ? 'bg-[#f4f7fb]/70' : 'bg-white';
                  return (
                    <tr key={r.operacion} className={`${rowBg} hover:bg-blue-50/60 transition-colors`}>
                      {/* Operación */}
                      <td className="px-3.5 py-2.5 font-black uppercase text-slate-900 border-r border-slate-200/80 tracking-wide">
                        {r.operacion}
                      </td>

                      {/* # Rutas */}
                      <td className="px-3 py-2.5 text-center font-black font-mono border-r border-slate-200/80 text-slate-900 bg-blue-50/30">
                        {r.numRutas || ''}
                      </td>

                      {/* Real Key 1era V */}
                      <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-blue-900">
                        {formatInt(r.propia1v)}
                      </td>

                      {/* Real Terceros 1era V */}
                      <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-amber-900">
                        {formatInt(r.externa1v)}
                      </td>

                      {/* 2da V (Cubiertas Key) */}
                      <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-indigo-900">
                        {formatInt(r.propia2v)}
                      </td>

                      {/* 2da V (Terceros) */}
                      <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-amber-950">
                        {formatInt(r.externa2v)}
                      </td>

                      {/* Sin cobertura */}
                      <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-red-600">
                        {formatInt(r.sinCobertura)}
                      </td>

                      {/* Cajas */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80">
                        {formatInt(r.cajas)}
                      </td>

                      {/* Kilos */}
                      <td className="px-3.5 py-2.5 text-right font-mono font-medium border-r border-slate-200/80">
                        {r.kilos > 0 ? `${formatDecimalAlways(r.kilos)} Kg` : '0,00 Kg'}
                      </td>

                      {/* Congelado m3 */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-blue-700">
                        {formatDecimal(r.congeladoM3)}
                      </td>

                      {/* Refrigerado m3 */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-cyan-700">
                        {formatDecimal(r.refrigeradoM3)}
                      </td>

                      {/* Seco m3 */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-amber-700">
                        {formatDecimal(r.secoM3)}
                      </td>

                      {/* Volumen */}
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200/80">
                        {formatDecimalAlways(r.volumenM3)} m3
                      </td>

                      {/* N° Destinos */}
                      <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-700">
                        {r.numDestinos}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Fila Total General o Subtotal según filtro activo */}
            <tfoot className="bg-[#0e2a47] text-white font-black text-xs border-t-2 border-blue-900 tracking-wide">
              <tr>
                <td className="px-3.5 py-3 uppercase border-r border-blue-900/40">
                  {displayedTotals.operacion}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40">
                  {displayedTotals.numRutas}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-blue-200">
                  {displayedTotals.propia1v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-amber-200">
                  {displayedTotals.externa1v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-indigo-200">
                  {displayedTotals.propia2v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-amber-300">
                  {displayedTotals.externa2v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-red-300">
                  {displayedTotals.sinCobertura || ''}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40">
                  {formatIntAlways(displayedTotals.cajas)}
                </td>
                <td className="px-3.5 py-3 text-right font-mono border-r border-blue-900/40">
                  {formatDecimalAlways(displayedTotals.kilos)} Kg
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-blue-200">
                  {formatDecimalAlways(displayedTotals.congeladoM3)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-cyan-200">
                  {formatDecimalAlways(displayedTotals.refrigeradoM3)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-amber-200">
                  {formatDecimalAlways(displayedTotals.secoM3)}
                </td>
                <td className="px-3.5 py-3 text-right font-mono border-r border-blue-900/40 text-emerald-300">
                  {formatDecimalAlways(displayedTotals.volumenM3)} m3
                </td>
                <td className="px-3 py-3 text-center font-mono">
                  {displayedTotals.numDestinos}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
}
