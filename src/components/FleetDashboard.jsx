import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  useFleetStore, isVehicleExternal, isVehicleBaja, 
  isVehicleEnTaller, getVehicleTallerDays, getVehicleTallerStatus 
} from '../store/fleetStore';
import { getCertExpirationInfo } from './WashDashboard';
import { Button } from './ui/Button';
import { 
  Download, ChevronDown, ChevronUp, ArrowUpDown, Truck, 
  Building2, Layers, Search, Filter, Zap, Wrench, RefreshCw, Check, X
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper para parsear fechas de resolución y documentos en formatos flexibles
export const parseDocDate = (val) => {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null') return null;

  // Soporte para fechas seriales numéricas de Excel (ej: 47900, 48514)
  const num = Number(str);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const dObj = new Date(Math.round((num - 25569) * 86400 * 1000));
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Formato YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
  }

  // Formato DD-MM-YYYY o DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
  }

  // Fecha embebida en texto
  const innerIso = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (innerIso) {
    return `${innerIso[1]}-${String(innerIso[2]).padStart(2, '0')}-${String(innerIso[3]).padStart(2, '0')}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
};

const getDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const cleanDate = parseDocDate(dateStr) || dateStr;
  const targetDate = new Date(cleanDate);
  if (isNaN(targetDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDocumentStatus = (days) => {
  if (days === null) return 'N/A';
  if (days < 0) return 'red'; // Vencido
  if (days <= 15) return 'orange'; // 0 a 15 dias
  if (days <= 30) return 'yellow'; // 16 a 30 dias
  return 'green'; // > 30 dias
};

// Semáforo de Certificación (viene desde Lavados - Requisito 2):
// - Igual o mayor a la fecha de vencimiento (diffDays <= 0): Rojo (vencido)
// - Cuando falten 1 a 3 días para vencer (diffDays <= 3): Amarillo
// - Fuera de estos dos rangos (diffDays >= 4): Verde
const getCertificacionSemaphore = (diffDays) => {
  if (diffDays === null || diffDays === undefined) return 'N/A';
  if (diffDays <= 0) return 'red';
  if (diffDays <= 3) return 'yellow';
  return 'green';
};

const ColorBadge = ({ status, text, title }) => {
  if (status === 'N/A' || !text || text === 'N/A') return <span className="text-slate-400 text-xs font-mono">N/A</span>;
  const colors = {
    red: 'bg-red-100 text-red-700 border-red-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    green: 'bg-green-100 text-green-700 border-green-200'
  };
  return (
    <div
      title={title}
      className={`px-2 py-1 rounded-md text-[10px] font-bold border font-mono inline-block ${colors[status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}
    >
      {text}
    </div>
  );
};

