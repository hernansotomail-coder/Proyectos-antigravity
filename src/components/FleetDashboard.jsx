import React, { useEffect, useState, useMemo } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const getDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const targetDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getStatus14_30 = (days) => {
  if (days === null) return 'N/A';
  if (days <= 14) return 'red';
  if (days <= 30) return 'yellow';
  return 'green';
};

const getStatus30_40 = (days) => {
  if (days === null) return 'N/A';
  if (days <= 30) return 'red';
  if (days <= 40) return 'yellow';
  return 'green';
};

const ColorBadge = ({ status, text }) => {
  if (status === 'N/A') return <span className="text-slate-400 text-xs">N/A</span>;
  const colors = {
    red: 'bg-red-100 text-red-700 border-red-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    green: 'bg-green-100 text-green-700 border-green-200'
  };
  return (
    <div className={`px-2 py-1 rounded-md text-xs font-bold border ${colors[status]}`}>
      {text}
    </div>
  );
};

export default function FleetDashboard() {
  const { fleetList, fetchFleet } = useFleetStore();
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [searchFilter, setSearchFilter] = useState('');
  
  const [activeCard, setActiveCard] = useState('todos');
  const [colorFilters, setColorFilters] = useState({
    rt: 'Todos', gases: 'Todos', pc: 'Todos', soap: 'Todos', carnes: 'Todos'
  });

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  const categorized = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semiremolques';
      
      return { 
        ...f, 
        dashboardCategory: category,
        rtStatus: getStatus14_30(getDaysDiff(f.rt_date)),
        gasesStatus: getStatus14_30(getDaysDiff(f.gases_date)),
        pcStatus: getStatus14_30(getDaysDiff(f.pc_date)),
        soapStatus: getStatus30_40(getDaysDiff(f.soap_date)),
        carnesStatus: getStatus30_40(getDaysDiff(f.carnes_date)),
      };
    });
  }, [fleetList]);

  // Base list respects only the main dropdowns & search
  const baseFilteredVehicles = useMemo(() => {
    return categorized.filter(f => {
      if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;
      if (searchFilter) {
        const lowerSearch = searchFilter.toLowerCase();
        const matchesPlate = f.plate?.toLowerCase().includes(lowerSearch);
        const matchesInternal = f.internal_number?.toLowerCase().includes(lowerSearch);
        if (!matchesPlate && !matchesInternal) return false;
      }
      return true;
    });
  }, [categorized, typeFilter, regionFilter, searchFilter]);

  // Stats calculate OVER the base filtered list, so cards react to Region/Type dropdowns
  const stats = useMemo(() => {
    let vehiculos = 0, semiremolques = 0;
    let alertRt = 0, alertGases = 0, alertPc = 0, alertSoap = 0, alertCarnes = 0;

    baseFilteredVehicles.forEach(f => {
      if (f.dashboardCategory === 'Semiremolques') semiremolques++;
      else vehiculos++;

      if (f.rtStatus === 'red') alertRt++;
      if (f.gasesStatus === 'red') alertGases++;
      if (f.pcStatus === 'red') alertPc++;
      if (f.soapStatus === 'red') alertSoap++;
      if (f.carnesStatus === 'red') alertCarnes++;
    });

    return { vehiculos, semiremolques, alertRt, alertGases, alertPc, alertSoap, alertCarnes };
  }, [baseFilteredVehicles]);

  // Final list applied to matrix: includes Active Card filter AND Header Color filters
  const finalVehicles = useMemo(() => {
    return baseFilteredVehicles.filter(f => {
      // Card Filter
      if (activeCard === 'vehiculos' && f.dashboardCategory === 'Semiremolques') return false;
      if (activeCard === 'semiremolques' && f.dashboardCategory !== 'Semiremolques') return false;
      if (activeCard === 'rt' && f.rtStatus !== 'red') return false;
      if (activeCard === 'gases' && f.gasesStatus !== 'red') return false;
      if (activeCard === 'pc' && f.pcStatus !== 'red') return false;
      if (activeCard === 'soap' && f.soapStatus !== 'red') return false;
      if (activeCard === 'carnes' && f.carnesStatus !== 'red') return false;

      // Header Color Filters
      if (colorFilters.rt !== 'Todos' && f.rtStatus !== colorFilters.rt) return false;
      if (colorFilters.gases !== 'Todos' && f.gasesStatus !== colorFilters.gases) return false;
      if (colorFilters.pc !== 'Todos' && f.pcStatus !== colorFilters.pc) return false;
      if (colorFilters.soap !== 'Todos' && f.soapStatus !== colorFilters.soap) return false;
      if (colorFilters.carnes !== 'Todos' && f.carnesStatus !== colorFilters.carnes) return false;

      return true;
    });
  }, [baseFilteredVehicles, activeCard, colorFilters]);

  const exportToExcel = () => {
    const dataToExport = finalVehicles.map(f => ({
      'Tipo': f.type || 'N/A', 'Patente': f.plate, 'N° Interno': f.internal_number || 'N/A',
      'Marca': f.brand || 'N/A', 'Modelo': f.model || 'N/A', 'Año': f.year || 'N/A',
      'Región': f.region || 'N/A', 'RT': f.rt_date || 'N/A', 'Gases': f.gases_date || 'N/A',
      'PC': f.pc_date || 'N/A', 'SOAP': f.soap_date || 'N/A', 'Carnes': f.carnes_date || 'N/A',
      'Resolución': f.resolution || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard Flota");
    XLSX.writeFile(workbook, "Reporte_Dashboard_Flota.xlsx");
  };

  const Card = ({ id, title, value, isAlert }) => (
    <div 
      onClick={() => setActiveCard(activeCard === id ? 'todos' : id)}
      className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition-all transform hover:scale-105 ${
        activeCard === id 
          ? (isAlert ? 'bg-red-100 border-red-500 ring-2 ring-red-300' : 'bg-blue-100 border-blue-500 ring-2 ring-blue-300')
          : (isAlert ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200')
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase ${isAlert ? (activeCard === id ? 'text-red-800' : 'text-red-600') : (activeCard === id ? 'text-blue-800' : 'text-slate-500')}`}>
        {title}
      </p>
      <p className={`text-2xl font-black ${isAlert ? (activeCard === id ? 'text-red-900' : 'text-red-700') : (activeCard === id ? 'text-blue-900' : 'text-slate-800')}`}>
        {value}
      </p>
    </div>
  );

  const HeaderFilter = ({ label, field }) => (
    <div className="flex flex-col items-center gap-1">
      <span>{label}</span>
      <select 
        className="text-[10px] font-normal border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600 w-full"
        value={colorFilters[field]}
        onChange={(e) => setColorFilters({...colorFilters, [field]: e.target.value})}
      >
        <option value="Todos">Todos</option>
        <option value="red">Vencido</option>
        <option value="yellow">Por vencer</option>
        <option value="green">Operativo</option>
      </select>
    </div>
  );

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
          <Select 
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            options={[{ value: 'Todos', label: 'Todos los Tipos' }, { value: 'Camiones/Camionetas', label: 'Camiones/Camionetas' }, { value: 'Tractos', label: 'Tractos' }, { value: 'Semiremolques', label: 'Semiremolques' }]}
          />
          <Select 
            value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            options={regions.map(r => ({ value: r, label: r }))}
          />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6 shrink-0">
        <Card id="vehiculos" title="Vehículos (Cam/Trac)" value={stats.vehiculos} isAlert={false} />
        <Card id="semiremolques" title="Semiremolques" value={stats.semiremolques} isAlert={false} />
        <Card id="rt" title="Alerta Rev. Téc." value={stats.alertRt} isAlert={true} />
        <Card id="gases" title="Alerta Gases" value={stats.alertGases} isAlert={true} />
        <Card id="pc" title="Alerta PC" value={stats.alertPc} isAlert={true} />
        <Card id="soap" title="Alerta SOAP" value={stats.alertSoap} isAlert={true} />
        <Card id="carnes" title="Alerta Carnes" value={stats.alertCarnes} isAlert={true} />
      </div>

      {/* Matrix */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-slate-50">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2 font-semibold border-b">Tipo</th>
              <th className="px-3 py-2 font-semibold border-b">Patente</th>
              <th className="px-3 py-2 font-semibold border-b">N° Interno</th>
              <th className="px-3 py-2 font-semibold border-b">Marca</th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="RT" field="rt" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Gases" field="gases" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="PC" field="pc" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="SOAP" field="soap" /></th>
              <th className="px-2 py-1 font-semibold border-b text-center"><HeaderFilter label="Carnes" field="carnes" /></th>
              <th className="px-3 py-2 font-semibold border-b">Resolución</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {finalVehicles.map(f => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-600">{f.type || 'N/A'}</td>
                <td className="px-3 py-2 font-bold text-slate-800">{f.plate}</td>
                <td className="px-3 py-2 text-slate-600">{f.internal_number || 'N/A'}</td>
                <td className="px-3 py-2 text-slate-600">{f.brand || 'N/A'}</td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.rtStatus} text={f.rt_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.gasesStatus} text={f.gases_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.pcStatus} text={f.pc_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.soapStatus} text={f.soap_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-center"><ColorBadge status={f.carnesStatus} text={f.carnes_date || 'N/A'} /></td>
                <td className="px-3 py-2 text-slate-600">{f.resolution || 'N/A'}</td>
              </tr>
            ))}
            {finalVehicles.length === 0 && (
              <tr><td colSpan="10" className="px-4 py-8 text-center text-slate-500">No se encontraron vehículos para estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
