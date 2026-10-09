import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileSpreadsheet, CheckCircle2, AlertCircle, Truck } from 'lucide-react';
import { useFleetStore } from '../store/fleetStore';
import { Select } from './ui/Select';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const parseExcelDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date((val - (25567 + 2)) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    const parts = val.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  return null;
};

const getValue = (row, possibleKeys) => {
  for (const key of Object.keys(row)) {
    if (possibleKeys.includes(key.toLowerCase().trim())) {
      return row[key];
    }
  }
  return null;
};

const initialFormData = {
  type: 'Camión', plate: '', internal_number: '', brand: '', model: '', year: '', status: 'Activo',
  frio: '', engine_number: '', chassis_number: '', cc: '', tank_capacity: '', payload: '', state2: '',
  rt_date: '', gases_date: '', pc_date: '', soap_date: '', carnes_date: '', resolution: '', type2: '',
  side_doors: '', gps: '', operation: '', insurer: '', region: '', tct: '', tct_copy: '', neo_tac: '', pallet_capacity: ''
};

export default function AddFleet() {
  const { addFleetBulk, isLoading } = useFleetStore();
  const [activeTab, setActiveTab] = useState('manual');
  const [fleetCategory, setFleetCategory] = useState('Camiones/Camionetas'); // 'Camiones/Camionetas', 'Tractos', 'Semiremolques'
  const [previewData, setPreviewData] = useState(null);
  const [formData, setFormData] = useState(initialFormData);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.plate) {
      toast.error('La patente es obligatoria');
      return;
    }
    
    let submitType = formData.type;
    if (fleetCategory === 'Tractos') submitType = 'Tracto';
    else if (fleetCategory === 'Semiremolques' && !submitType.includes('Rampla') && !submitType.includes('Semiremolque')) submitType = 'Semiremolque';

    const success = await addFleetBulk([{ ...formData, type: submitType }]);
    if (success) {
      setFormData(initialFormData);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet);

      const mappedData = json.map(row => {
        const cleanPlate = getValue(row, ['patente']);
        const rawInternal = getValue(row, ['interno', 'n*interno', 'n°interno', 'numero']);
        let rawStatus = getValue(row, ['estado', 'status', 'vigencia']) || 'Activo';
        
        let typeVal = getValue(row, ['tipo']);
        if (!typeVal) {
          if (fleetCategory === 'Tractos') typeVal = 'Tracto';
          else if (fleetCategory === 'Semiremolques') typeVal = 'Semiremolque';
          else typeVal = 'Camión';
        }

        return {
          type: String(typeVal).trim(),
          plate: cleanPlate != null ? String(cleanPlate).toUpperCase().trim() : '',
          internal_number: rawInternal != null ? String(rawInternal).trim() : 'S/N',
          brand: getValue(row, ['marca'])?.toString() || null,
          model: getValue(row, ['modelo'])?.toString() || null,
          year: getValue(row, ['año', 'ano'])?.toString() || null,
          status: String(rawStatus).trim(),
          frio: getValue(row, ['frio', 'frío'])?.toString() || null,
          engine_number: getValue(row, ['n° motor', 'n motor', 'motor'])?.toString() || null,
          chassis_number: getValue(row, ['n° chasis', 'n chasis', 'chasis'])?.toString() || null,
          cc: getValue(row, ['cc'])?.toString() || null,
          tank_capacity: getValue(row, ['carga estanque', 'capacidad de estanque'])?.toString() || null,
          payload: getValue(row, ['carga -peso', 'carga peso', 'peso'])?.toString() || null,
          state2: getValue(row, ['estado2'])?.toString() || null,
          rt_date: parseExcelDate(getValue(row, ['rt', 'revision', 'revisión'])),
          gases_date: parseExcelDate(getValue(row, ['gases'])),
          pc_date: parseExcelDate(getValue(row, ['pc'])),
          soap_date: parseExcelDate(getValue(row, ['soap'])),
          carnes_date: parseExcelDate(getValue(row, ['carnes'])),
          resolution: getValue(row, ['resolucion', 'resolución'])?.toString() || null,
          type2: getValue(row, ['tipo2'])?.toString() || null,
          side_doors: getValue(row, ['puertas laterales'])?.toString() || null,
          gps: getValue(row, ['gps'])?.toString() || null,
          operation: getValue(row, ['operación', 'operacion'])?.toString() || null,
          insurer: getValue(row, ['aseguradora'])?.toString() || null,
          region: getValue(row, ['region', 'región'])?.toString() || null,
          tct: getValue(row, ['tct'])?.toString() || null,
          tct_copy: getValue(row, ['copia tct'])?.toString() || null,
          neo_tac: getValue(row, ['neo tac', 'neotac'])?.toString() || null,
          pallet_capacity: getValue(row, ['capacidad pallet', 'pallets'])?.toString() || null,
          isValid: !!cleanPlate
        };
      });

      setPreviewData(mappedData);
    } catch (error) {
      console.error(error);
      toast.error('Error al leer el archivo Excel');
    }
  }, [fleetCategory]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    multiple: false
  });

  const handleBulkSubmit = async () => {
    const validData = previewData.filter(d => d.isValid).map(d => {
      const { isValid, ...rest } = d;
      return rest;
    });

    if (validData.length === 0) {
      toast.error('No hay datos válidos para cargar');
      return;
    }

    const uniqueData = [];
    const seen = new Set();
    for (let i = validData.length - 1; i >= 0; i--) {
      if (!seen.has(validData[i].plate)) {
        seen.add(validData[i].plate);
        uniqueData.push(validData[i]);
      }
    }

    const success = await addFleetBulk(uniqueData);
    if (success) setPreviewData(null);
  };

  const suggestCols = () => {
    if (fleetCategory === 'Camiones/Camionetas') return 'Tipo, Patente, N*Interno, Frio, Marca, Modelo, Año, Disponibilidad, N° Motor, N° Chasis, CC, Carga Estanque, Carga -Peso, Estado2, RT, Gases, PC, SOAP, Carnes, Resolucion, Tipo2, Puertas Laterales, GPS, Operación, Aseguradora, Region, TCT, Copia TCT, NEO TAC';
    if (fleetCategory === 'Tractos') return 'Tipo, Patente, N*Interno, Frio, Marca, Modelo, Año, N° Motor, N° chasis, Carga -Peso, Estado2, RT, PC, SOAP, Carnes, Resolucion, Tipo2, Capacidad Pallet, GPS, Operación, Aseguradora, Region, TCT, Capacidad de Estanque';
    return 'Tipo, Patente, N*Interno, Frio, Marca, Modelo, Año, N° Motor, N° chasis, Carga -Peso, Estado2, RT, PC, SOAP, Carnes, Resolucion, Tipo2, Capacidad Pallet, GPS, Operación, Aseguradora, Region, TCT, Capacidad de Estanque';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex gap-2">
        {['Camiones/Camionetas', 'Tractos', 'Semiremolques'].map(cat => (
          <button
            key={cat}
            onClick={() => setFleetCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              fleetCategory === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex border-b border-slate-200">
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'manual' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('manual')}
        >
          Carga Manual
          {activeTab === 'manual' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${activeTab === 'bulk' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('bulk')}
        >
          Carga Masiva (Excel)
          {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Truck className="text-blue-600" />
            Agregar {fleetCategory}
          </h2>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Patente *" placeholder="Ej. AB-CD-12" value={formData.plate} onChange={(e) => setFormData({...formData, plate: e.target.value})} required />
            <Input label="N° Interno" placeholder="Ej. 1045" value={formData.internal_number} onChange={(e) => setFormData({...formData, internal_number: e.target.value})} />
            <Input label="Marca" placeholder="Ej. Volvo" value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} />
            <Input label="Modelo" value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} />
            <Input label="Año" type="number" value={formData.year} onChange={(e) => setFormData({...formData, year: e.target.value})} />
            <Input label="Región" value={formData.region} onChange={(e) => setFormData({...formData, region: e.target.value})} />
            <Select label="Estado" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} options={[{ value: 'Activo', label: 'Activo' }, { value: 'Baja', label: 'Baja' }, { value: 'En Taller', label: 'En Taller' }, { value: 'Por documentación', label: 'Por documentación' }]} required />
            <Input label="Revisión Técnica (RT)" type="date" value={formData.rt_date} onChange={(e) => setFormData({...formData, rt_date: e.target.value})} />
            <Input label="Gases" type="date" value={formData.gases_date} onChange={(e) => setFormData({...formData, gases_date: e.target.value})} />
            <Input label="PC" type="date" value={formData.pc_date} onChange={(e) => setFormData({...formData, pc_date: e.target.value})} />
            <Input label="SOAP" type="date" value={formData.soap_date} onChange={(e) => setFormData({...formData, soap_date: e.target.value})} />
            <Input label="Carnes" type="date" value={formData.carnes_date} onChange={(e) => setFormData({...formData, carnes_date: e.target.value})} />
            
            <div className="md:col-span-3 pt-4">
              <Button type="submit" isLoading={isLoading}>Guardar Vehículo</Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          {!previewData ? (
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center text-slate-500">
                <FileSpreadsheet size={48} className="mb-4 text-slate-400" />
                <p className="text-lg font-medium text-slate-700">Sube el Excel para {fleetCategory}</p>
                <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-left text-xs text-yellow-800">
                  <span className="font-semibold block mb-1">Columnas que leerá el sistema:</span>
                  {suggestCols()}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-800">Vista Previa ({previewData.length} registros para {fleetCategory})</h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPreviewData(null)}>Cancelar</Button>
                  <Button onClick={handleBulkSubmit} isLoading={isLoading}>Confirmar y Guardar</Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Patente</th>
                      <th className="px-3 py-2">N° Interno</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Región</th>
                      <th className="px-3 py-2">RT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.map((row, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-3 py-2">
                          {row.isValid ? <CheckCircle2 size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-red-500" />}
                        </td>
                        <td className="px-3 py-2 font-bold">{row.plate}</td>
                        <td className="px-3 py-2">{row.internal_number}</td>
                        <td className="px-3 py-2">{row.type}</td>
                        <td className="px-3 py-2">{row.region}</td>
                        <td className="px-3 py-2">{row.rt_date}</td>
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
