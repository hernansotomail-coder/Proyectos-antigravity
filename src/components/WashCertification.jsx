import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ShieldCheck, Search, Calendar, Download, RefreshCw,
  Truck, Droplets, Snowflake, Sparkles, User, Clock, Filter, CheckCircle2, Radio,
  FileText, Trash2, MapPin, AlertTriangle, X, Edit2, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { matchVehicleByCode, normalizeVehicleCode } from '../lib/vehicleMatcher';
import {
  generateAndSaveCertificatePdf,
  getNextCorrelativo,
  setNextCorrelativo,
  formatCorrelativo
} from '../lib/certificateGenerator';
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

// Parsear fecha YYYY-MM-DD o DD-MM-YYYY a Date local (medianoche)
const parseDateOnly = (dateStr) => {
  if (!dateStr) return null;
  const clean = String(dateStr).trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return isNaN(d.getTime()) ? null : d;
    } else {
      const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateDmy = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

// Calcular vigencia de 30 días desde la fecha de emisión del último certificado
// - Al día: dentro de los primeros 27 días (daysElapsed < 27, es decir, daysRemaining > 3)
// - Por vencer: últimos 3 días para llegar a los 30 (daysRemaining >= 1 && daysRemaining <= 3)
// - Vencida: pasaron 30 días o más (daysRemaining <= 0)
const getCert30DayStatus = (certDateStr, todayChileYmd) => {
  const emissionDate = parseDateOnly(certDateStr);
  if (!emissionDate) {
    return {
      status: 'sin_cert',
      emissionDmy: null,
      expirationDmy: null,
      daysElapsed: null,
      daysRemaining: null
    };
  }
  const todayDate = parseDateOnly(todayChileYmd) || new Date();
  todayDate.setHours(0, 0, 0, 0);
  emissionDate.setHours(0, 0, 0, 0);

  const expirationDate = new Date(emissionDate.getTime());
  expirationDate.setDate(expirationDate.getDate() + 30);

  const diffMs = todayDate.getTime() - emissionDate.getTime();
  const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysRemaining = 30 - daysElapsed;

  let status = 'al_dia';
  if (daysRemaining <= 0) {
    status = 'vencida';
  } else if (daysRemaining <= 3) {
    status = 'por_vencer';
  }

  return {
    status,
    emissionDmy: formatDateDmy(emissionDate),
    expirationDmy: formatDateDmy(expirationDate),
    daysElapsed,
    daysRemaining
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
  const { fleetList, fetchFleet, updateSingleFleetWash } = useFleetStore();

  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  // Filtros tabla principal
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');

  // Estado Modal "Emisión de certificado"
  const [isEmissionModalOpen, setIsEmissionModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalVehicleType, setModalVehicleType] = useState('Todos');
  const [modalStatusFilter, setModalStatusFilter] = useState('Todos');
  const [correlativoNum, setCorrelativoNum] = useState(() => getNextCorrelativo());
  const [isEditingCorrelativo, setIsEditingCorrelativo] = useState(false);
  const [correlativoInput, setCorrelativoInput] = useState(() => String(getNextCorrelativo()));
  const [emittingTruckId, setEmittingTruckId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  // Fecha de hoy en Chile (YYYY-MM-DD y DD-MM-YYYY)
  const todayChileParts = useMemo(() => {
    return getChileDateParts(new Date()) || { ymd: '', dmy: '' };
  }, []);
  const todayChileYmd = todayChileParts.ymd;
  const todayChileDmy = todayChileParts.dmy;

  // Matriz de Flota Propia (Gestión Flota -> N° Interno) cruzada con último lavado Telegram y última emisión
  const ownFleetMatrix = useMemo(() => {
    // Indexar el último registro de Telegram por vehículo (ya ordenados del más reciente al más antiguo)
    const latestWashByVehicleId = new Map();
    const latestWashByCode = new Map();

    enrichedRecords.forEach((rec) => {
      const matched = matchVehicleByCode(rec.camion, '', fleetList);
      if (matched?.id && !latestWashByVehicleId.has(matched.id)) {
        latestWashByVehicleId.set(matched.id, rec);
      }
      const normCamion = normalizeVehicleCode(rec.camion);
      if (normCamion && !latestWashByCode.has(normCamion)) {
        latestWashByCode.set(normCamion, rec);
      }
    });

    return (fleetList || [])
      .filter((f) => !isVehicleExternal(f) && f.internal_number && String(f.internal_number).trim() !== '')
      .map((truck) => {
        const normInt = normalizeVehicleCode(truck.internal_number);
        const normPlate = normalizeVehicleCode(truck.plate);
        const lastTelegramWash =
          latestWashByVehicleId.get(truck.id) ||
          (normInt && latestWashByCode.get(normInt)) ||
          (normPlate && latestWashByCode.get(normPlate)) ||
          null;

        const certInfo = getCert30DayStatus(truck.ultima_certificacion, todayChileYmd);

        return {
          ...truck,
          lastTelegramWash,
          lastTelegramWashDmy: lastTelegramWash?.chileDateOnly || '',
          lastTelegramWashFormatted: lastTelegramWash?.chileFormatted || '',
          certInfo
        };
      })
      .sort((a, b) =>
        String(a.internal_number || '').localeCompare(String(b.internal_number || ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      );
  }, [fleetList, enrichedRecords, todayChileYmd]);

  // Regiones y Tipos de vehículos disponibles en Flota Propia
  const availableRegions = useMemo(() => {
    const rSet = new Set(ownFleetMatrix.map((t) => String(t.region || '').trim()).filter(Boolean));
    return Array.from(rSet).sort((a, b) => a.localeCompare(b));
  }, [ownFleetMatrix]);

  const availableVehicleTypes = useMemo(() => {
    const tSet = new Set(ownFleetMatrix.map((t) => String(t.type || '').trim()).filter(Boolean));
    return Array.from(tSet).sort((a, b) => a.localeCompare(b));
  }, [ownFleetMatrix]);

  // Indicadores Superiores (KPIs) filtrados por Ubicación (Región)
  const kpiStats = useMemo(() => {
    const regionTrucks =
      regionFilter === 'Todas'
        ? ownFleetMatrix
        : ownFleetMatrix.filter((t) => String(t.region || '').trim() === regionFilter);

    let alDiaCount = 0;
    let porVencerCount = 0;
    let vencidaCount = 0;
    let sinCertCount = 0;

    regionTrucks.forEach((t) => {
      if (t.certInfo.status === 'al_dia') alDiaCount += 1;
      else if (t.certInfo.status === 'por_vencer') porVencerCount += 1;
      else if (t.certInfo.status === 'vencida') vencidaCount += 1;
      else sinCertCount += 1;
    });

    return {
      totalOwnFleet: regionTrucks.length,
      alDiaCount,
      porVencerCount,
      vencidaCount,
      sinCertCount
    };
  }, [ownFleetMatrix, regionFilter]);

  // Camiones filtrados para el Modal "Emisión de certificado"
  const filteredModalTrucks = useMemo(() => {
    return ownFleetMatrix.filter((t) => {
      if (regionFilter !== 'Todas' && String(t.region || '').trim() !== regionFilter) {
        return false;
      }
      if (modalVehicleType !== 'Todos' && String(t.type || '').trim() !== modalVehicleType) {
        return false;
      }
      if (modalStatusFilter !== 'Todos' && t.certInfo.status !== modalStatusFilter) {
        return false;
      }
      if (modalSearch.trim() !== '') {
        const q = modalSearch.toLowerCase().trim();
        const mInt = String(t.internal_number || '').toLowerCase().includes(q);
        const mPlate = String(t.plate || '').toLowerCase().includes(q);
        const mType = String(t.type || '').toLowerCase().includes(q);
        const mRegion = String(t.region || '').toLowerCase().includes(q);
        if (!mInt && !mPlate && !mType && !mRegion) return false;
      }
      return true;
    });
  }, [ownFleetMatrix, regionFilter, modalVehicleType, modalStatusFilter, modalSearch]);

  // Emitir certificado PDF (pregunta carpeta de guardado, no guarda archivo en la plataforma, solo captura fecha de emisión)
  const handleEmitCertificate = async (truckRow) => {
    setEmittingTruckId(truckRow.id || truckRow.internal_number);
    try {
      const todayDate = parseDateOnly(todayChileYmd) || new Date();
      const expDate = new Date(todayDate.getTime());
      expDate.setDate(expDate.getDate() + 30);

      const emissionDateDmy = todayChileDmy || formatDateDmy(todayDate);
      const expirationDateDmy = formatDateDmy(expDate);

      // Fecha de inic. Tratamiento: último registro del camión en la matriz (Telegram)
      let treatmentStartDateDmy = truckRow.lastTelegramWashDmy;
      if (!treatmentStartDateDmy && truckRow.fecha_ultimo_lavado) {
        const parsedWash = parseDateOnly(truckRow.fecha_ultimo_lavado);
        if (parsedWash) treatmentStartDateDmy = formatDateDmy(parsedWash);
      }
      if (!treatmentStartDateDmy) {
        treatmentStartDateDmy = emissionDateDmy;
      }

      const result = await generateAndSaveCertificatePdf({
        correlativoNum,
        plate: truckRow.plate || truckRow.internal_number,
        internalNumber: truckRow.internal_number,
        treatmentStartDateDmy,
        emissionDateDmy,
        expirationDateDmy
      });

      if (result.cancelled) {
        toast.info('Emisión cancelada: no se seleccionó carpeta de guardado.');
        return;
      }

      if (result.saved) {
        // Incrementar correlativo
        const nextNum = setNextCorrelativo(correlativoNum + 1);
        setCorrelativoNum(nextNum);
        setCorrelativoInput(String(nextNum));

        // Capturar únicamente la fecha de emisión en la plataforma
        await updateSingleFleetWash(truckRow.internal_number || truckRow.id, {
          ultima_certificacion: todayChileYmd
        });

        toast.success(
          `Certificado N° ${result.correlativoStr} emitido para ${truckRow.internal_number} (${truckRow.plate || 'S/P'})`
        );
      }
    } catch (err) {
      console.error('[Certificación de lavados] Error emitiendo certificado:', err);
      toast.error('Ocurrió un error al generar el certificado PDF.');
    } finally {
      setEmittingTruckId(null);
    }
  };

  // Eliminar un registro de la tabla de lavados (Telegram)
  const handleDeleteRecord = async (rec) => {
    if (!rec?.id) return;
    const confirmed = window.confirm(
      `¿Eliminar el registro de lavado del camión ${rec.camion || 'S/N'} (${rec.chileFormatted})?`
    );
    if (!confirmed) return;

    setDeletingId(rec.id);
    try {
      const { error } = await supabase
        .from('registro_servicios_flota')
        .delete()
        .eq('id', rec.id);

      if (error) {
        console.error('[Certificación de lavados] Error eliminando registro:', error);
        toast.error('No se pudo eliminar el registro en Supabase.');
      } else {
        setRecords((prev) => prev.filter((r) => r.id !== rec.id));
        toast.success(`Registro de ${rec.camion || 'S/N'} eliminado.`);
      }
    } catch (err) {
      console.error('[Certificación de lavados] Error inesperado al eliminar:', err);
      toast.error('Error inesperado al eliminar el registro.');
    } finally {
      setDeletingId(null);
    }
  };

  const openEmissionModal = (statusPreset = 'Todos') => {
    setModalStatusFilter(statusPreset);
    setModalSearch('');
    setModalVehicleType('Todos');
    setIsEmissionModalOpen(true);
  };

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

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            onClick={() => openEmissionModal('Todos')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
          >
            <FileText size={15} />
            Emisión de certificado
          </Button>

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

      {/* 2. Filtro de Ubicación (Región) + 3 Tarjetas de Vigencia de Certificación */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <MapPin size={14} className="text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-600">Ubicación (Región):</span>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer pr-2"
            >
              <option value="Todas">Todas las regiones</option>
              {availableRegions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Flota propia evaluada: <strong className="text-slate-800">{kpiStats.totalOwnFleet}</strong> camiones
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tarjeta 1: Camiones certificación al día (dentro de los 27 días) */}
          <div
            onClick={() => openEmissionModal('al_dia')}
            className="p-4 rounded-xl border bg-emerald-50/80 border-emerald-200 text-emerald-900 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-emerald-400"
            title="Camiones con certificación emitida dentro de los últimos 27 días (clic para ver matriz)"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Camiones certificación al día
              </span>
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-900">{kpiStats.alDiaCount}</span>
              <span className="text-xs font-semibold text-emerald-700">camiones</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">
              Certificación vigente dentro de los 27 días
            </span>
          </div>

          {/* Tarjeta 2: Camiones con certificación por vencer (últimos 3 días para llegar a 30) */}
          <div
            onClick={() => openEmissionModal('por_vencer')}
            className="p-4 rounded-xl border bg-amber-50/90 border-amber-300 text-amber-950 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-amber-500 ring-1 ring-amber-200"
            title="Clic para abrir el popup de emisión de certificados para camiones por vencer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Camiones con certificación por vencer
              </span>
              <Clock size={18} className="text-amber-600 shrink-0" />
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-900">{kpiStats.porVencerCount}</span>
              <span className="text-xs font-semibold text-amber-700">camiones</span>
            </div>
            <span className="text-[11px] text-amber-800 font-semibold">
              Dentro de los últimos 3 días para llegar a 30 · Clic para emitir
            </span>
          </div>

          {/* Tarjeta 3: Camiones con certificación vencida (pasaron 30 días) */}
          <div
            onClick={() => openEmissionModal('vencida')}
            className="p-4 rounded-xl border bg-rose-50/85 border-rose-200 text-rose-950 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-rose-400"
            title="Camiones cuya certificación superó los 30 días desde su emisión (clic para ver matriz)"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Camiones con certificación vencida
              </span>
              <AlertTriangle size={18} className="text-rose-600 shrink-0" />
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-900">{kpiStats.vencidaCount}</span>
              <span className="text-xs font-semibold text-rose-700">camiones</span>
              {kpiStats.sinCertCount > 0 && (
                <span className="text-[11px] font-semibold text-slate-500 ml-1">
                  (+{kpiStats.sinCertCount} sin cert.)
                </span>
              )}
            </div>
            <span className="text-[11px] text-rose-700 font-medium">
              Pasaron más de 30 días desde la última emisión
            </span>
          </div>
        </div>
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
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {isLoading ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-400">
                  <RefreshCw size={28} className="mx-auto text-blue-500 animate-spin mb-2" />
                  <p className="font-semibold text-sm text-slate-600">Cargando certificaciones de lavado...</p>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-400">
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

                    {/* Columna 5: Acciones (Eliminar registro) */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        type="button"
                        disabled={deletingId === rec.id}
                        onClick={() => handleDeleteRecord(rec)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                        title="Eliminar este registro"
                      >
                        {deletingId === rec.id ? (
                          <RefreshCw size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Modal / Pop-up: Emisión de certificado (Matriz Flota Propia) */}
      {isEmissionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="text-blue-600" size={20} />
                  Emisión de Certificado — Flota Propia
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seleccione un camión de flota propia para generar y descargar su certificado ADQUIM (solo se captura la fecha de emisión).
                </p>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                {/* Correlativo actual */}
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                  <span className="text-slate-500 font-semibold">Próximo N°:</span>
                  {isEditingCorrelativo ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={correlativoInput}
                        onChange={(e) => setCorrelativoInput(e.target.value)}
                        className="w-20 px-1.5 py-0.5 border border-blue-400 rounded text-xs font-mono font-bold text-slate-800 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const saved = setNextCorrelativo(correlativoInput);
                          setCorrelativoNum(saved);
                          setCorrelativoInput(String(saved));
                          setIsEditingCorrelativo(false);
                          toast.success(`Correlativo actualizado a ${formatCorrelativo(saved)}`);
                        }}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                        title="Guardar correlativo"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-blue-700">
                        {formatCorrelativo(correlativoNum)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCorrelativoInput(String(correlativoNum));
                          setIsEditingCorrelativo(true);
                        }}
                        className="text-slate-400 hover:text-blue-600 cursor-pointer"
                        title="Editar número correlativo"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsEmissionModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
                  title="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Barra de Filtros del Modal */}
            <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
              {/* Buscador rápido */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Buscador rápido (N° Interno, Patente, Tipo, Región)..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 h-9 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
                />
              </div>

              {/* Filtro por Tipo de vehículo */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 rounded-xl border border-slate-200 h-9">
                <Truck size={14} className="text-slate-400 shrink-0" />
                <select
                  value={modalVehicleType}
                  onChange={(e) => setModalVehicleType(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="Todos">Tipo de vehículo: Todos</option>
                  {availableVehicleTypes.map((vt) => (
                    <option key={vt} value={vt}>
                      {vt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Ubicación (Región) */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 rounded-xl border border-slate-200 h-9">
                <MapPin size={14} className="text-slate-400 shrink-0" />
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="Todas">Región: Todas</option>
                  {availableRegions.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Estado de Vigencia */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 rounded-xl border border-slate-200 h-9">
                <Filter size={13} className="text-slate-400 shrink-0" />
                <select
                  value={modalStatusFilter}
                  onChange={(e) => setModalStatusFilter(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="Todos">Vigencia: Todos ({ownFleetMatrix.length})</option>
                  <option value="al_dia">Al día (≤ 27 días)</option>
                  <option value="por_vencer">Por vencer (últimos 3 días)</option>
                  <option value="vencida">Vencida (&gt; 30 días)</option>
                  <option value="sin_cert">Sin certificado emitido</option>
                </select>
              </div>
            </div>

            {/* Matriz de Camiones Flota Propia */}
            <div className="flex-1 overflow-auto bg-slate-50">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">N° Interno / Patente</th>
                    <th className="px-4 py-3">Tipo de Vehículo</th>
                    <th className="px-4 py-3">Último Lavado (Telegram)</th>
                    <th className="px-4 py-3">Última Emisión Certificado</th>
                    <th className="px-4 py-3">Vigencia (30 días)</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {filteredModalTrucks.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400">
                        <Truck size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-sm text-slate-600">
                          No se encontraron camiones de flota propia con los filtros seleccionados.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredModalTrucks.map((truck) => {
                      const { status, emissionDmy, daysRemaining, daysElapsed } = truck.certInfo;
                      const isEmitting = emittingTruckId === (truck.id || truck.internal_number);

                      let vigenciaBadge = (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Sin certificado
                        </span>
                      );

                      if (status === 'al_dia') {
                        vigenciaBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            {daysRemaining} días restantes (Día {daysElapsed}/30)
                          </span>
                        );
                      } else if (status === 'por_vencer') {
                        vigenciaBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock size={12} />
                            Por vencer: {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'} (Día {daysElapsed}/30)
                          </span>
                        );
                      } else if (status === 'vencida') {
                        const overdueDays = Math.abs(daysRemaining);
                        vigenciaBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle size={12} />
                            Vencido {overdueDays === 0 ? 'hoy (30 días)' : `hace ${overdueDays} días`}
                          </span>
                        );
                      }

                      return (
                        <tr key={truck.id || truck.internal_number} className="hover:bg-slate-50 transition-colors">
                          {/* N° Interno + Patente */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-slate-900 text-white">
                                <Truck size={12} className="text-blue-400" />
                                {truck.internal_number}
                              </span>
                              {truck.plate && (
                                <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  {truck.plate}
                                </span>
                              )}
                              {truck.region && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {truck.region}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Tipo de vehículo */}
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                            {truck.type || '—'}
                          </td>

                          {/* Último Lavado (Telegram) */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {truck.lastTelegramWash ? (
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-slate-800">
                                  {truck.lastTelegramWashDmy}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {truck.lastTelegramWash.chileTimeOnly} · Telegram
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Sin registro Telegram</span>
                            )}
                          </td>

                          {/* Última Emisión Certificado */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {emissionDmy ? (
                              <span className="font-mono font-bold text-slate-800">{emissionDmy}</span>
                            ) : (
                              <span className="text-slate-400 italic">Sin emisión</span>
                            )}
                          </td>

                          {/* Vigencia (30 días) */}
                          <td className="px-4 py-3 whitespace-nowrap">{vigenciaBadge}</td>

                          {/* Acción: Emitir certificado */}
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <Button
                              type="button"
                              disabled={isEmitting}
                              onClick={() => handleEmitCertificate(truck)}
                              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-2xs"
                            >
                              {isEmitting ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : (
                                <FileText size={13} />
                              )}
                              {isEmitting ? 'Generando...' : 'Emitir certificado'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>
                Mostrando <strong className="text-slate-800">{filteredModalTrucks.length}</strong> de{' '}
                <strong className="text-slate-800">{ownFleetMatrix.length}</strong> camiones de flota propia
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEmissionModalOpen(false)}
                className="text-xs font-bold border-slate-300 text-slate-700"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
