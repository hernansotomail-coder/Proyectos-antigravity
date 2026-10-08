import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useFleetStore } from '../store/fleetStore';

// UI Components
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Select } from './ui/Select';

const getValue = (row, possibleKeys) => {
  const key = Object.keys(row).find(k => 
    possibleKeys.some(pk => k.toLowerCase().replace(/\s+/g, '').includes(pk.toLowerCase()))
  );
  return key ? row[key] : '';
};

export default function AddFleet() {
  const [activeTab, setActiveTab] = useState('manual');
  
  // Tab 1: Carga Manual
  const [formData, setFormData] = useState({ 
    type: 'Camión', 
    plate: '', 
    internal_number: '', 
    brand: '', 
    model: '', 
    year: '',
    status: 'Activo' 
  });
  
  const { addFleet, addFleetBulk, isLoading } = useFleetStore();

  // Tab 2: Carga Masiva
  const [previewData, setPreviewData] = useState(null);

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        const mappedData = json.map(row => {
          const rawType = getValue(row, ['tipo']);
          const rawPlate = getValue(row, ['patente']);
          const rawInternal = getValue(row, ['interno', 'n*interno', 'n°interno', 'numero']);
          const rawBrand = getValue(row, ['marca']);
          const rawModel = getValue(row, ['modelo']);
          const rawYear = getValue(row, ['año', 'ano']);
          let rawStatus = getValue(row, ['estado', 'status', 'vigencia']);

          if (rawStatus && String(rawStatus).toUpperCase().includes('VIGENTE')) {
            rawStatus = 'Activo';
          } else if (!rawStatus) {
            rawStatus = 'Activo';
          }

          const cleanPlate = rawPlate != null ? String(rawPlate).toUpperCase().trim() : '';
          const cleanInternal = rawInternal != null ? String(rawInternal).trim() : 'S/N'; // S/N si viene vacio para no fallar

          return {
            type: rawType ? String(rawType).trim() : 'Camión',
            plate: cleanPlate,
            internal_number: cleanInternal,
            brand: rawBrand != null ? String(rawBrand).trim() : null,
            model: rawModel != null ? String(rawModel).trim() : null,
            year: rawYear != null ? String(rawYear).trim() : null,
            status: String(rawStatus).trim(),
            isValid: !!cleanPlate
          };
        });

        setPreviewData(mappedData);
      } catch (error) {
        console.error(error);
        toast.error('Error al procesar el archivo Excel');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.plate || !formData.internal_number) {
      toast.error('Patente y N° Interno son obligatorios');
      return;
    }

    const success = await addFleet({
      ...formData,
      plate: formData.plate.toUpperCase().trim()
    });

    if (success) {
      setFormData({ type: 'Camión', plate: '', internal_number: '', brand: '', model: '', year: '', status: 'Activo' });
    }
  };

  const handleBulkSubmit = async () => {
    const validData = previewData.filter(d => d.isValid).map(d => ({
      type: d.type,
      plate: d.plate,
      internal_number: d.internal_number,
      brand: d.brand,
      model: d.model,
      year: d.year,
      status: d.status
    }));

    if (validData.length === 0) {
      toast.error('No hay datos válidos para cargar');
      return;
    }

    // Deduplicar por patente para evitar errores de Supabase Upsert en la misma carga
    const uniqueData = [];
    const seen = new Set();
    // Procesar de fin a inicio para quedarse con la última aparición de la patente en el Excel
    for (let i = validData.length - 1; i >= 0; i--) {
      if (!seen.has(validData[i].plate)) {
        seen.add(validData[i].plate);
        uniqueData.push(validData[i]);
      }
    }

    const success = await addFleetBulk(uniqueData);
    if (success) {
      setPreviewData(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200">
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${
            activeTab === 'manual' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          Carga Manual
          {activeTab === 'manual' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${
            activeTab === 'bulk' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setActiveTab('bulk')}
        >
          Carga Masiva (Excel)
          {activeTab === 'bulk' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Agregar Vehículo</h2>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="Tipo"
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              options={[
                { value: 'Camión', label: 'Camión' },
                { value: 'Rampla', label: 'Rampla' },
                { value: 'Tracto', label: 'Tracto' },
                { value: 'Furgón', label: 'Furgón' }
              ]}
              required
            />
            <Input 
              label="Patente" 
              placeholder="Ej. AB-CD-12"
              value={formData.plate}
              onChange={(e) => setFormData({...formData, plate: e.target.value})}
              required
            />
            <Input 
              label="N° Interno" 
              placeholder="Ej. 1045"
              value={formData.internal_number}
              onChange={(e) => setFormData({...formData, internal_number: e.target.value})}
              required
            />
            <Input 
              label="Marca" 
              placeholder="Ej. Freightliner"
              value={formData.brand}
              onChange={(e) => setFormData({...formData, brand: e.target.value})}
            />
            <Input 
              label="Modelo" 
              placeholder="Ej. Cascadia"
              value={formData.model}
              onChange={(e) => setFormData({...formData, model: e.target.value})}
            />
            <Input 
              label="Año" 
              placeholder="Ej. 2022"
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({...formData, year: e.target.value})}
            />
            <Select 
              label="Estado"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              options={[
                { value: 'Activo', label: 'Activo' },
                { value: 'En Taller', label: 'En Taller' },
                { value: 'Inactivo', label: 'Inactivo' }
              ]}
              required
            />
            <div className="md:col-span-2 pt-4">
              <Button type="submit" isLoading={isLoading} className="w-full md:w-auto">
                Guardar Vehículo
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          {!previewData ? (
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center text-slate-500">
                <FileSpreadsheet size={48} className="mb-4 text-slate-400" />
                <p className="text-lg font-medium text-slate-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-xs text-slate-400 mt-2">O haz clic para seleccionar un archivo (.xlsx)</p>
                <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-left text-sm text-yellow-800">
                  <span className="font-semibold block mb-1">Columnas sugeridas en el Excel:</span>
                  "Tipo", "Patente", "N*Interno", "Marca", "Modelo", "Año"
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-800">Vista Previa ({previewData.length} registros)</h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPreviewData(null)}>Cancelar</Button>
                  <Button onClick={handleBulkSubmit} isLoading={isLoading}>Confirmar y Guardar</Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium w-10">Status</th>
                      <th className="px-4 py-3 font-medium">Patente</th>
                      <th className="px-4 py-3 font-medium">N° Interno</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Marca / Modelo</th>
                      <th className="px-4 py-3 font-medium">Año</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.map((row, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-4 py-3">
                          {row.isValid 
                            ? <CheckCircle2 size={18} className="text-green-500" /> 
                            : <AlertCircle size={18} className="text-red-500" title="Faltan datos obligatorios (Patente, N° Interno)" />
                          }
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{row.plate}</td>
                        <td className="px-4 py-3 text-slate-600">{row.internal_number}</td>
                        <td className="px-4 py-3 text-slate-600">{row.type}</td>
                        <td className="px-4 py-3 text-slate-600">{row.brand} {row.model}</td>
                        <td className="px-4 py-3 text-slate-600">{row.year}</td>
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
