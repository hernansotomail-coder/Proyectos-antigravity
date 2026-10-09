import React, { useEffect, useState, useMemo } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { Select } from './ui/Select';
import { Truck, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

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

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Compute regions for filter
  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  // Categorize vehicles
  const categorized = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque')) category = 'Semiremolques';
      
      return { ...f, dashboardCategory: category };
    });
  }, [fleetList]);

  // Apply filters
  const filteredVehicles = useMemo(() => {
    return categorized.filter(f => {
      if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;
      return true;
    });
  }, [categorized, typeFilter, regionFilter]);

  // Compute Cards
  const stats = useMemo(() => {
    let vehiculos = 0;
    let semiremolques = 0;
    let alertRt = 0, alertGases = 0, alertPc = 0, alertSoap = 0, alertCarnes = 0;

    categorized.forEach(f => {
      if (f.dashboardCategory === 'Semiremolques') semiremolques++;
      else vehiculos++;

      if (getStatus14_30(getDaysDiff(f.rt_date)) === 'red') alertRt++;
      if (getStatus14_30(getDaysDiff(f.gases_date)) === 'red') alertGases++;
      if (getStatus14_30(getDaysDiff(f.pc_date)) === 'red') alertPc++;
      if (getStatus30_40(getDaysDiff(f.soap_date)) === 'red') alertSoap++;
      if (getStatus30_40(getDaysDiff(f.carnes_date)) === 'red') alertCarnes++;
    });

    return { vehiculos, semiremolques, alertRt, alertGases, alertPc, alertSoap, alertCarnes };
  }, [categorized]);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-xl font-bold text-slate-800">Dashboard Flota</h2>
        <div className="flex gap-3 w-full md:w-auto">
          <Select 
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            options={[
              { value: 'Todos', label: 'Todos los Tipos' },
              { value: 'Camiones/Camionetas', label: 'Camiones/Camionetas' },
              { value: 'Tractos', label: 'Tractos' },
              { value: 'Semiremolques', label: 'Semiremolques' }
            ]}
          />
          <Select 
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            options={regions.map(r => ({ value: r, label: r }))}
          />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6 shrink-0">
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
          <p className="text-[10px] text-slate-500 font-semibold uppercase">Vehículos (Cam/Trac)</p>
          <p className="text-2xl font-black text-slate-800">{stats.vehiculos}</p>
        </div>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
          <p className="text-[10px] text-slate-500 font-semibold uppercase">Semiremolques</p>
          <p className="text-2xl font-black text-slate-800">{stats.semiremolques}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col justify-between">
          <p className="text-[10px] text-red-600 font-semibold uppercase">Alerta Rev. Téc.</p>
          <p className="text-2xl font-black text-red-700">{stats.alertRt}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col justify-between">
          <p className="text-[10px] text-red-600 font-semibold uppercase">Alerta Gases</p>
          <p className="text-2xl font-black text-red-700">{stats.alertGases}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col justify-between">
          <p className="text-[10px] text-red-600 font-semibold uppercase">Alerta PC</p>
          <p className="text-2xl font-black text-red-700">{stats.alertPc}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col justify-between">
          <p className="text-[10px] text-red-600 font-semibold uppercase">Alerta SOAP</p>
          <p className="text-2xl font-black text-red-700">{stats.alertSoap}</p>
        </div>
        <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col justify-between">
          <p className="text-[10px] text-red-600 font-semibold uppercase">Alerta Carnes</p>
          <p className="text-2xl font-black text-red-700">{stats.alertCarnes}</p>
        </div>
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
              <th className="px-3 py-2 font-semibold border-b text-center">RT</th>
              <th className="px-3 py-2 font-semibold border-b text-center">Gases</th>
              <th className="px-3 py-2 font-semibold border-b text-center">PC</th>
              <th className="px-3 py-2 font-semibold border-b text-center">SOAP</th>
              <th className="px-3 py-2 font-semibold border-b text-center">Carnes</th>
              <th className="px-3 py-2 font-semibold border-b">Resolución</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredVehicles.map(f => {
              const rtDays = getDaysDiff(f.rt_date);
              const gasesDays = getDaysDiff(f.gases_date);
              const pcDays = getDaysDiff(f.pc_date);
              const soapDays = getDaysDiff(f.soap_date);
              const carnesDays = getDaysDiff(f.carnes_date);

              return (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600">{f.type || 'N/A'}</td>
                  <td className="px-3 py-2 font-bold text-slate-800">{f.plate}</td>
                  <td className="px-3 py-2 text-slate-600">{f.internal_number || 'N/A'}</td>
                  <td className="px-3 py-2 text-slate-600">{f.brand || 'N/A'}</td>
                  
                  <td className="px-3 py-2 text-center">
                    <ColorBadge status={getStatus14_30(rtDays)} text={f.rt_date || 'N/A'} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorBadge status={getStatus14_30(gasesDays)} text={f.gases_date || 'N/A'} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorBadge status={getStatus14_30(pcDays)} text={f.pc_date || 'N/A'} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorBadge status={getStatus30_40(soapDays)} text={f.soap_date || 'N/A'} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorBadge status={getStatus30_40(carnesDays)} text={f.carnes_date || 'N/A'} />
                  </td>
                  
                  <td className="px-3 py-2 text-slate-600">{f.resolution || 'N/A'}</td>
                </tr>
              );
            })}
            {filteredVehicles.length === 0 && (
              <tr>
                <td colSpan="10" className="px-4 py-8 text-center text-slate-500">
                  No se encontraron vehículos para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
