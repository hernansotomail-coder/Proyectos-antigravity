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

const getDocumentStatus = (days) => {
  if (days === null) return 'N/A';
  if (days < 0) return 'red'; // Vencido
  if (days <= 15) return 'orange'; // 0 a 15 dias
  if (days <= 30) return 'yellow'; // 16 a 30 dias
  return 'green'; // > 30 dias
};

const ColorBadge = ({ status, text }) => {
  if (status === 'N/A') return <span className="text-slate-400 text-xs">N/A</span>;
  const colors = {
    red: 'bg-red-100 text-red-700 border-red-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    green: 'bg-green-100 text-green-700 border-green-200'
  };
  return (
    <div className={`px-2 py-1 rounded-md text-[10px] font-bold border ${colors[status]}`}>
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
        rtStatus: getDocumentStatus(getDaysDiff(f.rt_date)),
        gasesStatus: getDocumentStatus(getDaysDiff(f.gases_date)),
        pcStatus: getDocumentStatus(getDaysDiff(f.pc_date)),
        soapStatus: getDocumentStatus(getDaysDiff(f.soap_date)),
        carnesStatus: getDocumentStatus(getDaysDiff(f.carnes_date)),
      };
    });
  }, [fleetList]);

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

  const stats = useMemo(() => {
    let vehiculos = 0, semiremolques = 0;
    const createAlert = () => ({ count: 0, severity: 'green' });
    let alertRt = createAlert(), alertGases = createAlert(), alertPc = createAlert(), alertSoap = createAlert(), alertCarnes = createAlert();

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
    });

    return { vehiculos, semiremolques, alertRt, alertGases, alertPc, alertSoap, alertCarnes };
  }, [baseFilteredVehicles]);

  const finalVehicles = useMemo(() => {
    return baseFilteredVehicles.filter(f => {
      if (activeCard === 'vehiculos' && f.dashboardCategory === 'Semiremolques') return false;
      if (activeCard === 'semiremolques' && f.dashboardCategory !== 'Semiremolques') return false;
      if (activeCard === 'rt' && f.rtStatus === 'green') return false; // Alerta = NO verde
      if (activeCard === 'gases' && f.gasesStatus === 'green') return false;
      if (activeCard === 'pc' && f.pcStatus === 'green') return false;
      if (activeCard === 'soap' && f.soapStatus === 'green') return false;
      if (activeCard === 'carnes' && f.carnesStatus === 'green') return false;

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

  const DynamicCard = ({ id, title, data }) => {
    const isActive = activeCard === id;
    let bgColors = 'bg-slate-50 border-slate-200 text-slate-800';
    let textColors = 'text-slate-500';
    let activeRing = 'ring-2 ring-slate-300';
    
    // Severity defaults to 'green' when count is 0
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
        <option value="orange">0 a 15 días</option>
        <option value="yellow">15 a 30 días</option>
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

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6 shrink-0">
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
      </div>

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
