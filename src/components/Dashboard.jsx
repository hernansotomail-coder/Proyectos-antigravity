import React, { useEffect, useState, useMemo } from 'react';
import { useStaffStore } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { Select } from './ui/Select';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Download, Users, Briefcase, CalendarOff, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// Helper to get days in month
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const getServiceColor = (serviceType) => {
  switch (serviceType) {
    case 'Trabajando': return 'bg-green-100 text-green-700 font-bold';
    case 'Vacaciones': return 'bg-yellow-100 text-yellow-700';
    case 'Licencia': return 'bg-orange-100 text-orange-700';
    case 'Ausente': return 'bg-red-100 text-red-700 font-bold';
    case 'Disponible': return 'bg-blue-100 text-blue-700';
    case 'Permiso con goce': return 'bg-purple-100 text-purple-700';
    case 'Permiso sin goce': return 'bg-pink-100 text-pink-700';
    case 'Baja': return 'bg-slate-200 text-slate-500 line-through';
    default: return 'bg-slate-100 text-slate-300 border border-dashed border-slate-300';
  }
};

const getServiceAbbr = (serviceType) => {
  switch (serviceType) {
    case 'Trabajando': return 'T';
    case 'Vacaciones': return 'V';
    case 'Licencia': return 'L';
    case 'Ausente': return 'A';
    case 'Disponible': return 'D';
    case 'Permiso con goce': return 'PG';
    case 'Permiso sin goce': return 'PS';
    case 'Baja': return 'B';
    default: return '';
  }
};