const MultiSelectDropdown = ({ options, selectedValues, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex-1 min-w-[150px]">
      <div onClick={() => setIsOpen(!isOpen)} className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 cursor-pointer">
        <span className="truncate">{selectedValues.length === 0 ? placeholder : `${selectedValues.length} seleccionados`}</span>
        <ChevronDown size={16} />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selectedValues.includes(opt)} onChange={(e) => {
                if (e.target.checked) onChange([...selectedValues, opt]);
                else onChange(selectedValues.filter(v => v !== opt));
              }} className="rounded text-blue-600 focus:ring-blue-500"/>
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default function FleetDashboard({ isSpidOnly: propIsSpidOnly }) {
  const location = useLocation();
  const isSpidOnly = Boolean(propIsSpidOnly || location.pathname === '/fleet-spid');
  const { fleetList, fetchFleet, updateVehicleTallerInfo, isLoading } = useFleetStore();
  const [typeFilter, setTypeFilter] = useState([]);
  const [regionFilter, setRegionFilter] = useState([]);
  const [frioFilter, setFrioFilter] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [fleetTypeFilter, setFleetTypeFilter] = useState('Todas'); // 'Todas' | 'Flota Propia' | 'Flota Externa'
  const [editingTallerId, setEditingTallerId] = useState(null);
  const [tallerDaysInput, setTallerDaysInput] = useState(0);
  
  const [activeCard, setActiveCard] = useState('todos');
  const [colorFilters, setColorFilters] = useState({
    taller: 'Todos', rt: 'Todos', gases: 'Todos', pc: 'Todos', soap: 'Todos', carnes: 'Todos', resolution: 'Todos', certificacion: 'Todos'
  });

  // Estado de Ordenamiento A-Z por columna (Requisito 2)
  const [sortConfig, setSortConfig] = useState({ key: 'plate', direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  useEffect(() => {
    fetchFleet();
    // Refrescar automáticamente al volver a enfocar la ventana/pestaña para mantener sincronización entre computadores
    const onFocus = () => {
      fetchFleet();
    };
    const onVisibility = () => {
      if (!document.hidden) fetchFleet();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchFleet]);

  // Flota activa: Excluir camiones dados de baja (Requisito 1) y filtrar por SPID si corresponde (Requisito 2)
  const activeFleet = useMemo(() => {
    return fleetList
      .filter(f => !isVehicleBaja(f))
      .filter(f => !isSpidOnly || String(f.operation || '').toUpperCase().includes('SPID'));
  }, [fleetList, isSpidOnly]);

  const frios = useMemo(() => {
    const fSet = new Set(activeFleet.map(f => f.type2 || 'N/A'));
    return Array.from(fSet).sort();
  }, [activeFleet]);

  const regions = useMemo(() => {
    const rSet = new Set(activeFleet.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [activeFleet]);

  // Categorización, cálculo documental, taller y certificación de lavados
  const categorized = useMemo(() => {
    return activeFleet.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semiremolques';
      
      const parsedRes = parseDocDate(f.resolution);
      const enTaller = isVehicleEnTaller(f);
      const tDays = enTaller ? (getVehicleTallerDays(f) ?? 0) : null;
      const tStatus = enTaller ? getVehicleTallerStatus(tDays) : 'N/A';

      // Fecha de Certificación que viene desde "Lavados" (vigencia 1 mes)
      const certInfo = getCertExpirationInfo(f.ultima_certificacion);
      const certStatus = getCertificacionSemaphore(certInfo.diffDays);
      const parsedCertSort = parseDocDate(f.ultima_certificacion);

      return { 
        ...f, 
        dashboardCategory: category,
        isEnTaller: enTaller,
        tallerDays: tDays,
        tallerStatus: tStatus,
        rtStatus: getDocumentStatus(getDaysDiff(f.rt_date)),
        gasesStatus: getDocumentStatus(getDaysDiff(f.gases_date)),
        pcStatus: getDocumentStatus(getDaysDiff(f.pc_date)),
        soapStatus: getDocumentStatus(getDaysDiff(f.soap_date)),
        carnesStatus: getDocumentStatus(getDaysDiff(f.carnes_date)),
        resolutionDate: parsedRes,
        resolutionStatus: getDocumentStatus(getDaysDiff(parsedRes || f.resolution)),
        certDateDisplay: f.ultima_certificacion || null,
        certDateSort: parsedCertSort || f.ultima_certificacion || '',
        certExpDate: certInfo.expirationDateFormatted,
        certDays: certInfo.diffDays,
        certificacionStatus: certStatus,
      };
    });
  }, [activeFleet]);

  const baseFilteredVehicles = useMemo(() => {
    return categorized.filter(f => {
      // Filtro Tipo de Flota (Propia vs Externa)
      const isExt = isVehicleExternal(f);
      if (fleetTypeFilter === 'Flota Propia' && isExt) return false;
      if (fleetTypeFilter === 'Flota Externa' && !isExt) return false;

      if (typeFilter.length > 0 && !typeFilter.includes(f.dashboardCategory)) return false;
      if (regionFilter.length > 0 && !regionFilter.includes(f.region)) return false;
      if (frioFilter.length > 0 && !frioFilter.includes(f.type2 || 'N/A')) return false;
      if (searchFilter) {
        const lowerSearch = searchFilter.toLowerCase();
        const matchesPlate = f.plate?.toLowerCase().includes(lowerSearch);
        const matchesInternal = f.internal_number?.toLowerCase().includes(lowerSearch);
        if (!matchesPlate && !matchesInternal) return false;
      }
      return true;
    });
  }, [categorized, fleetTypeFilter, typeFilter, regionFilter, searchFilter, frioFilter]);

  // Estadísticas KPI superiores incluyendo "En Taller" (Requisito 1) y "Alerta Certificación" en SPID (Requisito 2)
  const stats = useMemo(() => {
    let vehiculos = 0, semiremolques = 0;
    const createAlert = () => ({ count: 0, severity: 'green' });
    let alertTaller = { count: 0, severity: 'green', greenCount: 0, yellowCount: 0, redCount: 0 },
        alertRt = createAlert(), 
        alertGases = createAlert(), 
        alertPc = createAlert(), 
        alertSoap = createAlert(), 
        alertCarnes = createAlert(),
        alertResolution = createAlert(),
        alertCertificacion = createAlert();

    const updateWorst = (alertObj, status) => {
      if (status === 'N/A' || status === 'green') return;
      alertObj.count++;
      if (status === 'red') alertObj.severity = 'red';
      else if (status === 'orange' && alertObj.severity !== 'red') alertObj.severity = 'orange';
      else if (status === 'yellow' && alertObj.severity !== 'red' && alertObj.severity !== 'orange') alertObj.severity = 'yellow';
    };

    baseFilteredVehicles.forEach(f => {
      if (f.dashboardCategory === 'Semiremolques') semiremolques++;
      else vehiculos++;

      // Contabilizar todo lo que diga "En Taller" en Gestión Flota columna "Estado"
      if (f.isEnTaller) {
        alertTaller.count++;
        if (f.tallerStatus === 'red') {
          alertTaller.redCount++;
        } else if (f.tallerStatus === 'yellow') {
          alertTaller.yellowCount++;
        } else {
          alertTaller.greenCount++;
        }
      }

      updateWorst(alertRt, f.rtStatus);
      updateWorst(alertGases, f.gasesStatus);
      updateWorst(alertPc, f.pcStatus);
      updateWorst(alertSoap, f.soapStatus);
      updateWorst(alertCarnes, f.carnesStatus);
      updateWorst(alertResolution, f.resolutionStatus);
      updateWorst(alertCertificacion, f.certificacionStatus);
    });

    // Semáforo de la tarjeta "En Taller" en función de la CANTIDAD de camiones en taller:
    // 0 a 4 camiones: Verde ('green')
    // 5 a 11 camiones: Amarillo ('yellow')
    // >= 12 camiones: Rojo ('red')
    if (alertTaller.count >= 12) {
      alertTaller.severity = 'red';
    } else if (alertTaller.count >= 5) {
      alertTaller.severity = 'yellow';
    } else {
      alertTaller.severity = 'green';
    }

    return { vehiculos, semiremolques, alertTaller, alertRt, alertGases, alertPc, alertSoap, alertCarnes, alertResolution, alertCertificacion };
  }, [baseFilteredVehicles]);

  const finalVehicles = useMemo(() => {
    return baseFilteredVehicles.filter(f => {
      if (activeCard === 'vehiculos' && f.dashboardCategory === 'Semiremolques') return false;
      if (activeCard === 'semiremolques' && f.dashboardCategory !== 'Semiremolques') return false;
      if (activeCard === 'taller' && !f.isEnTaller) return false;
      if (activeCard === 'rt' && (f.rtStatus === 'green' || f.rtStatus === 'N/A')) return false; 
      if (activeCard === 'gases' && (f.gasesStatus === 'green' || f.gasesStatus === 'N/A')) return false;
      if (activeCard === 'pc' && (f.pcStatus === 'green' || f.pcStatus === 'N/A')) return false;
      if (activeCard === 'soap' && (f.soapStatus === 'green' || f.soapStatus === 'N/A')) return false;
      if (activeCard === 'carnes' && (f.carnesStatus === 'green' || f.carnesStatus === 'N/A')) return false;
      if (activeCard === 'resolution' && (f.resolutionStatus === 'green' || f.resolutionStatus === 'N/A')) return false;
      if (activeCard === 'certificacion' && (f.certificacionStatus === 'green' || f.certificacionStatus === 'N/A')) return false;

      if (colorFilters.taller !== 'Todos') {
        if (colorFilters.taller === 'activo' && f.isEnTaller) return false;
        if (colorFilters.taller === 'taller_all' && !f.isEnTaller) return false;
        if (['green', 'yellow', 'red'].includes(colorFilters.taller) && f.tallerStatus !== colorFilters.taller) return false;
      }
      if (colorFilters.rt !== 'Todos' && f.rtStatus !== colorFilters.rt) return false;
      if (colorFilters.gases !== 'Todos' && f.gasesStatus !== colorFilters.gases) return false;
      if (colorFilters.pc !== 'Todos' && f.pcStatus !== colorFilters.pc) return false;
      if (colorFilters.soap !== 'Todos' && f.soapStatus !== colorFilters.soap) return false;
      if (colorFilters.carnes !== 'Todos' && f.carnesStatus !== colorFilters.carnes) return false;
      if (colorFilters.resolution !== 'Todos' && f.resolutionStatus !== colorFilters.resolution) return false;
      if (isSpidOnly && colorFilters.certificacion !== 'Todos' && f.certificacionStatus !== colorFilters.certificacion) return false;

      return true;
    });
  }, [baseFilteredVehicles, activeCard, colorFilters, isSpidOnly]);

  // Lista ordenada de la matriz según columna seleccionada A a la Z (Requisito 2)
  const sortedVehicles = useMemo(() => {
    if (!sortConfig.key) return finalVehicles;

    return [...finalVehicles].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'resolution') {
        valA = a.resolutionDate || a.resolution || '';
        valB = b.resolutionDate || b.resolution || '';
      } else if (sortConfig.key === 'ultima_certificacion') {
        valA = a.certDateSort || '';
        valB = b.certDateSort || '';
      } else if (sortConfig.key === 'status') {
        valA = a.isEnTaller ? `1_${String(a.tallerDays ?? 0).padStart(4, '0')}` : `2_${a.status || ''}`;
        valB = b.isEnTaller ? `1_${String(b.tallerDays ?? 0).padStart(4, '0')}` : `2_${b.status || ''}`;
      }

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      const factor = sortConfig.direction === 'asc' ? 1 : -1;
      return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [finalVehicles, sortConfig]);

  const exportToExcel = () => {
    const dataToExport = sortedVehicles.map(f => ({
      'Tipo de Flota': isVehicleExternal(f) ? 'Externa' : 'Propia',
      'Empresa Externa': f.empresa_externa || '',
      'Operación': f.operation || '',
      'Estado': f.status || 'Activo',
      'Días en Taller': f.isEnTaller ? (f.tallerDays ?? 0) : 'N/A',
      'Tipo': f.type || 'N/A', 
      'Patente': f.plate, 
      'N° Interno': f.internal_number || 'N/A',
      'Marca': f.brand || 'N/A', 
      'Sistema de frio': f.type2 || 'N/A', 
      'Modelo': f.model || 'N/A', 
      'Año': f.year || 'N/A',
      'Región': f.region || 'N/A', 
      'RT': f.rt_date || 'N/A', 
      'Gases': f.gases_date || 'N/A',
      'PC': f.pc_date || 'N/A', 
      'SOAP': f.soap_date || 'N/A', 
      'Carnes': f.carnes_date || 'N/A',
      'Resolución': f.resolutionDate || f.resolution || 'N/A',
      ...(isSpidOnly ? {
        'Certificación': f.certDateDisplay || 'N/A',
        'Vencimiento Certificación (+1 mes)': f.certExpDate || 'N/A'
      } : {})
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    const sheetTitle = isSpidOnly ? "Flota SPID" : "Dashboard Flota";
    const fileName = isSpidOnly ? "Reporte_Flota_SPID.xlsx" : "Reporte_Dashboard_Flota.xlsx";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);
    XLSX.writeFile(workbook, fileName);
  };

  const DynamicCard = ({ id, title, data, subtitle }) => {
    const isActive = activeCard === id;
    let bgColors = 'bg-slate-50 border-slate-200 text-slate-800';
    let textColors = 'text-slate-500';
    let activeRing = 'ring-2 ring-slate-300';
    
    if (data.severity === 'red') {
      bgColors = isActive ? 'bg-red-100 border-red-500 text-red-900' : 'bg-red-50 border-red-200 text-red-800';
      textColors = isActive ? 'text-red-800' : 'text-red-600';
      activeRing = 'ring-2 ring-red-300';
    } else if (data.severity === 'orange') {
      bgColors = isActive ? 'bg-orange-100 border-orange-500 text-orange-900' : 'bg-orange-50 border-orange-200 text-orange-800';
      textColors = isActive ? 'text-orange-800' : 'text-orange-600';
      activeRing = 'ring-2 ring-orange-300';
    } else if (data.severity === 'yellow') {
      bgColors = isActive ? 'bg-yellow-100 border-yellow-500 text-yellow-900' : 'bg-yellow-50 border-yellow-200 text-yellow-800';
      textColors = isActive ? 'text-yellow-800' : 'text-yellow-600';
      activeRing = 'ring-2 ring-yellow-300';
    } else {
      bgColors = isActive ? 'bg-green-100 border-green-500 text-green-900' : 'bg-green-50 border-green-200 text-green-800';
      textColors = isActive ? 'text-green-800' : 'text-green-600';
      activeRing = 'ring-2 ring-green-300';
    }

    return (
      <div 
        onClick={() => setActiveCard(isActive ? 'todos' : id)}
        className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${bgColors} ${isActive ? activeRing : ''}`}
      >
        <p className={`text-[10px] font-semibold uppercase ${textColors}`}>{title}</p>
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-2xl font-black">{data.count}</p>
          {subtitle && <span className={`text-[9px] font-bold truncate ${textColors}`}>{subtitle}</span>}
        </div>
      </div>
    );
  };

  const HeaderFilter = ({ label, field, sortKey, options }) => {
    const isSorted = sortConfig.key === sortKey;
    const selectOptions = options || [
      { value: 'Todos', label: 'Todos' },
      { value: 'red', label: 'Vencido' },
      { value: 'orange', label: '0 a 15 días' },
      { value: 'yellow', label: '15 a 30 días' },
      { value: 'green', label: 'Operativo' }
    ];
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-bold text-[10px]"
          title="Ordenar de la A a la Z / Z a la A"
        >
          <span>{label}</span>
          {isSorted ? (
            sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-blue-600 shrink-0" /> : <ChevronDown size={12} className="text-blue-600 shrink-0" />
          ) : (
            <ArrowUpDown size={11} className="text-slate-400 shrink-0 opacity-60" />
          )}
        </button>
        <select 
          className="text-[10px] font-normal border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600 w-full"
          value={colorFilters[field]}
          onChange={(e) => setColorFilters({...colorFilters, [field]: e.target.value})}
        >
          {selectOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  };

  const SortableTh = ({ colKey, label, className = '' }) => {
    const isSorted = sortConfig.key === colKey;
    return (
      <th 
        className={`px-3 py-2 font-semibold border-b cursor-pointer select-none hover:bg-slate-200/70 transition-colors ${className}`}
        onClick={() => handleSort(colKey)}
        title="Ordenar de la A a la Z / Z a la A"
      >
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortConfig.direction === 'asc' ? (
              <ChevronUp size={13} className="text-blue-600 shrink-0" />
            ) : (
              <ChevronDown size={13} className="text-blue-600 shrink-0" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-400 shrink-0 opacity-60" />
          )}
        </div>
      </th>
    );
  };

  const totalColCount = isSpidOnly ? 13 : 12;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isSpidOnly && (
              <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                <Zap size={20} className="fill-amber-500 text-amber-600" />
              </div>
            )}
            <h2 className="text-xl font-bold text-slate-800">
              {isSpidOnly ? 'Dashboard Flota SPID' : 'Dashboard Flota'}
            </h2>
            {isSpidOnly && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wide">
                Operación SPID
              </span>
            )}
          </div>
          <Button onClick={exportToExcel} variant="outline" className="flex items-center gap-2 h-9">
            <Download size={16} /> Exportar Excel
          </Button>
          <Button
            onClick={() => fetchFleet()}
            variant="outline"
            className="flex items-center gap-1.5 h-9 text-xs"
            title="Sincronizar datos de flota con la nube"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-600' : ''} />
            Sincronizar
          </Button>
        </div>
        <div className="flex gap-3 w-full md:w-auto flex-wrap">
          <input 
            type="text" placeholder="Buscar patente o N°..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
            className="flex h-10 w-full md:w-48 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
          />
          <MultiSelectDropdown 
            options={['Camiones/Camionetas', 'Tractos', 'Semiremolques']} 
            selectedValues={typeFilter} 
            onChange={setTypeFilter} 
            placeholder="Tipo de camión" 
          />
          <MultiSelectDropdown 
            options={regions.filter(r => r !== 'Todas')} 
            selectedValues={regionFilter} 
            onChange={setRegionFilter} 
            placeholder="Ubicación de camión" 
          />
          <MultiSelectDropdown 
            options={frios} 
            selectedValues={frioFilter} 
            onChange={setFrioFilter} 
            placeholder="Sistema de frio" 
          />
          <div className="relative min-w-[140px]">
            <select
              value={fleetTypeFilter}
              onChange={(e) => setFleetTypeFilter(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs cursor-pointer"
            >
              <option value="Todas">Toda la Flota</option>
              <option value="Flota Propia">Flota Propia</option>
              <option value="Flota Externa">Flota Externa</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tarjetas KPI Superiores incluyendo "En Taller" (Requisito 1) y "Alerta Certificación" en SPID (Requisito 2) */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${isSpidOnly ? 'lg:grid-cols-10' : 'lg:grid-cols-9'} gap-2.5 mb-6 shrink-0`}>
        <div onClick={() => setActiveCard(activeCard === 'vehiculos' ? 'todos' : 'vehiculos')} className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${activeCard === 'vehiculos' ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          <p className={`text-[10px] font-semibold uppercase ${activeCard === 'vehiculos' ? 'text-blue-800' : 'text-slate-500'}`}>Vehículos</p>
          <p className="text-2xl font-black">{stats.vehiculos}</p>
        </div>
        <div onClick={() => setActiveCard(activeCard === 'semiremolques' ? 'todos' : 'semiremolques')} className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${activeCard === 'semiremolques' ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          <p className={`text-[10px] font-semibold uppercase ${activeCard === 'semiremolques' ? 'text-blue-800' : 'text-slate-500'}`}>Semiremolques</p>
          <p className="text-2xl font-black">{stats.semiremolques}</p>
        </div>
        <DynamicCard
          id="taller"
          title="En Taller"
          data={stats.alertTaller}
          subtitle={
            stats.alertTaller.severity === 'red' ? '≥ 12 camiones' :
            stats.alertTaller.severity === 'yellow' ? '5 a 11 camiones' :
            '0 a 4 camiones'
          }
        />
        <DynamicCard id="rt" title="Alerta Rev. Téc." data={stats.alertRt} />
        <DynamicCard id="gases" title="Alerta Gases" data={stats.alertGases} />
        <DynamicCard id="pc" title="Alerta PC" data={stats.alertPc} />
        <DynamicCard id="soap" title="Alerta SOAP" data={stats.alertSoap} />
        <DynamicCard id="carnes" title="Alerta Carnes" data={stats.alertCarnes} />
        <DynamicCard id="resolution" title="Alerta Resolución" data={stats.alertResolution} />
        {isSpidOnly && (
          <DynamicCard id="certificacion" title="Alerta Certif." data={stats.alertCertificacion} />
        )}
      </div>

      {/* Matriz interactiva con ordenamiento A-Z en cada columna */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-slate-50">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
              <SortableTh colKey="type" label="Tipo" />
              <SortableTh colKey="plate" label="Patente" />
              <SortableTh colKey="internal_number" label="N° Interno" />
              <SortableTh colKey="brand" label="Marca" />
              <SortableTh colKey="type2" label="Sistema de frio" />
              <th className="px-2 py-1 font-semibold border-b text-center">
                <HeaderFilter
                  label="Estado / Taller"
                  field="taller"
                  sortKey="status"
                  options={[
                    { value: 'Todos', label: 'Todos' },
                    { value: 'taller_all', label: 'En Taller (Todos)' },
                    { value: 'green', label: 'Taller: 0 a 4 días (Verde)' },
                    { value: 'yellow', label: 'Taller: 5 a 11 días (Amarillo)' },
                    { value: 'red', label: 'Taller: ≥ 12 días (Rojo)' },
                    { value: 'activo', label: 'Operativos / Activos' }
                  ]}
                />
              </th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="RT" field="rt" sortKey="rt_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Gases" field="gases" sortKey="gases_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="PC" field="pc" sortKey="pc_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="SOAP" field="soap" sortKey="soap_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Carnes" field="carnes" sortKey="carnes_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Resolución" field="resolution" sortKey="resolution" /></th>
              {isSpidOnly && (
                <th className="px-2 py-1 font-semibold border-b text-center">
                  <HeaderFilter
                    label="Certificación"
                    field="certificacion"
                    sortKey="ultima_certificacion"
                    options={[
                      { value: 'Todos', label: 'Todos' },
                      { value: 'red', label: 'Vencido (≤ 0 días)' },
                      { value: 'yellow', label: 'Por vencer (1 a 3 días)' },
                      { value: 'green', label: 'Vigente (≥ 4 días)' }
                    ]}
                  />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedVehicles.map(f => (
              <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 text-slate-600">{f.type || 'N/A'}</td>
                <td className="px-3 py-2 font-bold font-mono text-slate-800">{f.plate}</td>
                <td className="px-3 py-2 text-slate-600 font-mono font-bold">{f.internal_number || 'N/A'}</td>
                <td className="px-3 py-2 text-slate-600">{f.brand || 'N/A'}</td>
                <td className="px-3 py-2 text-slate-600">{f.type2 || 'N/A'}</td>
                <td className="px-3 py-2 text-center">
                  {f.isEnTaller ? (
                    <div className="inline-flex items-center justify-center gap-1">
                      <ColorBadge
                        status="yellow"
                        text="En Taller"
                        title={`En Taller (${f.tallerDays ?? 0} días)`}
                      />
                      {editingTallerId === f.id ? (
                        <div className="inline-flex items-center gap-0.5 bg-white border border-slate-300 rounded px-1 py-0.5 shadow-xs">
                          <input
                            type="number"
                            min="0"
                            value={tallerDaysInput}
                            onChange={(e) => setTallerDaysInput(e.target.value)}
                            className="w-10 text-[10px] font-bold text-center outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await updateVehicleTallerInfo(f.id, { dias_taller: tallerDaysInput });
                              setEditingTallerId(null);
                            }}
                            className="text-green-600 hover:bg-green-50 p-0.5 rounded"
                            title="Guardar días en taller"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTallerId(null)}
                            className="text-slate-400 hover:bg-slate-100 p-0.5 rounded"
                            title="Cancelar"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTallerId(f.id);
                            setTallerDaysInput(f.tallerDays ?? 0);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black border cursor-pointer hover:opacity-80 ${
                            f.tallerStatus === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                            f.tallerStatus === 'yellow' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                            'bg-green-100 text-green-700 border-green-200'
                          }`}
                          title="Clic para indicar/ajustar días en taller (0-4d: Verde, 5-11d: Amarillo, ≥12d: Rojo)"
                        >
                          {f.tallerDays ?? 0}d
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {f.status || 'Activo'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.rtStatus} text={f.rt_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.gasesStatus} text={f.gases_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.pcStatus} text={f.pc_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.soapStatus} text={f.soap_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.carnesStatus} text={f.carnes_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.resolutionStatus} text={f.resolutionDate || f.resolution || 'N/A'} /></td>
                {isSpidOnly && (
                  <td className="px-3 py-2 text-center">
                    <ColorBadge
                      status={f.certificacionStatus}
                      text={f.certDateDisplay || 'N/A'}
                      title={
                        f.certDateDisplay
                          ? `Certificación Lavados: ${f.certDateDisplay} | Vence (+1 mes): ${f.certExpDate} (${f.certDays <= 0 ? 'Vencida' : `Faltan ${f.certDays} día(s)`})`
                          : 'Sin fecha de certificación registrada en Lavados'
                      }
                    />
                  </td>
                )}
              </tr>
            ))}
            {sortedVehicles.length === 0 && (
              <tr><td colSpan={totalColCount} className="px-4 py-8 text-center text-slate-500">No se encontraron vehículos para estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
