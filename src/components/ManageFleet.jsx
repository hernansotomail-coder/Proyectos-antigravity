import React, { useEffect, useState } from 'react';
import { Edit2, Trash2, Search, X, Check, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useFleetStore } from '../store/fleetStore';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';

export default function ManageFleet() {
  const { fleetList, fetchFleet, updateFleet, deleteFleet, isLoading } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const filteredFleet = fleetList.filter(f => 
    f.plate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.internal_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    
    const success = await updateFleet(id, editForm);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-blue-600" />
            Gestión de Flota
          </h2>
          <p className="text-sm text-slate-500 mt-1">Total de vehículos registrados: {fleetList.length}</p>
        </div>
        
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar patente o N° interno..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-medium">Patente</th>
              <th className="px-4 py-3 font-medium">N° Interno</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Marca</th>
              <th className="px-4 py-3 font-medium">Modelo</th>
              <th className="px-4 py-3 font-medium">Año</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredFleet.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                  No se encontraron vehículos.
                </td>
              </tr>
            ) : (
              filteredFleet.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-50 transition-colors">
                  {editingId === truck.id ? (
                    <>
                      <td className="px-2 py-2">
                        <Input 
                          value={editForm.plate} 
                          onChange={(e) => setEditForm({...editForm, plate: e.target.value.toUpperCase()})}
                          className="h-8 text-xs min-w-[100px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input 
                          value={editForm.internal_number || ''} 
                          onChange={(e) => setEditForm({...editForm, internal_number: e.target.value})}
                          className="h-8 text-xs min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select 
                          value={editForm.type} 
                          onChange={(e) => setEditForm({...editForm, type: e.target.value})}
                          options={[{value:'Camión', label:'Camión'},{value:'Rampla', label:'Rampla'},{value:'Tracto', label:'Tracto'},{value:'Furgón', label:'Furgón'}]}
                          className="h-8 text-xs py-1 min-w-[110px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input 
                          value={editForm.brand || ''} 
                          onChange={(e) => setEditForm({...editForm, brand: e.target.value})}
                          className="h-8 text-xs min-w-[100px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input 
                          value={editForm.model || ''} 
                          onChange={(e) => setEditForm({...editForm, model: e.target.value})}
                          className="h-8 text-xs min-w-[100px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input 
                          value={editForm.year || ''} 
                          type="number"
                          onChange={(e) => setEditForm({...editForm, year: e.target.value})}
                          className="h-8 text-xs min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select 
                          value={editForm.status} 
                          onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                          options={[{value:'Activo', label:'Activo'},{value:'Baja', label:'Baja'},{value:'En Taller', label:'En Taller'},{value:'Por documentación', label:'Por documentación'}]}
                          className="h-8 text-xs py-1 min-w-[130px]"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleSave(truck.id)}
                            disabled={isLoading}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Guardar"
                          >
                            <Check size={18} />
                          </button>
                          <button 
                            onClick={cancelEdit}
                            disabled={isLoading}
                            className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {truck.plate}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{truck.internal_number || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{truck.type}</td>
                      <td className="px-4 py-3 text-slate-600">{truck.brand || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{truck.model || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{truck.year || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          truck.status === 'Activo' ? 'bg-green-100 text-green-700' : 
                          truck.status === 'Baja' ? 'bg-red-100 text-red-700' : 
                          truck.status === 'En Taller' ? 'bg-amber-100 text-amber-700' : 
                          truck.status === 'Por documentación' ? 'bg-orange-100 text-orange-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {truck.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => startEdit(truck)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(truck.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
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