export default function Dashboard() {
  const { staffList, fetchStaff } = useStaffStore();
  const { attendanceList, fetchAttendanceByDateRange, isLoading } = useAttendanceStore();
  
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeKpiFilter, setActiveKpiFilter] = useState(null); // 'Trabajando', 'Vacaciones', 'Licencia', 'Ausente'

  const loadData = () => {
    const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${daysInMonth}`;
    fetchAttendanceByDateRange(start, end);
  };

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    loadData();
  }, [selectedYear, selectedMonth, fetchAttendanceByDateRange]);

  // Data processing
  const filteredStaff = useMemo(() => {
    let list = staffList;
    if (roleFilter) list = list.filter(s => s.role === roleFilter);
    if (statusFilter) list = list.filter(s => s.status === statusFilter);
    if (searchFilter) {
      const lower = searchFilter.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(lower) || s.rut.toLowerCase().includes(lower));
    }
    return list;
  }, [staffList, roleFilter, statusFilter, searchFilter]);

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Matrix generation with KPI filtering
  const matrix = useMemo(() => {
    const rawMatrix = filteredStaff.map(staff => {
      const staffAttendance = attendanceList.filter(a => a.staff_id === staff.id);
      
      const row = {
        rut: staff.rut,
        name: staff.name,
        role: staff.role,
        status: staff.status,
        days: {}
      };

      daysArray.forEach(day => {
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const record = staffAttendance.find(a => a.date === dateStr);
        row.days[day] = record ? record.service_type : '';
      });

      return row;
    });

    // Apply KPI Filter (Only show rows that contain the active kpi service_type at least once)
    if (activeKpiFilter) {
      return rawMatrix.filter(row => Object.values(row.days).includes(activeKpiFilter));
    }

    return rawMatrix;
  }, [filteredStaff, attendanceList, daysArray, selectedYear, selectedMonth, activeKpiFilter]);

  // KPIs Calculation (calculated on ALL filteredStaff to maintain totals)
  const kpis = useMemo(() => {
    const totalStaff = filteredStaff.length;
    let totalTrabajando = 0;
    let totalVacaciones = 0;
    let totalLicencias = 0;
    let totalAusencias = 0;

    // Use full attendance list for the current filtered staff to calculate KPI counts
    filteredStaff.forEach(staff => {
      const staffAttendance = attendanceList.filter(a => a.staff_id === staff.id);
      staffAttendance.forEach(val => {
        if (val.service_type === 'Trabajando') totalTrabajando++;
        if (val.service_type === 'Vacaciones') totalVacaciones++;
        if (val.service_type === 'Licencia') totalLicencias++;
        if (val.service_type === 'Ausente') totalAusencias++;
      });
    });

    return { totalStaff, totalTrabajando, totalVacaciones, totalLicencias, totalAusencias };
  }, [filteredStaff, attendanceList, daysInMonth]);

  // Export to Excel
  const exportToExcel = () => {
    const dataToExport = matrix.map(row => {
      const baseObj = {
        'RUT': row.rut,
        'Nombre': row.name,
        'Cargo': row.role,
        'Estado': row.status
      };
      
      daysArray.forEach(day => {
        baseObj[`Día ${day}`] = row.days[day] || '-';
      });
      
      return baseObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Asistencia ${selectedMonth}-${selectedYear}`);
    
    // Auto-size columns roughly
    const wscols = [{wch: 12}, {wch: 30}, {wch: 15}, {wch: 10}];
    for(let i=0; i<daysInMonth; i++) wscols.push({wch: 12});
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `Reporte_Asistencia_${selectedMonth}_${selectedYear}.xlsx`);
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 max-w-[95%] mx-auto flex flex-col h-[calc(100vh-80px)]">
      
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard y Reportes</h2>
        
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-32">
            <Select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              options={Array.from({length: 12}, (_, i) => ({value: i+1, label: new Date(0, i).toLocaleString('es', {month: 'long'})}))}
            />
          </div>
          <div className="w-24">
            <Select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              options={[2025, 2026, 2027].map(y => ({value: y, label: y.toString()}))}
            />
          </div>
          <div className="w-40">
            <Select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[{value: '', label: 'Todos los cargos'}, {value: 'Conductor', label: 'Conductores'}, {value: 'Auxiliar', label: 'Auxiliares'}, {value: 'Movilizador', label: 'Movilizadores'}]}
            />
          </div>
          <div className="w-40">
            <Input 
              placeholder="Buscar personal..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-10"
            />
          </div>
          <Button onClick={exportToExcel} className="flex gap-2 h-10 bg-green-600 hover:bg-green-700">
            <Download size={18} /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 shrink-0">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Users size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Dotación</p>
            <p className="text-2xl font-bold text-slate-800">{kpis.totalStaff}</p>
          </div>
        </div>
        <div 
          onClick={() => setActiveKpiFilter(prev => prev === 'Trabajando' ? null : 'Trabajando')}
          className={`p-4 rounded-xl border shadow-sm flex items-center gap-4 cursor-pointer transition-all transform hover:scale-105 ${activeKpiFilter === 'Trabajando' ? 'border-green-500 ring-2 ring-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Briefcase size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Días Trabajados</p>
            <p className="text-2xl font-bold text-slate-800">{kpis.totalTrabajando}</p>
          </div>
        </div>
        <div 
          onClick={() => setActiveKpiFilter(prev => prev === 'Vacaciones' ? null : 'Vacaciones')}
          className={`p-4 rounded-xl border shadow-sm flex items-center gap-4 cursor-pointer transition-all transform hover:scale-105 ${activeKpiFilter === 'Vacaciones' ? 'border-yellow-500 ring-2 ring-yellow-200 bg-yellow-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg"><CalendarOff size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Días Vacaciones</p>
            <p className="text-2xl font-bold text-slate-800">{kpis.totalVacaciones}</p>
          </div>
        </div>
        <div 
          onClick={() => setActiveKpiFilter(prev => prev === 'Licencia' ? null : 'Licencia')}
          className={`p-4 rounded-xl border shadow-sm flex items-center gap-4 cursor-pointer transition-all transform hover:scale-105 ${activeKpiFilter === 'Licencia' ? 'border-orange-500 ring-2 ring-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><AlertTriangle size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Días Licencia</p>
            <p className="text-2xl font-bold text-slate-800">{kpis.totalLicencias}</p>
          </div>
        </div>
        <div 
          onClick={() => setActiveKpiFilter(prev => prev === 'Ausente' ? null : 'Ausente')}
          className={`p-4 rounded-xl border shadow-sm flex items-center gap-4 cursor-pointer transition-all transform hover:scale-105 ${activeKpiFilter === 'Ausente' ? 'border-red-500 ring-2 ring-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
        >
          <div className="p-3 bg-red-100 text-red-600 rounded-lg"><UserXIcon size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Días Ausente</p>
            <p className="text-2xl font-bold text-slate-800">{kpis.totalAusencias}</p>
          </div>
        </div>
      </div>

      {/* Matriz de Asistencia (Scrollable Table) */}
      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl relative shadow-inner bg-slate-50">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-500">Cargando matriz...</div>
        ) : (
          <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 font-semibold border-b border-r border-slate-200 sticky left-0 z-30 bg-slate-100 min-w-[250px]">
                  Personal
                </th>
                <th className="px-3 py-3 font-semibold border-b border-r border-slate-200 min-w-[100px]">Cargo</th>
                {daysArray.map(day => (
                  <th key={day} className="px-1 py-3 font-semibold border-b border-r border-slate-200 text-center min-w-[36px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {matrix.map((row) => (
                <tr key={row.rut} className="hover:bg-slate-50 transition-colors border-b border-slate-100 group">
                  <td className="px-4 py-2 border-r border-slate-100 sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors">
                    <p className="font-medium text-slate-800">{row.name}</p>
                    <p className="text-xs text-slate-400">{row.rut}</p>
                  </td>
                  <td className="px-3 py-2 border-r border-slate-100 text-slate-600">
                    {row.role}
                  </td>
                  {daysArray.map(day => {
                    const service = row.days[day];
                    return (
                      <td key={day} className="p-1 border-r border-slate-100 text-center" title={`${row.name} - ${day}/${selectedMonth} - ${service || 'Sin registro'}`}>
                        <div className={`w-full h-8 flex items-center justify-center rounded-md ${getServiceColor(service)}`}>
                          {getServiceAbbr(service)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {matrix.length === 0 && (
                <tr>
                  <td colSpan={daysInMonth + 2} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron registros para los filtros actuales
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 shrink-0 flex gap-4 text-xs text-slate-500 justify-center">
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 rounded"></div> Trabajando (T)</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 rounded"></div> Vacaciones (V)</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-100 rounded"></div> Licencia (L)</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 rounded"></div> Ausente (A)</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 bg-purple-100 rounded"></div> Permisos</span>
      </div>
    </div>
  );
}

// Icon helper missing above
function UserXIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="17" y1="8" x2="22" y2="13" />
      <line x1="22" y1="8" x2="17" y2="13" />
    </svg>
  );
}
