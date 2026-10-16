import React, { useEffect, useState, useMemo } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { Button } from './ui/Button';
import { 
  Download, ChevronDown, Search, Droplets, ShieldCheck, 
  AlertTriangle, CheckCircle2, Clock, Truck, Layers, Filter, MapPin 
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper para calcular la fecha de vencimiento sumando 1 MES COMPLETO a la fecha de última certificación
export const getCertExpirationInfo = (dateStr) => {
  if (!dateStr) return { expirationDate: null, expirationDateFormatted: null, diffDays: null };
  const cleanStr = String(dateStr).trim().split(' ')[0].split('T')[0];
  const parts = cleanStr.split(/[-/]/);
  let certDate = null;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      certDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      // DD-MM-YYYY
      certDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  } else {
    certDate = new Date(cleanStr);
  }

  if (!certDate || isNaN(certDate.getTime())) {
    return { expirationDate: null, expirationDateFormatted: null, diffDays: null };
  }

  // Sumar 1 mes completo a partir de la fecha de Última Certificación (Requisito 5)
  const expDate = new Date(certDate.getTime());
  const origDay = certDate.getDate();
  expDate.setMonth(expDate.getMonth() + 1);
  // Ajuste en caso de desbordamiento de fin de mes (ej: 31 de enero -> febrero)
  if (expDate.getDate() !== origDay) {
    expDate.setDate(0);
  }

  const expDay = String(expDate.getDate()).padStart(2, '0');
  const expMonth = String(expDate.getMonth() + 1).padStart(2, '0');
  const expYear = expDate.getFullYear();
  const expirationDateFormatted = `${expDay}/${expMonth}/${expYear}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetExp = new Date(expDate);
  targetExp.setHours(0, 0, 0, 0);

  const diffTime = targetExp - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    expirationDate: expDate,
    expirationDateFormatted,
    diffDays
  };
};

// Alias por compatibilidad
export const getCertDaysDiff = (dateStr) => {
  return getCertExpirationInfo(dateStr).diffDays;
};

// Helper para calcular la diferencia de días de lavado respecto a hoy
export const getWashDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const cleanStr = String(dateStr).trim().split(' ')[0].split('T')[0];
  const parts = cleanStr.split(/[-/]/);
  let targetDate = null;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      targetDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      targetDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  } else {
    targetDate = new Date(cleanStr);
  }

  if (!targetDate || isNaN(targetDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Determinar el color del N° Interno según regla del usuario (contando 1 mes completo):
// - Igual o días pasados (diffDays <= 0): ROJO (Vencido)
// - Faltan 1 a 3 días (diffDays <= 3): AMARILLO (Por vencer)
// - Mayor a 4 días (diffDays >= 4): VERDE (Al día)
export const getInternalColorStatus = (diffDays) => {
  if (diffDays === null) return 'none';
  if (diffDays <= 0) return 'red';
  if (diffDays <= 3) return 'yellow';
  return 'green';
};

export default function WashDashboard() {
  const { fleetList, fetchFleet } = useFleetStore();

  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [activeCard, setActiveCard] = useState('todos');

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Regiones disponibles en flota (Requisito 3)
  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  // Enriquecer flota con categorías y estado de semáforo de certificación (1 mes de vigencia)
  const enrichedFleet = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semirremolques';

      const certInfo = getCertExpirationInfo(f.ultima_certificacion);
      const colorStatus = getInternalColorStatus(certInfo.diffDays);
      const washDays = getWashDaysDiff(f.fecha_ultimo_lavado);

      return {
        ...f,
        dashboardCategory: category,
        certDays: certInfo.diffDays,
        certExpDate: certInfo.expirationDateFormatted,
        colorStatus,
        washDays
      };
    });
  }, [fleetList]);

  // Flota con filtros base aplicados (Tipo, Región, Búsqueda) para que los KPIs respondan a la región
  const baseFilteredFleet = useMemo(() => {
    return enrichedFleet.filter(f => {
      // Filtro por Tipo
      if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;

      // Filtro por Región (Requisito 3)
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;

      // Buscador
      if (searchFilter) {
        const lower = searchFilter.toLowerCase();
        const mInternal = f.internal_number?.toLowerCase().includes(lower);
        const mPlate = f.plate?.toLowerCase().includes(lower);
        const mBrand = f.brand?.toLowerCase().includes(lower);
        const mRegion = f.region?.toLowerCase().includes(lower);
        if (!mInternal && !mPlate && !mBrand && !mRegion) return false;
      }

      return true;
    });
  }, [enrichedFleet, typeFilter, regionFilter, searchFilter]);

  // Estadísticas para las 5 tarjetas superiores (Requisito 2: Se quitó tarjeta <7d)
  const stats = useMemo(() => {
    let total = baseFilteredFleet.length;
    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;
    let noCertCount = 0;

    baseFilteredFleet.forEach(f => {
      if (f.colorStatus === 'red') redCount++;
      else if (f.colorStatus === 'yellow') yellowCount++;
      else if (f.colorStatus === 'green') greenCount++;
      else noCertCount++;
    });

    return { total, redCount, yellowCount, greenCount, noCertCount };
  }, [baseFilteredFleet]);

  // Filtrado final de la tabla según tarjeta activa y filtro de semáforo
  const filteredVehicles = useMemo(() => {
    return baseFilteredFleet.filter(f => {
      // Filtro de tarjeta activa
      if (activeCard === 'red' && f.colorStatus !== 'red') return false;
      if (activeCard === 'yellow' && f.colorStatus !== 'yellow') return false;
      if (activeCard === 'green' && f.colorStatus !== 'green') return false;
      if (activeCard === 'nocert' && f.colorStatus !== 'none') return false;

      // Filtro por Estado
      if (statusFilter !== 'Todos' && f.colorStatus !== statusFilter) return false;

      return true;
    });
  }, [baseFilteredFleet, activeCard, statusFilter]);

  // Exportar a Excel
  const exportToExcel = () => {
    const dataToExport = filteredVehicles.map(f => ({
      'N° Interno': f.internal_number || 'N/A',
      'Patente': f.plate || 'N/A',
      'Tipo': f.type || 'N/A',
      'Marca': f.brand || 'N/A',
      'Región': f.region || 'Sin asignar',
      'Ultima certificación': f.ultima_certificacion || 'Sin registro',
      'Vencimiento (+1 mes)': f.certExpDate || 'Sin registro',
      'Días Restantes': f.certDays !== null ? f.certDays : 'N/A',
      'Estado Certificación': 
        f.colorStatus === 'red' ? 'VENCIDA / HOY (ROJO)' :
        f.colorStatus === 'yellow' ? 'POR VENCER (1-3 DÍAS / AMARILLO)' :
        f.colorStatus === 'green' ? 'AL DÍA (≥ 4 DÍAS / VERDE)' : 'SIN CERTIFICACIÓN',
      'Fecha Último Lavado': f.fecha_ultimo_lavado || 'Sin registro'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard de lavados");
    XLSX.writeFile(workbook, `Reporte_Dashboard_Lavados_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-5 h-full">
      
      {/* 1. Header con Título y Botón Exportar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets className="text-blue-600" />
            Dashboard de lavados
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Monitoreo y semaforización de certificaciones a 1 mes de vigencia (Rojo: vencida/hoy, Amarillo: 1 a 3 días restantes, Verde: ≥ 4 días vigentes).
          </p>
        </div>
        
        <Button 
          onClick={exportToExcel}
          variant="outline"
          className="flex items-center gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
        >
          <Download size={15} />
          Exportar a Excel
        </Button>
      </div>

      {/* 2. Tarjetas KPI de Estado (5 tarjetas - Requisito 2: Quitar tarjeta <7d) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Flota */}
        <div 
          onClick={() => setActiveCard('todos')}
          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
            activeCard === 'todos' ? 'bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-300' : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <p className="text-[10px] font-semibold uppercase text-slate-500">Total Flota</p>
          <p className="text-2xl font-black">{stats.total}</p>
          <span className="text-[9px] text-slate-400">Vehículos filtrados</span>
        </div>

        {/* Vencidos / Hoy (ROJO) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'red' ? 'todos' : 'red')}
          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
            activeCard === 'red' 
              ? 'bg-red-100 border-red-500 text-red-900 ring-2 ring-red-400' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase text-red-700">Vencida / Hoy</p>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
          </div>
          <p className="text-2xl font-black text-red-800">{stats.redCount}</p>
          <span className="text-[9px] font-semibold text-red-600">≤ 0 días (1 mes cumplido)</span>
        </div>

        {/* Faltan 1 a 3 días (AMARILLO) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'yellow' ? 'todos' : 'yellow')}
          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
            activeCard === 'yellow' 
              ? 'bg-yellow-100 border-yellow-500 text-yellow-900 ring-2 ring-yellow-400' 
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase text-yellow-800">Por Vencer</p>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
          </div>
          <p className="text-2xl font-black text-yellow-900">{stats.yellowCount}</p>
          <span className="text-[9px] font-semibold text-yellow-700">Faltan 1 a 3 días</span>
        </div>

        {/* Mayor a 4 días (VERDE) */}
        <div 
          onClick={() => setActiveCard(activeCard === 'green' ? 'todos' : 'green')}
          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
            activeCard === 'green' 
              ? 'bg-green-100 border-green-500 text-green-900 ring-2 ring-green-400' 
              : 'bg-green-50 border-green-200 text-green-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase text-green-800">Al Día</p>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
          </div>
          <p className="text-2xl font-black text-green-900">{stats.greenCount}</p>
          <span className="text-[9px] font-semibold text-green-700">≥ 4 días vigentes</span>
        </div>

        {/* Sin Certificación */}
        <div 
          onClick={() => setActiveCard(activeCard === 'nocert' ? 'todos' : 'nocert')}
          className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
            activeCard === 'nocert' 
              ? 'bg-slate-200 border-slate-500 text-slate-900 ring-2 ring-slate-400' 
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <p className="text-[10px] font-semibold uppercase text-slate-500">Sin Certif.</p>
          <p className="text-2xl font-black text-slate-600">{stats.noCertCount}</p>
          <span className="text-[9px] text-slate-400">Sin registro</span>
        </div>
      </div>

      {/* 3. Filtros y Búsqueda (Con Región agregada - Requisito 3) */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por N° Interno, Patente, Marca o Región..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 h-9 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
        </div>

        {/* Filtro por Región (Requisito 3) */}
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          {regions.map(r => (
            <option key={r} value={r}>
              {r === 'Todas' ? 'Todas las Regiones' : `Región: ${r}`}
            </option>
          ))}
        </select>

        {/* Filtro por Tipo */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todos los Tipos</option>
          <option value="Camiones/Camionetas">Camiones/Camionetas</option>
          <option value="Tractos">Tractos</option>
          <option value="Semirremolques">Semirremolques</option>
        </select>

        {/* Filtro por Semáforo */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todos los Estados</option>
          <option value="red">Vencidas / Hoy (Rojo)</option>
          <option value="yellow">Por Vencer (Amarillo)</option>
          <option value="green">Al Día (Verde)</option>
          <option value="none">Sin Certificación</option>
        </select>
      </div>

      {/* 4. Tabla de Dashboard de Lavados (Requisito 3 & 5) */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 shadow-2xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">N° Interno</th>
              <th className="px-4 py-3">Patente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Marca</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Última Certificación (+1 mes)</th>
              <th className="px-4 py-3">Fecha Último Lavado</th>
              <th className="px-4 py-3 text-center">Estado Semáforo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-400">
                  <Droplets size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">No se encontraron vehículos para mostrar.</p>
                  <p className="text-xs text-slate-400 mt-0.5">Prueba cambiando los filtros seleccionados.</p>
                </td>
              </tr>
            ) : (
              filteredVehicles.map((truck) => {
                // COLOR DEL N° INTERNO SEGÚN REGLA DEL USUARIO (Requisito 3 & 5: Contando 1 mes completo):
                // - Igual o días pasados (diffDays <= 0): ROJO
                // - Faltan 1 a 3 días: AMARILLO
                // - Mayor a 4 días (diffDays >= 4): VERDE
                let internalBadgeStyle = 'bg-slate-100 text-slate-700 border border-slate-200';
                if (truck.colorStatus === 'red') {
                  internalBadgeStyle = 'bg-red-500 text-white font-black shadow-xs ring-1 ring-red-400';
                } else if (truck.colorStatus === 'yellow') {
                  internalBadgeStyle = 'bg-amber-400 text-amber-950 font-black shadow-xs ring-1 ring-amber-300';
                } else if (truck.colorStatus === 'green') {
                  internalBadgeStyle = 'bg-emerald-600 text-white font-black shadow-xs ring-1 ring-emerald-500';
                }

                return (
                  <tr key={truck.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* 1. N° Interno con color condicional */}
                    <td className="px-4 py-3 font-mono">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-mono tracking-wide ${internalBadgeStyle}`}>
                        {truck.internal_number || 'S/N'}
                      </span>
                    </td>

                    {/* 2. Patente */}
                    <td className="px-4 py-3 font-bold font-mono text-slate-900">
                      {truck.plate}
                    </td>

                    {/* 3. Tipo */}
                    <td className="px-4 py-3 text-slate-600">
                      {truck.type || '—'}
                    </td>

                    {/* 4. Marca */}
                    <td className="px-4 py-3 text-slate-600">
                      {truck.brand || '—'}
                    </td>

                    {/* 5. Región (Requisito 3) */}
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {truck.region || <span className="text-slate-400 italic text-[11px]">—</span>}
                    </td>

                    {/* 6. Ultima certificación (Contando 1 mes completo - Requisito 5) */}
                    <td className="px-4 py-3">
                      {truck.ultima_certificacion ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900">
                              {truck.ultima_certificacion}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              → Vence: <strong>{truck.certExpDate}</strong>
                            </span>
                          </div>
                          <span className={`text-[10px] font-semibold ${
                            truck.colorStatus === 'red' ? 'text-red-600 font-bold' :
                            truck.colorStatus === 'yellow' ? 'text-amber-700 font-bold' :
                            'text-emerald-600'
                          }`}>
                            {truck.certDays <= 0 
                              ? (truck.certDays === 0 ? 'Vence hoy (1 mes cumplido)' : `Vencida hace ${Math.abs(truck.certDays)} día(s)`) 
                              : `Faltan ${truck.certDays} día(s) para cumplir el mes`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">— Sin certificación —</span>
                      )}
                    </td>

                    {/* 7. Fecha Último Lavado */}
                    <td className="px-4 py-3">
                      {truck.fecha_ultimo_lavado ? (
                        <div className="flex flex-col">
                          <span className="font-mono font-medium text-slate-900">
                            {truck.fecha_ultimo_lavado}
                          </span>
                          {truck.washDays !== null && (
                            <span className="text-[10px] text-slate-400">
                              {truck.washDays === 0 ? 'Lavado hoy' : 
                               truck.washDays === -1 ? 'Lavado ayer' : 
                               `Hace ${Math.abs(truck.washDays)} días`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">— Sin lavado —</span>
                      )}
                    </td>

                    {/* 8. Estado Semáforo */}
                    <td className="px-4 py-3 text-center">
                      {truck.colorStatus === 'red' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-200">
                          <AlertTriangle size={11} /> VENCIDA / HOY
                        </span>
                      )}
                      {truck.colorStatus === 'yellow' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock size={11} /> POR VENCER (1-3 DÍAS)
                        </span>
                      )}
                      {truck.colorStatus === 'green' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 size={11} /> AL DÍA (≥ 4 DÍAS)
                        </span>
                      )}
                      {truck.colorStatus === 'none' && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                          SIN REGISTRO
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Mostrando <strong>{filteredVehicles.length}</strong> de <strong>{enrichedFleet.length}</strong> vehículos</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Rojo: Vencida / Hoy (≤ 0 días)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Amarillo: Por vencer (1-3 días)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Verde: Al día (≥ 4 días)</span>
        </div>
      </div>

    </div>
  );
}
