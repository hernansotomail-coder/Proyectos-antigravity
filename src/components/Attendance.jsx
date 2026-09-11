import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useStaffStore } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertCircle, Trash2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

// Helper to get days in month
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const getServiceColor = (serviceType) => {
  switch (serviceType) {
    case 'Trabajado': return 'bg-green-100 text-green-700 font-bold';
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
    case 'Trabajado': return 'T';
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

const serviceOptions = [
  'Trabajado', 'Licencia', 'Disponible', 'Ausente', 
  'Vacaciones', 'Baja', 'Permiso con goce', 'Permiso sin goce'
];

export default function Attendance() {
  const [activeTab, setActiveTab] = useState('masiva');
  const { staffList, fetchStaff } = useStaffStore();
  const { saveAttendanceBulk, saveAttendanceRange, attendanceList, fetchAttendanceByDateRange, isLoading } = useAttendanceStore();

  useEffect(() => {
    fetchStaff(); // Ensure staff is loaded
  }, [fetchStaff]);

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedDay, setSelectedDay] = useState(''); // '' means All days
  const [statusFilter, setStatusFilter] = useState(''); // '' means Todos
  const [editCell, setEditCell] = useState(null);

  const loadMatrixData = () => {
    const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${daysInMonth}`;
    fetchAttendanceByDateRange(start, end);
  };

  useEffect(() => {
    if (activeTab === 'edicion') {
      loadMatrixData();
    }
  }, [activeTab, selectedYear, selectedMonth]);

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const daysArray = selectedDay 
    ? [Number(selectedDay)] 
    : Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const matrix = useMemo(() => {
    const rawMatrix = staffList.filter(s => s.status === 'Activo').map(staff => {
      const staffAttendance = attendanceList.filter(a => a.staff_id === staff.id);
      
      const row = {
        rut: staff.rut,
        name: staff.name,
        role: staff.role,
        status: staff.status,
        days: {}
      };

      daysArray.forEach(day => {
        const isSunday = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0;
        if (isSunday) {
          row.days[day] = '';
        } else {
          const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const record = staffAttendance.find(a => a.date === dateStr);
          row.days[day] = record ? record.service_type : '';
        }
      });

      return row;
    });

    if (statusFilter) {
      if (statusFilter === 'Vacio') {
        return rawMatrix.filter(row => Object.values(row.days).includes(''));
      }
      return rawMatrix.filter(row => Object.values(row.days).includes(statusFilter));
    }

    return rawMatrix;
  }, [staffList, attendanceList, daysArray, selectedYear, selectedMonth, statusFilter]);

  const handleSaveEditCell = async (e) => {
    e.preventDefault();
    if (!editCell) return;

    if (editCell.currentService === "Limpiar" || editCell.currentService === "") {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .match({ staff_id: editCell.id_db, date: editCell.dateStr });
      
      if (error) {
        toast.error('Error al limpiar estado: ' + error.message);
      } else {
        toast.success('Estado limpiado exitosamente');
        setEditCell(null);
        loadMatrixData();
      }
      return;
    }

    let records = [{
      staff_id: editCell.id_db,
      date: editCell.dateStr,
      service_type: editCell.currentService
    }];

    if (editCell.applyToOtherStaff && editCell.applyToOtherStaff.length > 0) {
      editCell.applyToOtherStaff.forEach(otherId => {
        records.push({
          staff_id: otherId,
          date: editCell.dateStr,
          service_type: editCell.currentService
        });
      });
    }

    const success = await saveAttendanceBulk(records);
    if (success) {
      setEditCell(null);
      loadMatrixData(); // Reload to reflect changes
    }
  };

  // Tab 1: Carga Masiva
  const [bulkDate, setBulkDate] = useState('');
  const [previewData, setPreviewData] = useState(null);

  const formatRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();

  const onDrop = (acceptedFiles) => {
    if (!bulkDate) {
      toast.error('Por favor, selecciona una fecha primero');
      return;
    }
    
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        
        let processedRecords = [];
        
        json.forEach(row => {
          const excelDate = row['Fecha']; // Could be checked to match bulkDate, but bulkDate is the primary truth for assignment
          const rutConductor = formatRut(row['Rut Conductor']);
          const rutAuxiliar = formatRut(row['Rut Auxiliar']);
          const rawServiceType = row['Tipo de servicio'] || '';
          
          // Encuentra si existen en DB
          const conductorDB = staffList.find(s => formatRut(s.rut) === rutConductor);
          const auxiliarDB = staffList.find(s => formatRut(s.rut) === rutAuxiliar);

          // Determinar estado por defecto (Trabajado si hay tipo de servicio, o en blanco)
          const matchedServiceType = rawServiceType ? 'Trabajado' : '';

          if (rutConductor) {
            processedRecords.push({
              rut: row['Rut Conductor'],
              staff_id: conductorDB ? conductorDB.id : null,
              name: conductorDB ? conductorDB.name : 'No encontrado en DB',
              role: 'Conductor',
              service_type: conductorDB ? matchedServiceType : '',
              isMatched: !!conductorDB
            });
          }
          if (rutAuxiliar) {
            processedRecords.push({
              rut: row['Rut Auxiliar'],
              staff_id: auxiliarDB ? auxiliarDB.id : null,
              name: auxiliarDB ? auxiliarDB.name : 'No encontrado en DB',
              role: 'Auxiliar',
              service_type: auxiliarDB ? matchedServiceType : '',
              isMatched: !!auxiliarDB
            });
          }
        });

        // Eliminar RUTs duplicados (dejando solo la primera aparición)
        const uniqueRecordsMap = new Map();
        processedRecords.forEach(record => {
          if (!uniqueRecordsMap.has(record.rut)) {
            uniqueRecordsMap.set(record.rut, record);
          }
        });
        const uniqueRecords = Array.from(uniqueRecordsMap.values());

        setPreviewData(uniqueRecords);
        if (uniqueRecords.some(r => !r.isMatched || !r.service_type)) {
          toast.warning('Revisa la tabla, hay registros sin estado o no encontrados');
        } else {
          toast.success(`Archivo procesado. Se cargaron ${uniqueRecords.length} registros únicos.`);
        }
      } catch (error) {
        console.error(error);
        toast.error('Error al leer el archivo Excel');
      }
    };
    reader.readAsBinaryString(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1
  });

  const handleServiceChange = (index, newValue) => {
    const newData = [...previewData];
    newData[index].service_type = newValue;
    setPreviewData(newData);
  };

  const handleStaffChange = (index, newStaffId) => {
    const staff = staffList.find(s => s.id === newStaffId);
    if (!staff) return;
    
    const newData = [...previewData];
    newData[index] = {
      ...newData[index],
      staff_id: staff.id,
      name: staff.name,
      rut: staff.rut,
      role: staff.role,
      isMatched: true,
      service_type: newData[index].service_type || 'Trabajado'
    };
    setPreviewData(newData);
  };

  const handleDeleteRow = (index) => {
    const newData = [...previewData];
    newData.splice(index, 1);
    setPreviewData(newData);
  };

  const handleAddRow = () => {
    setPreviewData([
      ...previewData, 
      {
        rut: '',
        staff_id: null,
        name: 'Seleccionar manualmente...',
        role: '-',
        service_type: 'Trabajado',
        isMatched: false
      }
    ]);
  };

  const submitBulk = async () => {
    // Solo enviamos los que tienen ID (encontrados) y tienen un service_type asignado
    let validRecords = previewData
      .filter(r => r.isMatched && r.service_type)
      .map(r => ({
        staff_id: r.staff_id,
        date: bulkDate,
        service_type: r.service_type
      }));
    
    if (validRecords.length === 0) {
      toast.error('No hay registros válidos para guardar');
      return;
    }

    // Prevención de sobrescritura para estados prioritarios
    try {
      const { data: existingRecords } = await supabase
        .from('attendance')
        .select('staff_id, service_type')
        .eq('date', bulkDate);

      if (existingRecords && existingRecords.length > 0) {
        const protectedStatuses = ['Vacaciones', 'Licencia', 'Ausente', 'Permiso con goce', 'Permiso sin goce'];
        
        validRecords = validRecords.map(record => {
          const existing = existingRecords.find(e => e.staff_id === record.staff_id);
          // Si ya existe un estado protegido en la BD para esa persona, lo conservamos (ej. si el excel intenta poner Trabajado u otro)
          if (existing && protectedStatuses.includes(existing.service_type)) {
            return { ...record, service_type: existing.service_type };
          }
          return record;
        });
      }
    } catch (e) {
      console.error('Error verificando registros existentes en la BD', e);
    }

    const success = await saveAttendanceBulk(validRecords);
    if (success) {
      setPreviewData(null);
    }
  };


  // Tab 2: Manual
  const [manualData, setManualData] = useState({ staff_id: '', date: '', service_type: 'Trabajado' });
  const submitManual = async (e) => {
    e.preventDefault();
    if (!manualData.staff_id || !manualData.date || !manualData.service_type) return;
    
    const success = await saveAttendanceBulk([{
      staff_id: manualData.staff_id,
      date: manualData.date,
      service_type: manualData.service_type
    }]);
    
    if (success) {
      setManualData({ ...manualData, date: '' });
    }
  };


  // Tab 3: Rango de Fechas
  const [rangeData, setRangeData] = useState({ staff_id: '', startDate: '', endDate: '', service_type: 'Vacaciones' });
  const submitRange = async (e) => {
    e.preventDefault();
    if (!rangeData.staff_id || !rangeData.startDate || !rangeData.endDate || !rangeData.service_type) return;
    if (new Date(rangeData.startDate) > new Date(rangeData.endDate)) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }
    
    const success = await saveAttendanceRange(rangeData.staff_id, rangeData.startDate, rangeData.endDate, rangeData.service_type);
    if (success) {
      setRangeData({ ...rangeData, startDate: '', endDate: '' });
    }
  };


  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Asignación de Asistencia</h2>
      
      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6 overflow-x-auto pb-2">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap relative ${activeTab === 'masiva' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('masiva')}
        >
          Masiva (Excel)
          {activeTab === 'masiva' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap relative ${activeTab === 'manual' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('manual')}
        >
          Asignación Manual
          {activeTab === 'manual' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap relative ${activeTab === 'rango' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('rango')}
        >
          Permisos y Vacaciones
          {activeTab === 'rango' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap relative ${activeTab === 'edicion' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('edicion')}
        >
          Edición Detallada
          {activeTab === 'edicion' && <div className="absolute bottom-[-9px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
      </div>

      {/* TABS CONTENT */}
      {activeTab === 'masiva' && (
        <div className="space-y-6">
          {!previewData && (
            <div className="space-y-4 max-w-md">
              <Input 
                type="date"
                label="Fecha correspondiente al archivo Excel" 
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                required
              />
              
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  !bulkDate ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50' :
                  isDragActive ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <input {...getInputProps()} disabled={!bulkDate} />
                <div className="flex justify-center mb-4 text-slate-400">
                  <UploadCloud size={48} />
                </div>
                <p className="text-slate-600 font-medium">Arrastra el Excel de asistencia aquí</p>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left text-xs text-blue-800">
                  Columnas esperadas: "Rut Conductor", "Rut Auxiliar", "Fecha", "Tipo de servicio"
                </div>
              </div>
            </div>
          )}

          {previewData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-800">Revisión de Asistencia</h3>
                  <p className="text-sm text-slate-500">Fecha seleccionada: {bulkDate}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPreviewData(null)}>Descartar</Button>
                  <Button onClick={submitBulk} disabled={isLoading}>
                    {isLoading ? 'Guardando...' : 'Guardar Registros'}
                  </Button>
                </div>
              </div>
              
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Estatus DB</th>
                      <th className="px-4 py-3 font-medium">RUT</th>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Cargo</th>
                      <th className="px-4 py-3 font-medium min-w-[200px]">Tipo de Servicio</th>
                      <th className="px-4 py-3 font-medium text-right">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.map((row, i) => (
                      <tr key={i} className={!row.isMatched ? 'bg-red-50/50' : 'bg-white'}>
                        <td className="px-4 py-3">
                          {row.isMatched 
                            ? <CheckCircle2 size={18} className="text-green-500" title="Encontrado en DB" /> 
                            : <AlertCircle size={18} className="text-red-500" title="No registrado en Dotación" />
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.rut || '-'}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.isMatched ? row.name : (
                            <select 
                              className="w-full h-8 rounded-lg border border-red-300 bg-white text-sm px-2 text-slate-700"
                              value=""
                              onChange={(e) => handleStaffChange(i, e.target.value)}
                            >
                              <option value="" disabled>Seleccionar de dotación...</option>
                              {staffList.filter(s => s.status === 'Activo').map(s => (
                                <option key={s.id} value={s.id}>{s.rut} - {s.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.role}</td>
                        <td className="px-4 py-3">
                          {row.isMatched ? (
                            <select 
                              className={`w-full h-8 rounded-lg border text-sm px-2 ${!row.service_type ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 bg-white'}`}
                              value={row.service_type}
                              onChange={(e) => handleServiceChange(i, e.target.value)}
                            >
                              <option value="" disabled>-- Seleccione estado --</option>
                              {serviceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-red-500">Mapear primero</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => handleDeleteRow(i)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Eliminar fila"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-start pt-2">
                <Button variant="outline" onClick={handleAddRow} className="flex gap-2">
                  <Plus size={18} /> Agregar Fila Manualmente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'manual' && (
        <form onSubmit={submitManual} className="space-y-6 max-w-md">
          <Select 
            label="Empleado (Conductor/Auxiliar)"
            value={manualData.staff_id}
            onChange={(e) => setManualData({...manualData, staff_id: e.target.value})}
            options={staffList.filter(s => s.status === 'Activo').map(s => ({ value: s.id, label: `${s.rut} - ${s.name} (${s.role})` }))}
            required
          />
          <Input 
            type="date"
            label="Fecha" 
            value={manualData.date}
            onChange={(e) => setManualData({...manualData, date: e.target.value})}
            required
          />
          <Select 
            label="Estado"
            value={manualData.service_type}
            onChange={(e) => setManualData({...manualData, service_type: e.target.value})}
            options={serviceOptions.map(opt => ({ value: opt, label: opt }))}
            required
          />
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Guardando...' : 'Asignar Asistencia'}
          </Button>
        </form>
      )}

      {activeTab === 'rango' && (
        <form onSubmit={submitRange} className="space-y-6 max-w-md">
          <Select 
            label="Empleado"
            value={rangeData.staff_id}
            onChange={(e) => setRangeData({...rangeData, staff_id: e.target.value})}
            options={staffList.filter(s => s.status === 'Activo').map(s => ({ value: s.id, label: `${s.rut} - ${s.name}` }))}
            required
          />
          <div className="flex gap-4">
            <Input 
              type="date"
              label="Fecha Inicio" 
              value={rangeData.startDate}
              onChange={(e) => setRangeData({...rangeData, startDate: e.target.value})}
              required
            />
            <Input 
              type="date"
              label="Fecha Fin" 
              value={rangeData.endDate}
              onChange={(e) => setRangeData({...rangeData, endDate: e.target.value})}
              required
            />
          </div>
          <Select 
            label="Tipo de Permiso/Vacaciones"
            value={rangeData.service_type}
            onChange={(e) => setRangeData({...rangeData, service_type: e.target.value})}
            options={[
              { value: 'Vacaciones', label: 'Vacaciones' },
              { value: 'Permiso con goce', label: 'Permiso con goce' },
              { value: 'Permiso sin goce', label: 'Permiso sin goce' },
              { value: 'Licencia', label: 'Licencia Médica' }
            ]}
            required
          />
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Guardando...' : 'Asignar Rango de Fechas'}
          </Button>
        </form>
      )}

      {activeTab === 'edicion' && (
        <div className="flex flex-col h-[calc(100vh-250px)]">
          <div className="flex flex-wrap gap-3 items-end mb-4 shrink-0">
            <div className="w-32">
              <Select 
                label="Mes"
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                options={Array.from({length: 12}, (_, i) => ({value: i+1, label: new Date(0, i).toLocaleString('es', {month: 'long'})}))}
              />
            </div>
            <div className="w-24">
              <Select 
                label="Año"
                value={selectedYear} 
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                options={[2025, 2026, 2027].map(y => ({value: y, label: y.toString()}))}
              />
            </div>
            <div className="w-32">
              <Select 
                label="Día"
                value={selectedDay} 
                onChange={(e) => setSelectedDay(e.target.value)}
                options={[{value: '', label: 'Todos'}].concat(Array.from({length: getDaysInMonth(selectedYear, selectedMonth)}, (_, i) => ({value: i+1, label: (i+1).toString()})))}
              />
            </div>
            <div className="w-48">
              <Select 
                label="Filtrar por Estado"
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '', label: 'Todos los registros' },
                  { value: 'Vacio', label: 'Sin Asignar (Vacío)' },
                  ...serviceOptions.map(opt => ({ value: opt, label: opt }))
                ]}
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-xl relative shadow-inner bg-slate-50">
            <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-600 sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold border-b border-r border-slate-200 sticky left-0 z-30 bg-slate-100 min-w-[250px]">Personal</th>
                  <th className="px-3 py-3 font-semibold border-b border-r border-slate-200 min-w-[100px]">Cargo</th>
                  {daysArray.map(day => {
                    const isWeekend = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0 || new Date(selectedYear, selectedMonth - 1, day).getDay() === 6;
                    return (
                      <th key={day} className={`px-1 py-3 font-semibold border-b border-r border-slate-200 text-center min-w-[36px] ${isWeekend ? 'bg-orange-200 text-orange-900' : ''}`}>
                        {day}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {matrix.map((row) => (
                  <tr key={row.rut} className="hover:bg-slate-50 transition-colors border-b border-slate-100 group">
                    <td className="px-4 py-2 border-r border-slate-100 sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors">
                      <p className="font-medium text-slate-800">{row.name}</p>
                      <p className="text-xs text-slate-400">{row.rut}</p>
                    </td>
                    <td className="px-3 py-2 border-r border-slate-100 text-slate-600">{row.role}</td>
                    {daysArray.map(day => {
                      const service = row.days[day];
                      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isWeekend = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0 || new Date(selectedYear, selectedMonth - 1, day).getDay() === 6;
                      
                      return (
                        <td 
                          key={day} 
                          className={`p-1 border-r border-slate-100 text-center cursor-pointer transition-colors relative ${isWeekend ? 'bg-orange-100 hover:bg-orange-200' : 'hover:bg-blue-50'}`} 
                          title={`Editar asistencia de ${row.name} el ${day}/${selectedMonth} - Actual: ${service || 'Vacío'}`}
                          onClick={() => setEditCell({ staff_id: row.rut, id_db: staffList.find(s=>s.rut === row.rut)?.id, name: row.name, day, dateStr, currentService: service })}
                        >
                          <div className={`w-full h-8 flex items-center justify-center rounded-md transition-transform hover:scale-110 ${getServiceColor(service)}`}>
                            {getServiceAbbr(service)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Edit Cell */}
      {editCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-lg text-slate-800">Modificar Asistencia</h3>
              <button onClick={() => setEditCell(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSaveEditCell(e);
            }} className="p-4 space-y-4">
              <div className="mb-2">
                <p className="text-sm font-medium text-slate-700">{editCell.name}</p>
                <p className="text-xs text-slate-500">Fecha: {editCell.day} / {selectedMonth} / {selectedYear}</p>
              </div>
              <Select 
                label="Nuevo Estado"
                value={editCell.currentService}
                onChange={(e) => setEditCell({...editCell, currentService: e.target.value})}
                options={[
                  { value: 'Limpiar', label: 'Limpiar (Eliminar estado)' },
                  { value: 'Trabajado', label: 'Trabajado' },
                  { value: 'Vacaciones', label: 'Vacaciones' },
                  { value: 'Licencia', label: 'Licencia Médica' },
                  { value: 'Ausente', label: 'Ausente' },
                  { value: 'Disponible', label: 'Disponible' },
                  { value: 'Permiso con goce', label: 'Permiso con goce' },
                  { value: 'Permiso sin goce', label: 'Permiso sin goce' },
                  { value: 'Baja', label: 'Baja' }
                ]}
                required
              />
              <div className="space-y-1 mt-2">
                <label className="text-sm font-medium text-slate-700">También aplicar a (Opcional)</label>
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-2 bg-slate-50">
                  {staffList.filter(s => s.status === 'Activo' && s.id !== editCell.id_db).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
                      <input 
                        type="checkbox" 
                        checked={(editCell.applyToOtherStaff || []).includes(s.id)}
                        onChange={(e) => {
                          const currentList = editCell.applyToOtherStaff || [];
                          if (e.target.checked) {
                            setEditCell({...editCell, applyToOtherStaff: [...currentList, s.id]});
                          } else {
                            setEditCell({...editCell, applyToOtherStaff: currentList.filter(id => id !== s.id)});
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setEditCell(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Guardando...' : 'Actualizar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
