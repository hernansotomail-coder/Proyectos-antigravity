import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

// Definición centralizada de módulos y menús del sistema
export const APP_MODULES = [
  {
    module: 'Planificación',
    menus: [
      { key: 'daily-planning', label: 'Asignación diaria', path: '/daily-planning' },
      { key: 'ruteo', label: 'Ruteo', path: '/ruteo' },
      { key: 'change-history', label: 'Histórico de cambios', path: '/change-history' },
      { key: 'briefing', label: 'Briefing', path: '/briefing' },
    ]
  },
  {
    module: 'Transporte',
    menus: [
      { key: 'assignment', label: 'Disponibilización', path: '/assignment' },
      { key: 'historical-assignment', label: 'Histórico disponibilización', path: '/historical-assignment' },
      { key: 'route-dispatch', label: 'Envío de rutas', path: '/route-dispatch' },
    ]
  },
  {
    module: 'Gestión de Flota',
    menus: [
      { key: 'fleet-dashboard', label: 'Dashboard Flota', path: '/fleet-dashboard' },
      { key: 'wash-dashboard', label: 'Dashboard de lavados', path: '/wash-dashboard' },
      { key: 'fleet', label: 'Agregar Flota', path: '/fleet' },
      { key: 'manage-fleet', label: 'Gestión Flota', path: '/manage-fleet' },
      { key: 'fleet-washes', label: 'Lavados', path: '/fleet-washes' },
    ]
  },
  {
    module: 'Administración Dotación',
    menus: [
      { key: 'dashboard', label: 'Dashboard', path: '/' },
      { key: 'add-staff', label: 'Agregar Dotación', path: '/add-staff' },
      { key: 'manage-staff', label: 'Gestión Dotación', path: '/manage-staff' },
      { key: 'attendance', label: 'Asistencia', path: '/attendance' },
      { key: 'users', label: 'Usuarios (Mantenedor)', path: '/users' },
    ]
  }
];

export const ALL_MENU_KEYS = APP_MODULES.flatMap(m => m.menus.map(i => i.key));

// Generador de plantilla de permisos según rol
export const getDefaultPermissionsForRole = (role) => {
  const menus = {};
  ALL_MENU_KEYS.forEach(k => {
    if (role === 'Administrador') {
      menus[k] = { view: true, edit: true };
    } else if (role === 'Visualizador') {
      const canView = ['dashboard', 'fleet-dashboard', 'wash-dashboard', 'change-history', 'briefing', 'historical-assignment'].includes(k);
      menus[k] = { view: canView, edit: false };
    } else {
      // Administrativo
      const isUsers = k === 'users';
      menus[k] = { view: !isUsers, edit: !isUsers };
    }
  });
  return {
    can_delete_history: role === 'Administrador',
    menus
  };
};

const DEFAULT_APP_USERS = [
  { id: 'usr-1', username: 'superadmin', password: 'superadmin97', role: 'Administrador', can_delete_history: true },
  { id: 'usr-2', username: 'adminkey', password: 'adminkey2026', role: 'Administrativo', can_delete_history: false },
  { id: 'usr-3', username: 'visualkey', password: 'visualkey2026', role: 'Visualizador', can_delete_history: false }
];

