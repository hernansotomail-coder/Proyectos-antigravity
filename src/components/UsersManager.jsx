import React, { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { ShieldAlert, Plus, Pencil, Trash2, Key, User } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

export default function UsersManager() {
  const { user } = useAuthStore();
  const { users, isLoading, fetchUsers, addUser, updateUser, deleteUser } = useUserStore();
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'Administrativo' });

  useEffect(() => {
    if (user?.role === 'Administrador') {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  if (user?.role !== 'Administrador') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
        <p className="text-slate-500">Solo el usuario Administrador puede ingresar al mantenedor de usuarios.</p>
      </div>
    );
  }

  const handleEdit = (u) => {
    setEditingId(u.id);
    setFormData({ username: u.username, password: u.password, role: u.role });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ username: '', password: '', role: 'Administrativo' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateUser(editingId, formData);
      setEditingId(null);
    } else {
      await addUser(formData);
    }
    setFormData({ username: '', password: '', role: 'Administrativo' });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Mantenedor de Usuarios</h2>
          <p className="text-sm text-slate-500">Crea o edita credenciales de acceso a la plataforma.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Formulario */}
        <div className="md:col-span-1 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-4">{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
              label="Usuario" 
              value={formData.username} 
              onChange={e => setFormData({...formData, username: e.target.value})} 
              required 
            />
            <Input 
              label="Contraseña" 
              type="text"
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              required 
            />
            <Select 
              label="Rol"
              value={formData.role} 
              onChange={e => setFormData({...formData, role: e.target.value})}
              options={[
                { value: 'Administrador', label: 'Administrador (Acceso Total)' },
                { value: 'Administrativo', label: 'Administrativo (Edita registros)' },
                { value: 'Visualizador', label: 'Visualizador (Solo lectura)' }
              ]}
            />
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {editingId ? 'Actualizar' : 'Crear'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Lista */}
        <div className="md:col-span-2 overflow-auto border border-slate-200 rounded-xl bg-slate-50">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="px-4 py-3 font-semibold border-b">Usuario</th>
                <th className="px-4 py-3 font-semibold border-b">Contraseña</th>
                <th className="px-4 py-3 font-semibold border-b">Rol</th>
                <th className="px-4 py-3 font-semibold border-b text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                    <User size={16} className="text-slate-400" />
                    {u.username}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Key size={14} className="text-slate-400" />
                      {u.password}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      u.role === 'Administrador' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'Administrativo' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEdit(u)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => deleteUser(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                    Cargando usuarios... o no hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
