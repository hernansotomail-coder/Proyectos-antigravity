import React, { useEffect, useState } from 'react';
import { useUserStore, APP_MODULES, ALL_MENU_KEYS, getDefaultPermissionsForRole } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { ShieldAlert, Plus, Pencil, Trash2, Key, User, Check, X, Shield, Lock, Eye, Edit3 } from 'lucide-react';
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
    can_delete_history: false,
    menus: getDefaultPermissionsForRole('Administrativo').menus
  });

  useEffect(() => {
    if (user?.role === 'Administrador' || user?.username === 'superadmin') {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  if (user?.role !== 'Administrador' && user?.username !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <ShieldAlert size={64} className="text-red-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
        <p className="text-slate-500">Solo el usuario Administrador o Superadmin puede ingresar al mantenedor de usuarios y permisos.</p>
      </div>
    );
  }

  const handleEdit = (u) => {
    setEditingId(u.id);
    const userMenus = u.permissions?.menus || getDefaultPermissionsForRole(u.role).menus;
    setFormData({ 
      username: u.username, 
      password: u.password, 
      role: u.role,
      can_delete_history: u.role === 'Administrador' || u.username === 'superadmin' || !!u.can_delete_history,
      menus: userMenus
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ 
      username: '', 
      password: '', 
      role: 'Administrativo', 
      can_delete_history: false,
      menus: getDefaultPermissionsForRole('Administrativo').menus
    });
  };

  const handleRoleChange = (newRole) => {
    const defaults = getDefaultPermissionsForRole(newRole);
    setFormData(prev => ({
      ...prev,
      role: newRole,
      can_delete_history: newRole === 'Administrador' ? true : prev.can_delete_history,
      menus: defaults.menus
    }));
  };

  const handleToggleMenuView = (menuKey) => {
    setFormData(prev => {
      const current = prev.menus?.[menuKey] || { view: false, edit: false };
      const nextView = !current.view;
      return {
        ...prev,
        menus: {
          ...prev.menus,
          [menuKey]: {
            view: nextView,
            edit: nextView ? current.edit : false // Si no puede ver, tampoco puede editar
          }
        }
      };
    });
  };

  const handleToggleMenuEdit = (menuKey) => {
    setFormData(prev => {
      const current = prev.menus?.[menuKey] || { view: false, edit: false };
      const nextEdit = !current.edit;
      return {
        ...prev,
        menus: {
          ...prev.menus,
          [menuKey]: {
            view: nextEdit ? true : current.view, // Si puede editar, automáticamente puede ver
            edit: nextEdit
          }
        }
      };
    });
  };

  const handleSetAllMenus = (viewVal, editVal) => {
    setFormData(prev => {
      const newMenus = {};
      ALL_MENU_KEYS.forEach(k => {
        newMenus[k] = { view: viewVal, edit: editVal };
      });
      return { ...prev, menus: newMenus };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateUser(editingId, formData);
      setEditingId(null);
    } else {
      await addUser(formData);
    }
    setFormData({ 
      username: '', 
      password: '', 
      role: 'Administrativo', 
      can_delete_history: false,
      menus: getDefaultPermissionsForRole('Administrativo').menus
    });
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
      
      {/* Encabezado */}
      <div className="flex justify-between items-center mb-4 shrink-0 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-purple-100 text-purple-800 text-xs font-black px-2.5 py-0.5 rounded-full">
              Seguridad y Control
            </span>
            <h2 className="text-lg font-black text-slate-800">Mantenedor de Usuarios y Permisos de Menú</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Crea credenciales sincronizadas en Supabase y selecciona de forma granular los menús que cada usuario puede Ver y Editar.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden">
        
        {/* Formulario de Creación / Edición (5 columnas en pantallas grandes) */}
        <div className="lg:col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <User size={16} className="text-blue-600" />
              <span>{editingId ? 'Editar Credenciales y Permisos' : 'Crear Nuevo Usuario'}</span>
            </h3>
            {editingId && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                Modo edición
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col">
            <div className="grid grid-cols-2 gap-2.5">
              <Input 
                label="Usuario (Login)" 
                value={formData.username} 
                onChange={e => setFormData({...formData, username: e.target.value})} 
                placeholder="Ej: jgonzalez"
                required 
              />
              <Input 
                label="Contraseña" 
                type="text"
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                placeholder="Clave de acceso"
                required 
              />
            </div>

            <Select 
              label="Perfil / Rol"
              value={formData.role} 
              onChange={e => handleRoleChange(e.target.value)}
              options={[
                { value: 'Administrador', label: 'Administrador (Acceso y Edición Total)' },
                { value: 'Administrativo', label: 'Administrativo (Personalizable)' },
                { value: 'Visualizador', label: 'Visualizador (Solo Lectura)' }
              ]}
            />

            {/* Selector de Permisos de Menú (Requisito 4) */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  Permisos por Menú (Ver / Editar)
                </span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleSetAllMenus(true, true)}
                    className="text-blue-600 hover:underline font-bold"
                  >
                    Todos
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllMenus(true, false)}
                    className="text-amber-600 hover:underline font-bold"
                  >
                    Solo Ver
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllMenus(false, false)}
                    className="text-red-600 hover:underline font-bold"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Matriz de módulos */}
              <div className="space-y-3 overflow-y-auto max-h-56 pr-1 text-xs">
                {APP_MODULES.map(mod => (
                  <div key={mod.module} className="border border-slate-100 rounded-lg p-2 bg-slate-50/60 space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                      {mod.module}
                    </span>
                    <div className="space-y-1">
                      {mod.menus.map(menuItem => {
                        const perm = formData.menus?.[menuItem.key] || { view: false, edit: false };
                        return (
                          <div 
                            key={menuItem.key}
                            className="flex items-center justify-between p-1 rounded hover:bg-white text-slate-700 transition-colors"
                          >
                            <span className="font-medium text-[11px] truncate max-w-[150px]" title={menuItem.label}>
                              {menuItem.label}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold text-blue-800">
                                <input
                                  type="checkbox"
                                  checked={perm.view}
                                  onChange={() => handleToggleMenuView(menuItem.key)}
                                  className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                />
                                <span>Ver</span>
                              </label>

                              <label className={`flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold ${
                                perm.view ? 'text-indigo-800' : 'text-slate-300 pointer-events-none'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={perm.edit}
                                  disabled={!perm.view}
                                  onChange={() => handleToggleMenuEdit(menuItem.key)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 disabled:opacity-40"
                                />
                                <span>Editar</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permiso Especial: Eliminar filas en histórico */}
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={formData.role === 'Administrador' ? true : formData.can_delete_history}
                  disabled={formData.role === 'Administrador'}
                  onChange={e => setFormData({...formData, can_delete_history: e.target.checked})}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Permiso: Eliminar Registros en Histórico</span>
                  <span className="text-[10px] text-slate-400">
                    {formData.role === 'Administrador' 
                      ? 'Administrador siempre tiene este permiso activo.' 
                      : 'Permite borrar registros de auditoría en Histórico de cambios.'}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex gap-2 pt-2 shrink-0">
              <Button type="submit" className="flex-1 text-xs font-bold py-2" disabled={isLoading}>
                {editingId ? 'Actualizar Usuario' : 'Crear y Sincronizar Usuario'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={handleCancel} className="text-xs">
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Lista de Usuarios Registrados (7 columnas en pantallas grandes) */}
        <div className="lg:col-span-7 border border-slate-200 rounded-2xl bg-white flex flex-col min-h-0 overflow-hidden shadow-2xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="font-bold text-xs text-slate-700">Usuarios Registrados en Sistema</span>
            <span className="text-[11px] text-slate-500 font-semibold">{users.length} cuentas activas</span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wider select-none">
                <tr>
                  <th className="px-3 py-2.5">Usuario</th>
                  <th className="px-3 py-2.5">Contraseña</th>
                  <th className="px-3 py-2.5">Rol</th>
                  <th className="px-3 py-2.5 text-center">Menús Permitidos</th>
                  <th className="px-3 py-2.5 text-center">Eliminar Hist.</th>
                  <th className="px-3 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {users.map(u => {
                  const isSuper = u.username === 'superadmin' || u.role === 'Administrador';
                  const userMenus = u.permissions?.menus || getDefaultPermissionsForRole(u.role).menus;
                  const viewCount = isSuper ? ALL_MENU_KEYS.length : Object.values(userMenus).filter(p => p.view).length;
                  const editCount = isSuper ? ALL_MENU_KEYS.length : Object.values(userMenus).filter(p => p.edit).length;
                  const hasDeletePerm = isSuper || !!u.can_delete_history;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      {/* Usuario */}
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className={isSuper ? "text-purple-600" : "text-slate-400"} />
                          <span>{u.username}</span>
                          {u.username === 'superadmin' && (
                            <span className="text-[9px] bg-purple-100 text-purple-800 font-black px-1.5 py-0.2 rounded">
                              MASTER
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Contraseña */}
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Key size={11} className="text-slate-400 shrink-0" />
                          <span>{u.password}</span>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          u.role === 'Administrador' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          u.role === 'Administrativo' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Menús Permitidos */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 font-bold px-1.5 py-0.2 rounded text-[10px]" title="Menús con permiso de visualización">
                            {viewCount}/{ALL_MENU_KEYS.length} Ver
                          </span>
                          <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold px-1.5 py-0.2 rounded text-[10px]" title="Menús con permiso de edición">
                            {editCount}/{ALL_MENU_KEYS.length} Edit
                          </span>
                        </div>
                      </td>

                      {/* Eliminar Histórico */}
                      <td className="px-3 py-2.5 text-center">
                        {isSuper ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Total
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleDeleteHistoryPermission(u.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                              hasDeletePerm 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Clic para cambiar permiso"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${hasDeletePerm ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                            {hasDeletePerm ? 'Sí' : 'No'}
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            type="button"
                            onClick={() => handleEdit(u)} 
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                            title="Editar credenciales y permisos"
                          >
                            <Pencil size={13} />
                          </button>
                          {u.username !== 'superadmin' && (
                            <button 
                              type="button"
                              onClick={() => deleteUser(u.id)} 
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors" 
                              title="Eliminar usuario"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      No hay usuarios registrados o cargando...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
