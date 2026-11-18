import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ShieldCheck, Search, Calendar, Download, RefreshCw,
  Truck, Droplets, Snowflake, Sparkles, User, Clock, Filter, CheckCircle2, Radio
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useFleetStore } from '../store/fleetStore';
import { matchVehicleByCode } from '../lib/vehicleMatcher';
import { Button } from './ui/Button';

const SERVICE_TYPES = [
  'Limpieza interna',
  'Deshielo',
  'Sanitización',
  'Limpieza externa'
];

// Normalizar texto sin tildes y en minúsculas para comparaciones seguras
const normalizeServiceText = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// Obtener fecha YYYY-MM-DD en zona horaria de Chile (America/Santiago)
const getChileDateParts = (dateInput) => {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });

  const year = map.year;
  const month = map.month;
  const day = map.day;
  const hour = map.hour === '24' ? '00' : map.hour;
  const minute = map.minute;
  const second = map.second;

  return {
    ymd: `${year}-${month}-${day}`,
    dmy: `${day}-${month}-${year}`,
    time: `${hour}:${minute}:${second}`,
    formatted: `${day}-${month}-${year} ${hour}:${minute}`
  };
};

// Extraer lista de servicios desde servicios_texto (o array servicios como respaldo)
const extractServicesList = (record) => {
  if (record?.servicios_texto && String(record.servicios_texto).trim() !== '') {
    return String(record.servicios_texto)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(record?.servicios)) {
    return record.servicios.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return [];
};

// Configuración visual de badges según tipo de servicio
const getServiceBadgeConfig = (serviceName) => {
  const norm = normalizeServiceText(serviceName);
  if (norm.includes('limpieza interna')) {
    return {
      label: serviceName,
      className: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10',
      dotClass: 'bg-blue-500',
      Icon: Droplets
    };
  }
  if (norm.includes('deshielo')) {
    return {
      label: serviceName,
      className: 'bg-cyan-50 text-cyan-800 border-cyan-200 ring-cyan-500/10',
      dotClass: 'bg-cyan-500',
      Icon: Snowflake
    };
  }
  if (norm.includes('sanitizacion')) {
    return {
      label: serviceName,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10',
      dotClass: 'bg-emerald-500',
      Icon: Sparkles
    };
  }
  if (norm.includes('limpieza externa')) {
    return {
      label: serviceName,
      className: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/10',
      dotClass: 'bg-indigo-500',
      Icon: Truck
    };
  }
  return {
    label: serviceName,
    className: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10',
    dotClass: 'bg-slate-400',
    Icon: CheckCircle2
  };
};

export default function WashCertification() {
  const { fleetList, fetchFleet } = useFleetStore();

  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');

  const fetchRecords = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('registro_servicios_flota')
        .select('*')
        .order('fecha_registro', { ascending: false });

      if (error) {
        console.error('[Certificación de lavados] Error consultando registro_servicios_flota:', error);
        toast.error('No se pudieron cargar los registros de certificación de lavados.');
      } else {
        setRecords(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[Certificación de lavados] Error inesperado:', err);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fleetList || fleetList.length === 0) {
      fetchFleet?.();
    }
  }, [fleetList, fetchFleet]);

  useEffect(() => {
    fetchRecords(true);

    // Suscripción en tiempo real a registro_servicios_flota
    const channel = supabase
      .channel('realtime:registro_servicios_flota')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registro_servicios_flota' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setRecords((prev) => {
              const exists = prev.some((r) => r.id === payload.new.id);
              const updated = exists
                ? prev.map((r) => (r.id === payload.new.id ? payload.new : r))
                : [payload.new, ...prev];
              return updated.sort(
                (a, b) => new Date(b.fecha_registro || 0).getTime() - new Date(a.fecha_registro || 0).getTime()
              );
            });
            toast.success(`Nuevo lavado certificado: Camión ${payload.new.camion || 'S/N'}`);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setRecords((prev) =>
              prev
                .map((r) => (r.id === payload.new.id ? payload.new : r))
                .sort((a, b) => new Date(b.fecha_registro || 0).getTime() - new Date(a.fecha_registro || 0).getTime())
            );
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setRecords((prev) => prev.filter((r) => r.id !== payload.old.id));
          } else {
            fetchRecords(false);
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [fetchRecords]);

  // Enriquecer registros con hora local de Chile, lista de servicios y cruce con flota (patente)
  const enrichedRecords = useMemo(() => {
    return [...records]
      .sort((a, b) => new Date(b.fecha_registro || 0).getTime() - new Date(a.fecha_registro || 0).getTime())
      .map((rec) => {
        const chileDate = getChileDateParts(rec.fecha_registro);
        const servicesList = extractServicesList(rec);
        const matchedVehicle = matchVehicleByCode(rec.camion, '', fleetList);

        return {
          ...rec,
          chileYmd: chileDate?.ymd || '',
          chileFormatted: chileDate?.formatted || 'Fecha inválida',
          chileTimeOnly: chileDate?.time || '',
          chileDateOnly: chileDate?.dmy || '',
          servicesList,
          matchedPlate: matchedVehicle?.plate || '',
          matchedInternal: matchedVehicle?.internal_number || ''
        };
      });
  }, [records, fleetList]);

  // Fecha de hoy en Chile (YYYY-MM-DD)
  const todayChileYmd = useMemo(() => {
    return getChileDateParts(new Date())?.ymd || '';
  }, []);

  // Indicadores Superiores (KPIs)
  const kpiStats = useMemo(() => {
    const certifiedTodayRecords = enrichedRecords.filter((r) => r.chileYmd === todayChileYmd);
    const uniqueTrucksToday = new Set(
      certifiedTodayRecords.map((r) => String(r.camion || '').trim().toUpperCase()).filter(Boolean)
    );

    const serviceCounts = {
      'Limpieza interna': 0,
      'Deshielo': 0,
      'Sanitización': 0,
      'Limpieza externa': 0
    };

    const serviceCountsToday = {
      'Limpieza interna': 0,
      'Deshielo': 0,
      'Sanitización': 0,
      'Limpieza externa': 0
    };

    enrichedRecords.forEach((r) => {
      const isToday = r.chileYmd === todayChileYmd;
      const normalizedServices = r.servicesList.map(normalizeServiceText);

      SERVICE_TYPES.forEach((serviceType) => {
        const targetNorm = normalizeServiceText(serviceType);
        if (normalizedServices.some((s) => s.includes(targetNorm))) {
          serviceCounts[serviceType] += 1;
          if (isToday) {
            serviceCountsToday[serviceType] += 1;
          }
        }
      });
    });

    return {
      totalCertifiedToday: certifiedTodayRecords.length,
      uniqueTrucksTodayCount: uniqueTrucksToday.size,
      totalRecords: enrichedRecords.length,
      serviceCounts,
      serviceCountsToday
    };
  }, [enrichedRecords, todayChileYmd]);

  // Registros filtrados para la tabla y exportación a Excel
  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter((r) => {
      // 1. Buscador por número o patente de camión
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const mCamion = String(r.camion || '').toLowerCase().includes(q);
        const mPlate = String(r.matchedPlate || '').toLowerCase().includes(q);
        const mInternal = String(r.matchedInternal || '').toLowerCase().includes(q);
        if (!mCamion && !mPlate && !mInternal) return false;
      }

      // 2. Filtro por rango de fechas (comparado en fecha local de Chile YYYY-MM-DD)
      if (startDate && r.chileYmd && r.chileYmd < startDate) {
        return false;
      }
      if (endDate && r.chileYmd && r.chileYmd > endDate) {
        return false;
      }

      // 3. Filtro por tipo de servicio
      if (serviceFilter !== 'Todos') {
        const targetNorm = normalizeServiceText(serviceFilter);
        const hasService = r.servicesList.some((s) => normalizeServiceText(s).includes(targetNorm));
        if (!hasService) return false;
      }

      return true;
    });
  }, [enrichedRecords, searchTerm, startDate, endDate, serviceFilter]);

  // Exportar registros filtrados a Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      toast.warning('No hay registros filtrados para exportar.');
      return;
    }

    const rowsToExport = filteredRecords.map((r) => ({
      'Fecha y Hora (Chile)': r.chileFormatted,
      'Camión': r.camion || 'S/N',
      'Patente Asociada': r.matchedPlate || '—',
      'Servicios Realizados': r.servicios_texto || r.servicesList.join(', ') || '—',
      'Reportado por': r.usuario_telegram || '—'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Certificación de Lavados');
    const fileDate = todayChileYmd || new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Certificacion_Lavados_${fileDate}.xlsx`);
    toast.success(`Exportados ${rowsToExport.length} registro(s) a Excel`);
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' || startDate !== '' || endDate !== '' || serviceFilter !== 'Todos';

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-5 h-full">
      {/* 1. Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" />
              Certificación de lavados
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                isRealtimeConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Conexión Realtime con tabla registro_servicios_flota de Supabase"
            >
              <Radio size={12} className={isRealtimeConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'} />
              {isRealtimeConnected ? 'Tiempo Real Activo' : 'Sincronizando...'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitoreo en tiempo real de servicios y lavados reportados en flota (hora local de Chile).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchRecords(true)}
            className="flex items-center gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
            title="Refrescar registros desde Supabase"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-600' : ''} />
            Actualizar
          </Button>

          <Button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
          >
            <Download size={15} />
            Exportar a Excel ({filteredRecords.length})
          </Button>
        </div>
      </div>

      {/* 2. Indicadores Superiores (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Camiones Certificados Hoy */}
        <div
          onClick={() => {
            if (startDate === todayChileYmd && endDate === todayChileYmd) {
              setStartDate('');
              setEndDate('');
            } else {
              setStartDate(todayChileYmd);
              setEndDate(todayChileYmd);
            }
          }}
          className={`p-3.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all hover:shadow-sm ${
            startDate === todayChileYmd && endDate === todayChileYmd
              ? 'bg-emerald-100/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
          }`}
          title="Clic para filtrar los certificados de hoy"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Camiones Certificados Hoy
            </span>
            <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
          </div>
          <div className="my-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-900">{kpiStats.totalCertifiedToday}</span>
            <span className="text-[11px] font-semibold text-emerald-700">
              ({kpiStats.uniqueTrucksTodayCount} {kpiStats.uniqueTrucksTodayCount === 1 ? 'camión único' : 'camiones únicos'})
            </span>
          </div>
          <span className="text-[10px] text-emerald-700 font-medium">
            Total histórico: {kpiStats.totalRecords} reg.
          </span>
        </div>

        {/* Desglose por Tipo de Servicio */}
        {[
          {
            type: 'Limpieza interna',
            title: 'Limpieza Interna',
            bgActive: 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-950',
            bgIdle: 'bg-blue-50/60 border-blue-200 text-blue-900',
            labelColor: 'text-blue-700',
            iconColor: 'text-blue-600',
            Icon: Droplets
          },
          {
            type: 'Deshielo',
            title: 'Deshielo',
            bgActive: 'bg-cyan-100 border-cyan-500 ring-2 ring-cyan-300 text-cyan-950',
            bgIdle: 'bg-cyan-50/60 border-cyan-200 text-cyan-900',
            labelColor: 'text-cyan-800',
            iconColor: 'text-cyan-600',
            Icon: Snowflake
          },
          {
            type: 'Sanitización',
            title: 'Sanitización',
            bgActive: 'bg-teal-100 border-teal-500 ring-2 ring-teal-300 text-teal-950',
            bgIdle: 'bg-teal-50/60 border-teal-200 text-teal-900',
            labelColor: 'text-teal-800',
            iconColor: 'text-teal-600',
            Icon: Sparkles
          },
          {
            type: 'Limpieza externa',
            title: 'Limpieza Externa',
            bgActive: 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-300 text-indigo-950',
            bgIdle: 'bg-indigo-50/60 border-indigo-200 text-indigo-900',
            labelColor: 'text-indigo-700',
            iconColor: 'text-indigo-600',
            Icon: Truck
          }
        ].map((card) => {
          const isSelected = serviceFilter === card.type;
          const totalCount = kpiStats.serviceCounts[card.type] || 0;
          const todayCount = kpiStats.serviceCountsToday[card.type] || 0;
          const IconComp = card.Icon;

          return (
            <div
              key={card.type}
              onClick={() => setServiceFilter(isSelected ? 'Todos' : card.type)}
              className={`p-3.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all hover:shadow-sm ${
                isSelected ? card.bgActive : card.bgIdle
              }`}
              title={`Clic para filtrar por ${card.title}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${card.labelColor}`}>
                  {card.title}
                </span>
                <IconComp size={15} className={`${card.iconColor} shrink-0`} />
              </div>
              <div className="my-1 flex items-baseline gap-2">
                <span className="text-2xl font-black">{totalCount}</span>
                <span className={`text-[11px] font-bold ${card.labelColor}`}>
                  ({todayCount} hoy)
                </span>
              </div>
              <span className="text-[10px] opacity-75 font-medium">
                {isSelected ? 'Filtro activo (clic para quitar)' : 'Clic para filtrar servicio'}
              </span>
            </div>
          );
        })}
      </div>

      {/* 3. Barra de Búsqueda y Filtros */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
        {/* Buscador por número/patente de camión */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Buscar por número o patente de camión (ej: C273)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 h-9 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
          />
        </div>

        {/* Filtro por Rango de Fechas */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white px-3 py-1 rounded-xl border border-slate-200 min-h-9">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold text-[11px]">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs text-slate-700 font-medium focus:outline-none bg-transparent cursor-pointer"
            />
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold text-[11px]">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs text-slate-700 font-medium focus:outline-none bg-transparent cursor-pointer"
            />
          </div>
        </div>

        {/* Filtro por Tipo de Servicio */}
        <div className="flex items-center gap-1.5 bg-white px-3 rounded-xl border border-slate-200 h-9">
          <Filter size={13} className="text-slate-400 shrink-0" />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
          >
            <option value="Todos">Todos los servicios</option>
            {SERVICE_TYPES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStartDate('');
              setEndDate('');
              setServiceFilter('Todos');
            }}
            className="text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 h-9 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            × Limpiar filtros
          </button>
        )}
      </div>

      {/* 4. Tabla de Registros (ordenada del más reciente al más antiguo) */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 shadow-2xs">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
            <tr>
              <th className="px-4 py-3">Fecha y Hora (Chile)</th>
              <th className="px-4 py-3">Camión</th>
              <th className="px-4 py-3">Servicios Realizados</th>
              <th className="px-4 py-3">Reportado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {isLoading ? (
              <tr>
                <td colSpan="4" className="py-12 text-center text-slate-400">
                  <RefreshCw size={28} className="mx-auto text-blue-500 animate-spin mb-2" />
                  <p className="font-semibold text-sm text-slate-600">Cargando certificaciones de lavado...</p>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-12 text-center text-slate-400">
                  <ShieldCheck size={34} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm text-slate-600">
                    No se encontraron registros de certificación de lavados.
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {hasActiveFilters
                      ? 'Prueba ajustando o limpiando los filtros de búsqueda.'
                      : 'Los nuevos reportes enviados por Telegram aparecerán aquí en tiempo real.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec) => {
                const isToday = rec.chileYmd === todayChileYmd;
                return (
                  <tr
                    key={rec.id || `${rec.camion}-${rec.fecha_registro}`}
                    className="hover:bg-slate-50/90 transition-colors"
                  >
                    {/* Columna 1: Fecha y Hora (formateada a hora local de Chile) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400 shrink-0" />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900">
                              {rec.chileFormatted}
                            </span>
                            {isToday && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                Hoy
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">Hora local de Chile</span>
                        </div>
                      </div>
                    </td>

                    {/* Columna 2: Camión */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-slate-900 text-white shadow-2xs">
                          <Truck size={13} className="text-blue-400" />
                          {rec.camion || 'S/N'}
                        </span>
                        {rec.matchedPlate && (
                          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {rec.matchedPlate}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Columna 3: Servicios Realizados (badges visuales) */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rec.servicesList.length > 0 ? (
                          rec.servicesList.map((srv, idx) => {
                            const cfg = getServiceBadgeConfig(srv);
                            const BadgeIcon = cfg.Icon;
                            return (
                              <span
                                key={`${srv}-${idx}`}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ring-1 ${cfg.className}`}
                              >
                                <BadgeIcon size={12} className="shrink-0" />
                                <span>{cfg.label}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-slate-400 italic text-xs">Sin servicios detallados</span>
                        )}
                      </div>
                    </td>

                    {/* Columna 4: Reportado por (usuario_telegram) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                        <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-black shrink-0">
                          <User size={11} />
                        </div>
                        <span>{rec.usuario_telegram || 'Desconocido'}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