export const persistUserPermissionsToDb = async (permissionsMap) => {
  try {
    await supabase
      .from('planning_assignments')
      .upsert({
        fecha: '__user_permissions__',
        assignments: permissionsMap,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha' });
  } catch (e) {
    console.warn('Error guardando permisos en Supabase:', e);
  }
};

export const fetchUserPermissionsFromDb = async () => {
  try {
    const { data, error } = await supabase
      .from('planning_assignments')
      .select('*')
      .eq('fecha', '__user_permissions__')
      .maybeSingle();
    if (error) return null;
    return data?.assignments || null;
  } catch (e) {
    return null;
  }
};

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
    const perms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
    data.forEach(u => {
      perms[u.username] = {
        can_delete_history: u.role === 'Administrador' || !!u.can_delete_history,
        menus: u.permissions?.menus || perms[u.username]?.menus || getDefaultPermissionsForRole(u.role).menus
      };
      if (u.id) {
        perms[u.id] = perms[u.username];
      }
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
      const [usersRes, permsDb] = await Promise.all([
        supabase.from('app_users').select('*').order('created_at', { ascending: true }),
        fetchUserPermissionsFromDb()
      ]);

      const localPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      const mergedPerms = { ...localPerms, ...(permsDb || {}) };
      try {
        localStorage.setItem('keylogistics_user_permissions', JSON.stringify(mergedPerms));
      } catch (e) {}

      if (usersRes.data && usersRes.data.length > 0) {
        const enriched = usersRes.data.map(u => {
          const userPerm = mergedPerms[u.username] || (u.id && mergedPerms[u.id]) || getDefaultPermissionsForRole(u.role);
          return {
            ...u,
            permissions: userPerm,
            can_delete_history: u.role === 'Administrador' || u.username === 'superadmin' || !!userPerm.can_delete_history
          };
        });
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
    const cleanUser = String(userData.username || '').trim();
    const cleanPass = String(userData.password || '').trim();

    // Payload EXACTO para columnas existentes en tabla app_users (id, username, password, role)
    const dbPayload = {
      username: cleanUser,
      password: cleanPass,
      role: userData.role
    };

    const defaultPerms = getDefaultPermissionsForRole(userData.role);
    const userPerms = {
      can_delete_history: isSuperOrAdmin ? true : !!userData.can_delete_history,
      menus: userData.menus || defaultPerms.menus
    };

    try {
      const { data, error } = await supabase.from('app_users').insert([dbPayload]).select();
      if (error) throw error;
      const newUser = {
        ...data[0],
        permissions: userPerms,
        can_delete_history: userPerms.can_delete_history
      };

      // Guardar mapa de permisos en Supabase DB
      const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      currentPerms[cleanUser] = userPerms;
      if (newUser.id) currentPerms[newUser.id] = userPerms;
      localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));
      persistUserPermissionsToDb(currentPerms);

      const updated = [...get().users.filter(u => u.username !== cleanUser), newUser];
      persistUsers(updated);
      set({ users: updated });
      toast.success(`Usuario "${cleanUser}" creado y sincronizado con éxito`);
      return true;
    } catch (error) {
      console.warn('Guardando usuario en almacenamiento local:', error);
      const newId = `usr-${Date.now()}`;
      const newUser = { 
        id: newId, 
        ...dbPayload, 
        permissions: userPerms, 
        can_delete_history: userPerms.can_delete_history 
      };

      const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      currentPerms[cleanUser] = userPerms;
      currentPerms[newId] = userPerms;
      localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));

      const updated = [...get().users.filter(u => u.username !== cleanUser), newUser];
      persistUsers(updated);
      set({ users: updated });
      toast.success(`Usuario "${cleanUser}" creado exitosamente`);
      return true;
    } finally {
      set({ isLoading: false });
    }
  },

  updateUser: async (id, updates) => {
    set({ isLoading: true });
    const current = get().users.find(u => u.id === id);
    if (!current) return false;

    const isSuperOrAdmin = updates.role === 'Administrador' || current?.role === 'Administrador' || current?.username === 'superadmin';

    // Payload solo para columnas de app_users
    const dbUpdates = {};
    if (updates.username) dbUpdates.username = String(updates.username).trim();
    if (updates.password) dbUpdates.password = String(updates.password).trim();
    if (updates.role) dbUpdates.role = updates.role;

    const userPerms = {
      can_delete_history: isSuperOrAdmin ? true : (updates.can_delete_history !== undefined ? updates.can_delete_history : current?.can_delete_history),
      menus: updates.menus !== undefined ? updates.menus : (current?.permissions?.menus || getDefaultPermissionsForRole(updates.role || current.role).menus)
    };

    try {
      if (Object.keys(dbUpdates).length > 0) {
        await supabase.from('app_users').update(dbUpdates).eq('id', id);
      }

      // Actualizar permisos en Supabase DB
      const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      const uName = dbUpdates.username || current.username;
      currentPerms[uName] = userPerms;
      currentPerms[id] = userPerms;
      localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));
      persistUserPermissionsToDb(currentPerms);
    } catch (error) {
      console.warn('Supabase update error, guardando en local:', error);
    }

    const updated = get().users.map(u => (u.id === id ? { 
      ...u, 
      ...dbUpdates, 
      permissions: userPerms,
      can_delete_history: userPerms.can_delete_history 
    } : u));

    persistUsers(updated);
    set({ users: updated });
    toast.success('Usuario y permisos actualizados con éxito');
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
      await supabase.from('app_users').delete().eq('id', id);
      const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      if (target?.username) delete currentPerms[target.username];
      delete currentPerms[id];
      localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));
      persistUserPermissionsToDb(currentPerms);
    } catch (error) {
      console.warn('Supabase delete error, eliminando local:', error);
    }

    const updated = get().users.filter(u => u.id !== id);
    persistUsers(updated);
    set({ users: updated });
    toast.success('Usuario eliminado');
    set({ isLoading: false });
    return true;
  }
}));
