import React, { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { ShieldAlert, Plus, Pencil, Trash2, Key, User } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

export default function UsersManager() {
  const { user } = useAuthStore();
  const { users, isLoading, fetchUsers, addUser, updateUser, deleteUser, toggleDeleteHistoryPermission } = useUserStore();
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ 
    username: '', 
    password: '', 
    role: 'Administrativo',
    can_delete_history: false 
  });

  useEffect(() => {
    if (user?.role === 'Administrador' || user?.username === 'superadmin') {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  if (user?.role !== 'Administrador' && user?.username !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
        <p className="text-slate-500">Solo el usuario Administrador o Superadmin puede ingresar al mantenedor de usuarios.</p>
      </div>
    );
  }

  const handleEdit = (u) => {
    setEditingId(u.id);
    setFormData({ 
      username: u.username, 
      password: u.password, 
      role: u.role,
      can_delete_history: u.role === 'Administrador' || !!u.can_delete_history
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ username: '', password: '', role: 'Administrativo', can_delete_history: false });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateUser(editingId, formData);
      setEditingId(null);
    } else {
      await addUser(formData);
    }
    setFormData({ username: '', password: '', role: 'Administrativo', can_delete_history: false });
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Mantenedor de Usuarios y Permisos</h2>
          <p className="text-sm text-slate-500">Crea credenciales y gestiona permisos de eliminación en Histórico de Cambios.</p>
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
              onChange={e => setFormData({
                ...formData, 
                role: e.target.value,
                can_delete_history: e.target.value === 'Administrador' ? true : formData.can_delete_history
              })}
              options={[
                { value: 'Administrador', label: 'Administrador (Acceso y Eliminación Total)' },
                { value: 'Administrativo', label: 'Administrativo (Edita registros)' },
                { value: 'Visualizador', label: 'Visualizador (Solo lectura)' }
              ]}
            />

            {/* Permiso para eliminar histórico */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={formData.role === 'Administrador' ? true : formData.can_delete_history}
                  disabled={formData.role === 'Administrador'}
                  onChange={e => setFormData({...formData, can_delete_history: e.target.checked})}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Permiso: Eliminar Filas en Histórico</span>
                  <span className="text-[11px] text-slate-500">
                    {formData.role === 'Administrador' 
                      ? 'Los administradores siempre tienen este permiso activo.' 
                      : 'Permite al usuario borrar registros de auditoría en Histórico de cambios.'}
                  </span>
                </div>
              </label>
            </div>

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
                <th className="px-3.5 py-3 font-semibold border-b">Usuario</th>
                <th className="px-3 py-3 font-semibold border-b">Contraseña</th>
                <th className="px-3 py-3 font-semibold border-b">Rol</th>
                <th className="px-3 py-3 font-semibold border-b text-center">Eliminar Histórico</th>
                <th className="px-3.5 py-3 font-semibold border-b text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map(u => {
                const isSuper = u.username === 'superadmin' || u.role === 'Administrador';
                const hasDeletePerm = isSuper || !!u.can_delete_history;

                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-3 font-medium text-slate-800 flex items-center gap-2">
                      <User size={16} className={isSuper ? "text-purple-600" : "text-slate-400"} />
                      <span className={isSuper ? "font-bold text-slate-900" : ""}>{u.username}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <Key size={13} className="text-slate-400" />
                        {u.password}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        u.role === 'Administrador' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                        u.role === 'Administrativo' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isSuper ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Total (Admin)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleDeleteHistoryPermission(u.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                            hasDeletePerm 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                          title="Clic para cambiar permiso de eliminación en histórico"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${hasDeletePerm ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                          {hasDeletePerm ? 'Permitido' : 'Denegado'}
                        </button>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button 
                          onClick={() => handleEdit(u)} 
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                          title="Editar usuario"
                        >
                          <Pencil size={15} />
                        </button>
                        {u.username !== 'superadmin' && (
                          <button 
                            onClick={() => deleteUser(u.id)} 
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                            title="Eliminar usuario"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
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
