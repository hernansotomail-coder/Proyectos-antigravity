import React, { useEffect, useState, useMemo } from 'react';
import { useStaffStore } from '../store/staffStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Search, Edit2, UserX, UserCheck, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

export default function ManageStaff() {
  const { staffList, fetchStaff, isLoading } = useStaffStore();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [editingStaff, setEditingStaff] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Filter Logic
  const filteredStaff = useMemo(() => {
    if (!searchTerm) return staffList;
    const lowerTerm = searchTerm.toLowerCase();
    return staffList.filter(
      (staff) => 
        staff.name.toLowerCase().includes(lowerTerm) || 
        staff.rut.toLowerCase().includes(lowerTerm)
    );
  }, [staffList, searchTerm]);

  // Actions
  const handleEditClick = (staff) => {
    setEditingStaff({ ...staff });
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (staff) => {
    const newStatus = staff.status === 'Activo' ? 'Inactivo' : 'Activo';
    if (!window.confirm(`¿Seguro que deseas cambiar el estado de ${staff.name} a ${newStatus}?`)) return;

    try {
      const { error } = await supabase
        .from('staff')
        .update({ status: newStatus })
        .eq('id', staff.id);

      if (error) throw error;
      toast.success('Estado actualizado correctamente');
      fetchStaff();
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el estado');
    }
  };

  const handleDelete = async (staff) => {
    if (!window.confirm(`¿Estás TOTALMENTE SEGURO de eliminar a ${staff.name}? Esta acción borrará también todo su historial de asistencia y no se puede deshacer.`)) return;

    try {
      // 1. Borrar historial de asistencia asociado por si acaso (para evitar error de Foreign Key)
      await supabase.from('attendance').delete().eq('staff_id', staff.id);
      
      // 2. Borrar empleado
      const { error } = await supabase.from('staff').delete().eq('id', staff.id);
      if (error) throw error;
      
      toast.success('Empleado eliminado permanentemente');
      fetchStaff();
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar empleado');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('staff')
        .update({
          name: editingStaff.name,
          role: editingStaff.role,
          status: editingStaff.status
        })
        .eq('id', editingStaff.id);

      if (error) throw error;
      
      toast.success('Datos actualizados correctamente');
      setIsModalOpen(false);
      fetchStaff();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar los cambios');
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Gestión de Dotación</h2>
        
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent sm:text-sm transition-colors"
            placeholder="Buscar por nombre o RUT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">RUT</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && staffList.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                  Cargando dotación...
                </td>
              </tr>
            ) : filteredStaff.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                  No se encontraron registros
                </td>
              </tr>
            ) : (
              filteredStaff.map((staff) => (
                <tr key={staff.id} className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 font-medium">{staff.rut}</td>
                  <td className="px-4 py-3 text-slate-900">{staff.name}</td>
                  <td className="px-4 py-3 text-slate-600">{staff.role}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      staff.status === 'Activo' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {staff.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleEditClick(staff)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(staff)}
                        className={`p-1.5 rounded-md transition-colors ${
                          staff.status === 'Activo' 
                            ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' 
                            : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                        title={staff.status === 'Activo' ? "Dar de baja" : "Reactivar"}
                      >
                        {staff.status === 'Activo' ? <UserX size={18} /> : <UserCheck size={18} />}
                      </button>
                      <button 
                        onClick={() => handleDelete(staff)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Eliminar permanentemente"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Edición */}
      {isModalOpen && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h3 className="font-semibold text-lg text-slate-800">Editar Empleado</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-4 space-y-4">
              <Input 
                label="RUT" 
                value={editingStaff.rut}
                disabled
                className="bg-slate-50 cursor-not-allowed"
                title="El RUT no se puede modificar"
              />
              <Input 
                label="Nombre Completo" 
                value={editingStaff.name}
                onChange={(e) => setEditingStaff({...editingStaff, name: e.target.value})}
                required
              />
              <Select 
                label="Cargo"
                value={editingStaff.role}
                onChange={(e) => setEditingStaff({...editingStaff, role: e.target.value})}
                options={[
                  { value: 'Conductor', label: 'Conductor' },
                  { value: 'Auxiliar', label: 'Auxiliar' },
                  { value: 'Movilizador', label: 'Movilizador' }
                ]}
                required
              />
              <Select 
                label="Estado"
                value={editingStaff.status}
                onChange={(e) => setEditingStaff({...editingStaff, status: e.target.value})}
                options={[
                  { value: 'Activo', label: 'Activo' },
                  { value: 'Inactivo', label: 'Inactivo' }
                ]}
              />
              
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
