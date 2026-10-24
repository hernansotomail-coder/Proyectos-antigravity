import React, { useEffect, useState, useMemo } from 'react';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { Button } from './ui/Button';
import { 
  Download, ChevronDown, ChevronUp, ArrowUpDown, Truck, 
  Building2, Layers, Search, Filter 
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper para parsear fechas de resolución y documentos en formatos flexibles
export const parseDocDate = (val) => {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null') return null;

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

const ColorBadge = ({ status, text }) => {
  if (status === 'N/A' || !text || text === 'N/A') return <span className="text-slate-400 text-xs font-mono">N/A</span>;
  const colors = {
    red: 'bg-red-100 text-red-700 border-red-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    green: 'bg-green-100 text-green-700 border-green-200'
  };
  return (
    <div className={`px-2 py-1 rounded-md text-[10px] font-bold border font-mono ${colors[status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
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

export default function FleetDashboard() {
  const { fleetList, fetchFleet } = useFleetStore();
  const [typeFilter, setTypeFilter] = useState([]);
  const [regionFilter, setRegionFilter] = useState([]);
  const [frioFilter, setFrioFilter] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [fleetTypeFilter, setFleetTypeFilter] = useState('Todas'); // 'Todas' | 'Flota Propia' | 'Flota Externa'
  
  const [activeCard, setActiveCard] = useState('todos');
  const [colorFilters, setColorFilters] = useState({
    rt: 'Todos', gases: 'Todos', pc: 'Todos', soap: 'Todos', carnes: 'Todos', resolution: 'Todos'
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
  }, [fetchFleet]);

  const frios = useMemo(() => {
    const fSet = new Set(fleetList.map(f => f.type2 || 'N/A'));
    return Array.from(fSet).sort();
  }, [fleetList]);

  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  // Categorización y cálculo documental incluyendo "Resolución" en formato fecha (Requisito 1)
  const categorized = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semiremolques';
      
      const parsedRes = parseDocDate(f.resolution);

      return { 
        ...f, 
        dashboardCategory: category,
        rtStatus: getDocumentStatus(getDaysDiff(f.rt_date)),
        gasesStatus: getDocumentStatus(getDaysDiff(f.gases_date)),
        pcStatus: getDocumentStatus(getDaysDiff(f.pc_date)),
        soapStatus: getDocumentStatus(getDaysDiff(f.soap_date)),
        carnesStatus: getDocumentStatus(getDaysDiff(f.carnes_date)),
        resolutionDate: parsedRes,
        resolutionStatus: getDocumentStatus(getDaysDiff(parsedRes || f.resolution)),
      };
    });
  }, [fleetList]);

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

  // Estadísticas KPI superiores incluyendo "Alerta Resolución" (Requisito 1)
  const stats = useMemo(() => {
    let vehiculos = 0, semiremolques = 0;
    const createAlert = () => ({ count: 0, severity: 'green' });
    let alertRt = createAlert(), 
        alertGases = createAlert(), 
        alertPc = createAlert(), 
        alertSoap = createAlert(), 
        alertCarnes = createAlert(),
        alertResolution = createAlert();

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

      updateWorst(alertRt, f.rtStatus);
      updateWorst(alertGases, f.gasesStatus);
      updateWorst(alertPc, f.pcStatus);
      updateWorst(alertSoap, f.soapStatus);
      updateWorst(alertCarnes, f.carnesStatus);
      updateWorst(alertResolution, f.resolutionStatus);
    });

    return { vehiculos, semiremolques, alertRt, alertGases, alertPc, alertSoap, alertCarnes, alertResolution };
  }, [baseFilteredVehicles]);

  const finalVehicles = useMemo(() => {
    return baseFilteredVehicles.filter(f => {
      if (activeCard === 'vehiculos' && f.dashboardCategory === 'Semiremolques') return false;
      if (activeCard === 'semiremolques' && f.dashboardCategory !== 'Semiremolques') return false;
      if (activeCard === 'rt' && (f.rtStatus === 'green' || f.rtStatus === 'N/A')) return false; 
      if (activeCard === 'gases' && (f.gasesStatus === 'green' || f.gasesStatus === 'N/A')) return false;
      if (activeCard === 'pc' && (f.pcStatus === 'green' || f.pcStatus === 'N/A')) return false;
      if (activeCard === 'soap' && (f.soapStatus === 'green' || f.soapStatus === 'N/A')) return false;
      if (activeCard === 'carnes' && (f.carnesStatus === 'green' || f.carnesStatus === 'N/A')) return false;
      if (activeCard === 'resolution' && (f.resolutionStatus === 'green' || f.resolutionStatus === 'N/A')) return false;

      if (colorFilters.rt !== 'Todos' && f.rtStatus !== colorFilters.rt) return false;
      if (colorFilters.gases !== 'Todos' && f.gasesStatus !== colorFilters.gases) return false;
      if (colorFilters.pc !== 'Todos' && f.pcStatus !== colorFilters.pc) return false;
      if (colorFilters.soap !== 'Todos' && f.soapStatus !== colorFilters.soap) return false;
      if (colorFilters.carnes !== 'Todos' && f.carnesStatus !== colorFilters.carnes) return false;
      if (colorFilters.resolution !== 'Todos' && f.resolutionStatus !== colorFilters.resolution) return false;

      return true;
    });
  }, [baseFilteredVehicles, activeCard, colorFilters]);

  // Lista ordenada de la matriz según columna seleccionada A a la Z (Requisito 2)
  const sortedVehicles = useMemo(() => {
    if (!sortConfig.key) return finalVehicles;

    return [...finalVehicles].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'resolution') {
        valA = a.resolutionDate || a.resolution || '';
        valB = b.resolutionDate || b.resolution || '';
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
      'Resolución': f.resolutionDate || f.resolution || 'N/A'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard Flota");
    XLSX.writeFile(workbook, "Reporte_Dashboard_Flota.xlsx");
  };

  const DynamicCard = ({ id, title, data }) => {
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
        <p className="text-2xl font-black">{data.count}</p>
      </div>
    );
  };

  const HeaderFilter = ({ label, field, sortKey }) => {
    const isSorted = sortConfig.key === sortKey;
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
          <option value="Todos">Todos</option>
          <option value="red">Vencido</option>
          <option value="orange">0 a 15 días</option>
          <option value="yellow">15 a 30 días</option>
          <option value="green">Operativo</option>
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

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">Dashboard Flota</h2>
          <Button onClick={exportToExcel} variant="outline" className="flex items-center gap-2 h-9">
            <Download size={16} /> Exportar Excel
          </Button>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
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

      {/* Tarjetas KPI Superiores incluyendo "Alerta Resolución" (Requisito 1) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-6 shrink-0">
        <div onClick={() => setActiveCard(activeCard === 'vehiculos' ? 'todos' : 'vehiculos')} className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${activeCard === 'vehiculos' ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          <p className={`text-[10px] font-semibold uppercase ${activeCard === 'vehiculos' ? 'text-blue-800' : 'text-slate-500'}`}>Vehículos</p>
          <p className="text-2xl font-black">{stats.vehiculos}</p>
        </div>
        <div onClick={() => setActiveCard(activeCard === 'semiremolques' ? 'todos' : 'semiremolques')} className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${activeCard === 'semiremolques' ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          <p className={`text-[10px] font-semibold uppercase ${activeCard === 'semiremolques' ? 'text-blue-800' : 'text-slate-500'}`}>Semiremolques</p>
          <p className="text-2xl font-black">{stats.semiremolques}</p>
        </div>
        <DynamicCard id="rt" title="Alerta Rev. Téc." data={stats.alertRt} />
        <DynamicCard id="gases" title="Alerta Gases" data={stats.alertGases} />
        <DynamicCard id="pc" title="Alerta PC" data={stats.alertPc} />
        <DynamicCard id="soap" title="Alerta SOAP" data={stats.alertSoap} />
        <DynamicCard id="carnes" title="Alerta Carnes" data={stats.alertCarnes} />
        <DynamicCard id="resolution" title="Alerta Resolución" data={stats.alertResolution} />
      </div>

      {/* Matriz interactiva con ordenamiento A-Z en cada columna (Requisito 2) */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-slate-50">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm border-b border-slate-200">
            <tr>
              <SortableTh colKey="type" label="Tipo" />
              <SortableTh colKey="plate" label="Patente" />
              <SortableTh colKey="internal_number" label="N° Interno" />
              <SortableTh colKey="brand" label="Marca" />
              <SortableTh colKey="type2" label="Sistema de frio" />
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="RT" field="rt" sortKey="rt_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Gases" field="gases" sortKey="gases_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="PC" field="pc" sortKey="pc_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="SOAP" field="soap" sortKey="soap_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Carnes" field="carnes" sortKey="carnes_date" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Resolución" field="resolution" sortKey="resolution" /></th>
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
                <td className="px-3 py-2 text-center"><ColorBadge status={f.rtStatus} text={f.rt_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.gasesStatus} text={f.gases_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.pcStatus} text={f.pc_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.soapStatus} text={f.soap_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.carnesStatus} text={f.carnes_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.resolutionStatus} text={f.resolutionDate || f.resolution || 'N/A'} /></td>
              </tr>
            ))}
            {sortedVehicles.length === 0 && (
              <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">No se encontraron vehículos para estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
