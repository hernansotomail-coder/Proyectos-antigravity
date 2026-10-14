import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const DEFAULT_APP_USERS = [
  { id: 'usr-1', username: 'superadmin', password: 'superadmin97', role: 'Administrador', can_delete_history: true },
  { id: 'usr-2', username: 'adminkey', password: 'adminkey2026', role: 'Administrativo', can_delete_history: false },
  { id: 'usr-3', username: 'visualkey', password: 'visualkey2026', role: 'Visualizador', can_delete_history: false }
];

const loadPersistedUsers = () => {
  try {
    const saved = localStorage.getItem('keylogistics_app_users');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_APP_USERS;
};

const persistUsers = (data) => {
  try {
    localStorage.setItem('keylogistics_app_users', JSON.stringify(data));
    // Sincronizar mapa de permisos
    const perms = {};
    data.forEach(u => {
      perms[u.username] = { can_delete_history: u.role === 'Administrador' || !!u.can_delete_history };
      if (u.id) perms[u.id] = { can_delete_history: u.role === 'Administrador' || !!u.can_delete_history };
    });
    localStorage.setItem('keylogistics_user_permissions', JSON.stringify(perms));
  } catch (e) {}
};

export const useUserStore = create((set, get) => ({
  users: loadPersistedUsers(),
  isLoading: false,

  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        // Enriquecer con permisos guardados
        const savedPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
        const enriched = data.map(u => ({
          ...u,
          can_delete_history: u.role === 'Administrador' || u.can_delete_history === true || savedPerms[u.username]?.can_delete_history === true
        }));
        persistUsers(enriched);
        set({ users: enriched });
      } else {
        set({ users: loadPersistedUsers() });
      }
    } catch (error) {
      console.warn('Fallback a usuarios locales persistidos:', error);
      set({ users: loadPersistedUsers() });
    } finally {
      set({ isLoading: false });
    }
  },

  addUser: async (userData) => {
    set({ isLoading: true });
    const isSuperOrAdmin = userData.role === 'Administrador' || userData.username === 'superadmin';
    const payload = {
      ...userData,
      can_delete_history: isSuperOrAdmin ? true : !!userData.can_delete_history
    };

    try {
      const { data, error } = await supabase.from('app_users').insert([payload]).select();
      if (error) throw error;
      const newUser = data[0];
      const updated = [...get().users, newUser];
      persistUsers(updated);
      set({ users: updated });
      toast.success('Usuario creado con éxito');
      return true;
    } catch (error) {
      console.warn('Guardando usuario en almacenamiento local:', error);
      const newId = `usr-${Date.now()}`;
      const newUser = { id: newId, ...payload };
      const updated = [...get().users, newUser];
      persistUsers(updated);
      set({ users: updated });
      toast.success('Usuario creado con éxito (localmente)');
      return true;
    } finally {
      set({ isLoading: false });
    }
  },

  updateUser: async (id, updates) => {
    set({ isLoading: true });
    const current = get().users.find(u => u.id === id);
    const isSuperOrAdmin = updates.role === 'Administrador' || current?.role === 'Administrador' || current?.username === 'superadmin';
    const finalUpdates = {
      ...updates,
      can_delete_history: isSuperOrAdmin ? true : (updates.can_delete_history !== undefined ? updates.can_delete_history : current?.can_delete_history)
    };

    try {
      const { error } = await supabase.from('app_users').update(finalUpdates).eq('id', id);
      if (error) console.warn('Supabase update error, guardando en local:', error);
    } catch (error) {
      console.warn(error);
    }

    const updated = get().users.map(u => (u.id === id ? { ...u, ...finalUpdates } : u));
    persistUsers(updated);
    set({ users: updated });
    toast.success('Usuario actualizado con éxito');
    set({ isLoading: false });
    return true;
  },

  toggleDeleteHistoryPermission: async (id) => {
    const target = get().users.find(u => u.id === id);
    if (!target) return;
    if (target.username === 'superadmin' || target.role === 'Administrador') {
      toast.info('Los administradores y superadmin tienen permiso total permanente');
      return;
    }
    const newStatus = !target.can_delete_history;
    await get().updateUser(id, { can_delete_history: newStatus });
    toast.success(`Permiso para eliminar histórico: ${newStatus ? 'Habilitado' : 'Deshabilitado'} para ${target.username}`);
  },

  deleteUser: async (id) => {
    set({ isLoading: true });
    const target = get().users.find(u => u.id === id);
    if (target?.username === 'superadmin') {
      toast.error('No se puede eliminar la cuenta principal de superadmin');
      set({ isLoading: false });
      return false;
    }

    try {
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) console.warn('Supabase delete error, eliminando local:', error);
    } catch (error) {
      console.warn(error);
    }

    const updated = get().users.filter(u => u.id !== id);
    persistUsers(updated);
    set({ users: updated });
    toast.success('Usuario eliminado');
    set({ isLoading: false });
    return true;
  }
}));
