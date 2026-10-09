import React, { useEffect, useState, useMemo } from 'react';
import { Edit2, Trash2, Search, X, Check, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useFleetStore } from '../store/fleetStore';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

const COLUMNS = [
  { key: 'frio', label: 'Frio' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'year', label: 'Año' },
  { key: 'engine_number', label: 'N° Motor' },
  { key: 'chassis_number', label: 'N° Chasis' },
  { key: 'cc', label: 'CC' },
  { key: 'tank_capacity', label: 'Carga Estanque' },
  { key: 'payload', label: 'Carga/Peso' },
  { key: 'state2', label: 'Estado 2' },
  { key: 'rt_date', label: 'RT', type: 'date' },
  { key: 'gases_date', label: 'Gases', type: 'date' },
  { key: 'pc_date', label: 'PC', type: 'date' },
  { key: 'soap_date', label: 'SOAP', type: 'date' },
  { key: 'carnes_date', label: 'Carnes', type: 'date' },
  { key: 'resolution', label: 'Resolución' },
  { key: 'type2', label: 'Tipo 2' },
  { key: 'side_doors', label: 'P. Laterales' },
  { key: 'gps', label: 'GPS' },
  { key: 'operation', label: 'Operación' },
  { key: 'insurer', label: 'Aseguradora' },
  { key: 'region', label: 'Región' },
  { key: 'tct', label: 'TCT' },
  { key: 'tct_copy', label: 'Copia TCT' },
  { key: 'neo_tac', label: 'NEO TAC' },
  { key: 'pallet_capacity', label: 'Cap. Pallet' },
];

export default function ManageFleet() {
  const { fleetList, fetchFleet, updateFleet, deleteFleet, isLoading } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const categorized = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semiremolques';
      
      return { ...f, dashboardCategory: category };
    });
  }, [fleetList]);

  const filteredFleet = categorized.filter(f => {
    if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesPlate = f.plate?.toLowerCase().includes(lowerSearch);
      const matchesInternal = f.internal_number?.toLowerCase().includes(lowerSearch);
      const matchesBrand = f.brand?.toLowerCase().includes(lowerSearch);
      if (!matchesPlate && !matchesInternal && !matchesBrand) return false;
    }
    return true;
  });

  const startEdit = (truck) => {
    setEditingId(truck.id);
    setEditForm(truck);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id) => {
    if (!editForm.plate) {
      toast.error('La patente es obligatoria');
      return;
    }
    
    const { dashboardCategory, ...dataToSave } = editForm;
    const success = await updateFleet(id, dataToSave);
    if (success) {
      setEditingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este vehículo?')) {
      await deleteFleet(id);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-blue-600" />
            Gestión de Flota
          </h2>
          <p className="text-sm text-slate-500 mt-1">Total de vehículos registrados: {fleetList.length}</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
          <Select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'Todos', label: 'Todos los Tipos' },
              { value: 'Camiones/Camionetas', label: 'Camiones/Camionetas' },
              { value: 'Tractos', label: 'Tractos' },
              { value: 'Semiremolques', label: 'Semiremolques' }
            ]}
          />
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar patente o N° interno..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold">Patente</th>
              <th className="px-3 py-2 font-semibold">N° Interno</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold text-center sticky right-0 bg-slate-100 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">Acciones</th>
              {COLUMNS.map(col => <th key={col.key} className="px-3 py-2 font-semibold">{col.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredFleet.length === 0 ? (
              <tr>
                <td colSpan={5 + COLUMNS.length} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron vehículos.
                </td>
              </tr>
            ) : (
              filteredFleet.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-50 transition-colors">
                  {editingId === truck.id ? (
                    <>
                      <td className="px-2 py-1">
                        <select 
                          value={editForm.status || 'Activo'} 
                          onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-1 min-w-[120px]"
                        >
                          <option value="Activo">Activo</option>
                          <option value="Baja">Baja</option>
                          <option value="En Taller">En Taller</option>
                          <option value="Por documentación">Por documentación</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.plate || ''} 
                          onChange={(e) => setEditForm({...editForm, plate: e.target.value.toUpperCase()})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.internal_number || ''} 
                          onChange={(e) => setEditForm({...editForm, internal_number: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.type || ''} 
                          onChange={(e) => setEditForm({...editForm, type: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[100px]"
                        />
                      </td>
                      <td className="px-3 py-1 sticky right-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] border-l border-slate-100">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleSave(truck.id)} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors" title="Guardar"><Check size={16} /></button>
                          <button onClick={cancelEdit} disabled={isLoading} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors" title="Cancelar"><X size={16} /></button>
                        </div>
                      </td>
                      {COLUMNS.map(col => (
                        <td key={col.key} className="px-2 py-1">
                          <input 
                            type={col.type || 'text'}
                            value={editForm[col.key] || ''} 
                            onChange={(e) => setEditForm({...editForm, [col.key]: e.target.value})}
                            className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[100px]"
                          />
                        </td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                          truck.status === 'Activo' ? 'bg-green-100 text-green-700' : 
                          truck.status === 'Baja' ? 'bg-red-100 text-red-700' : 
                          truck.status === 'En Taller' ? 'bg-amber-100 text-amber-700' : 
                          truck.status === 'Por documentación' ? 'bg-orange-100 text-orange-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {truck.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700">{truck.plate}</td>
                      <td className="px-3 py-2 text-slate-600">{truck.internal_number || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{truck.type}</td>
                      <td className="px-3 py-2 sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] border-l border-slate-100 transition-colors">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEdit(truck)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Editar"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(truck.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar"><Trash2 size={16} /></button>
                        </div>
                      </td>
                      {COLUMNS.map(col => (
                        <td key={col.key} className="px-3 py-2 text-slate-600">
                          {truck[col.key] || '-'}
                        </td>
                      ))}
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
