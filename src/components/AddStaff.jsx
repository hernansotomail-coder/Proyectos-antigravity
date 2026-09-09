import React, { useState } from 'react';
import { useStaffStore } from '../store/staffStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Utilidad simple para formatear RUT
const formatRut = (rut) => {
  if (!rut) return '';
  const strRut = String(rut);
  const cleanRut = strRut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length <= 1) return cleanRut;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};

export default function AddStaff() {
  const [activeTab, setActiveTab] = useState('manual');
  
  // Tab 1: Carga Manual
  const [formData, setFormData] = useState({ rut: '', name: '', role: '', status: 'Activo' });
  const { addStaff, addStaffBulk, isLoading } = useStaffStore();

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.rut || !formData.name || !formData.role) {
      toast.error("Por favor completa los campos obligatorios");
      return;
    }
    const success = await addStaff(formData);
    if (success) {
      setFormData({ rut: '', name: '', role: '', status: 'Activo' });
    }
  };

  // Tab 2: Carga Masiva (Excel)
  const [previewData, setPreviewData] = useState(null);

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        // Función para buscar valor ignorando mayúsculas y espacios
        const getValue = (rowObj, possibleKeys) => {
          const keys = Object.keys(rowObj);
          for (let k of keys) {
            const normalizedKey = k.toLowerCase().trim().replace(/\\./g, '');
            if (possibleKeys.some(pk => normalizedKey.includes(pk))) {
              return rowObj[k];
            }
          }
          return '';
        };

        // Mapear y validar columnas
        const mappedData = json.map(row => {
          const rawRut = getValue(row, ['rut', 'rol']);
          const rawName = getValue(row, ['conductor/auxiliar', 'nombre', 'empleado']);
          const rawRole = getValue(row, ['cargo', 'puesto']);
          let rawStatus = getValue(row, ['estado', 'status', 'vigencia']);

          if (rawStatus && rawStatus.toString().toUpperCase().includes('VIGENTE')) {
            rawStatus = 'Activo';
          } else if (!rawStatus) {
            rawStatus = 'Activo';
          }

          const formattedRut = formatRut(rawRut);
          
          // Mapeo simple de cargos si vienen como 'Conductor A4' -> dejarlo pasar, la BD lo acepta.
          let role = rawRole || 'Auxiliar';
          if (role.toLowerCase().includes('conductor')) role = 'Conductor';
          if (role.toLowerCase().includes('movilizador')) role = 'Movilizador';

          return {
            rut: formattedRut,
            name: rawName || '',
            role: role,
            status: rawStatus,
            isValid: !!formattedRut && !!rawName && !!role
          };
        });

        setPreviewData(mappedData);
        if (mappedData.some(d => !d.isValid)) {
          toast.warning("Algunas filas tienen datos incompletos");
        } else {
          toast.success("Archivo leído correctamente");
        }
      } catch (error) {
        console.error(error);
        toast.error("Error al leer el archivo Excel");
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

  const handleBulkSubmit = async () => {
    const validData = previewData.filter(d => d.isValid).map(({ rut, name, role, status }) => ({
      rut: String(rut).trim(),
      name: String(name).trim(),
      role: String(role).trim(),
      status: String(status).trim()
    }));
    
    if (validData.length === 0) {
      toast.error("No hay datos válidos para guardar");
      return;
    }

    const success = await addStaffBulk(validData);
    if (success) {
      setPreviewData(null);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Agregar Dotación</h2>
      
      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors relative ${activeTab === 'manual' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('manual')}
        >
          Carga Manual
          {activeTab === 'manual' && <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors relative ${activeTab === 'masiva' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('masiva')}
        >
          Carga Masiva (Excel)
          {activeTab === 'masiva' && <div className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-6 max-w-md">
          <Input 
            label="RUT" 
            placeholder="12.345.678-9" 
            value={formData.rut}
            onChange={(e) => setFormData({...formData, rut: formatRut(e.target.value)})}
            required
          />
          <Input 
            label="Nombre Completo (Conductor/Auxiliar)" 
            placeholder="Ej. Juan Pérez" 
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
          <Select 
            label="Cargo"
            value={formData.role}
            onChange={(e) => setFormData({...formData, role: e.target.value})}
            options={[
              { value: 'Conductor', label: 'Conductor' },
              { value: 'Auxiliar', label: 'Auxiliar' },
              { value: 'Movilizador', label: 'Movilizador' }
            ]}
            required
          />
          <Select 
            label="Estado"
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value})}
            options={[
              { value: 'Activo', label: 'Activo' },
              { value: 'Inactivo', label: 'Inactivo' }
            ]}
          />
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Guardando...' : 'Guardar Registro'}
          </Button>
        </form>
      )}

      {activeTab === 'masiva' && (
        <div className="space-y-6">
          {!previewData && (
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex justify-center mb-4 text-slate-400">
                <UploadCloud size={48} />
              </div>
              <p className="text-slate-600 font-medium">Arrastra y suelta tu archivo Excel aquí</p>
              <p className="text-xs text-slate-400 mt-2">O haz clic para seleccionar un archivo (.xlsx)</p>
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-left text-sm text-yellow-800">
                <span className="font-semibold block mb-1">Columnas obligatorias en el Excel:</span>
                "Rut", "Conductor/Auxiliar", "Cargo", "Estado"
              </div>
            </div>
          )}

          {previewData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-800">Vista Previa ({previewData.length} registros)</h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPreviewData(null)}>Cancelar</Button>
                  <Button onClick={handleBulkSubmit} disabled={isLoading}>
                    {isLoading ? 'Guardando...' : 'Confirmar y Guardar'}
                  </Button>
                </div>
              </div>
              
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">RUT</th>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Cargo</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.map((row, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-4 py-3">
                          {row.isValid 
                            ? <CheckCircle2 size={18} className="text-green-500" /> 
                            : <AlertCircle size={18} className="text-red-500" title="Datos incompletos" />
                          }
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.rut || '-'}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{row.role || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.status === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
