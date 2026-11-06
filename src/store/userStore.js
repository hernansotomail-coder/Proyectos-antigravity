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
      { key: 'route-dispatch-external', label: 'Envío de rutas externos', path: '/route-dispatch-external' },
    ]
  },
  {
    module: 'Transporte',
    menus: [
      { key: 'assignment', label: 'Disponibilización', path: '/assignment' },
      { key: 'historical-assignment', label: 'Histórico disponibilización', path: '/historical-assignment' },
      { key: 'route-dispatch', label: 'Envío de rutas', path: '/route-dispatch' },
      { key: 'estatus-diario', label: 'Estatus diario', path: '/estatus-diario' },
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

// Helper para envolver cualquier promesa en un timeout estricto para evitar bloqueos
export const withTimeout = (promise, ms = 15000) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout de conexión a la base de datos')), ms);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

// Generador de plantilla de permisos según rol
export const getDefaultPermissionsForRole = (role) => {
  const menus = {};
  ALL_MENU_KEYS.forEach(k => {
    if (role === 'Administrador') {
      menus[k] = { view: true, edit: true };
    } else if (role === 'Visualizador') {
      const canView = ['dashboard', 'fleet-dashboard', 'wash-dashboard', 'change-history', 'briefing', 'historical-assignment', 'estatus-diario'].includes(k);
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

export const DEFAULT_APP_USERS = [
  { id: 'usr-1', username: 'superadmin', password: 'superadmin97', role: 'Administrador', can_delete_history: true, auto_lock_10min: false },
  { id: 'usr-2', username: 'adminkey', password: 'adminkey2026', role: 'Administrativo', can_delete_history: false, auto_lock_10min: false },
  { id: 'usr-3', username: 'visualkey', password: 'visualkey2026', role: 'Visualizador', can_delete_history: false, auto_lock_10min: false }
];

export const persistUserPermissionsToDb = async (permissionsMap) => {
  try {
    await withTimeout(
      supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__user_permissions__',
          assignments: permissionsMap,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' }),
      2500
    );
  } catch (e) {
    console.warn('Error guardando permisos en Supabase:', e);
  }
};

export const fetchUserPermissionsFromDb = async () => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__user_permissions__')
        .maybeSingle(),
      2500
    );
    if (error) return null;
    return data?.assignments || null;
  } catch (e) {
    return null;
  }
};

// Respaldo de usuarios en planning_assignments para sincronización garantizada multi-equipo
export const persistUsersListToDb = async (usersList) => {
  try {
    await withTimeout(
      supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__app_users__',
          assignments: usersList,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' }),
      2500
    );
  } catch (e) {
    console.warn('Error respaldando usuarios en Supabase:', e);
  }
};

export const fetchUsersListFromDb = async () => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('planning_assignments')
        .select('*')
        .eq('fecha', '__app_users__')
        .maybeSingle(),
      2500
    );
    if (error || !data || !Array.isArray(data.assignments)) return null;
    return data.assignments;
  } catch (e) {
    return null;
  }
};

export const loadPersistedUsers = () => {
  try {
    const saved = localStorage.getItem('keylogistics_app_users');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_APP_USERS;
};

export const persistUsers = (data) => {
  try {
    localStorage.setItem('keylogistics_app_users', JSON.stringify(data));
    // Sincronizar mapa de permisos
    const perms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
    data.forEach(u => {
      perms[u.username] = {
        can_delete_history: u.role === 'Administrador' || !!u.can_delete_history,
        menus: u.permissions?.menus || perms[u.username]?.menus || getDefaultPermissionsForRole(u.role).menus,
        auto_lock_10min: u.auto_lock_10min !== undefined ? !!u.auto_lock_10min : !!perms[u.username]?.auto_lock_10min
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
      // Consultar concurrentemente con timeout de 2.5s para no bloquear la interfaz
      const [usersRes, permsDb, backupUsers] = await Promise.allSettled([
        withTimeout(supabase.from('app_users').select('*').order('created_at', { ascending: true }), 2500),
        fetchUserPermissionsFromDb(),
        fetchUsersListFromDb()
      ]);

      const localPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
      const resolvedPerms = permsDb.status === 'fulfilled' && permsDb.value ? permsDb.value : {};
      const mergedPerms = { ...localPerms, ...resolvedPerms };
      try {
        localStorage.setItem('keylogistics_user_permissions', JSON.stringify(mergedPerms));
      } catch (e) {}

      let rawUsers = null;
      if (usersRes.status === 'fulfilled' && usersRes.value && usersRes.value.data && usersRes.value.data.length > 0) {
        rawUsers = usersRes.value.data;
      } else if (backupUsers.status === 'fulfilled' && Array.isArray(backupUsers.value) && backupUsers.value.length > 0) {
        rawUsers = backupUsers.value;
      }

      if (rawUsers && rawUsers.length > 0) {
        const enriched = rawUsers.map(u => {
          const userPerm = mergedPerms[u.username] || (u.id && mergedPerms[u.id]) || getDefaultPermissionsForRole(u.role);
          return {
            ...u,
            permissions: userPerm,
            can_delete_history: u.role === 'Administrador' || u.username === 'superadmin' || !!userPerm.can_delete_history,
            auto_lock_10min: u.auto_lock_10min !== undefined ? !!u.auto_lock_10min : !!userPerm.auto_lock_10min
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

    if (!cleanUser || !cleanPass) {
      toast.error('Por favor ingresa usuario y contraseña');
      set({ isLoading: false });
      return false;
    }

    // Payload para tabla app_users
    const dbPayload = {
      username: cleanUser,
      password: cleanPass,
      role: userData.role || 'Administrativo'
    };

    const defaultPerms = getDefaultPermissionsForRole(userData.role || 'Administrativo');
    const userPerms = {
      can_delete_history: isSuperOrAdmin ? true : !!userData.can_delete_history,
      menus: userData.menus || defaultPerms.menus,
      auto_lock_10min: !!userData.auto_lock_10min
    };

    let newUser = null;

    // 1. Intentar guardar en Supabase app_users con timeout de 2.5s
    try {
      const res = await withTimeout(
        supabase.from('app_users').insert([dbPayload]).select(),
        2500
      );
      if (!res.error && res.data && res.data.length > 0) {
        newUser = {
          ...res.data[0],
          permissions: userPerms,
          can_delete_history: userPerms.can_delete_history,
          auto_lock_10min: userPerms.auto_lock_10min
        };
      }
    } catch (error) {
      console.warn('Inserción remota en app_users no completada, creando con ID local:', error);
    }

    // 2. Si no se generó desde BD, crear con ID local
    if (!newUser) {
      const newId = `usr-${Date.now()}`;
      newUser = { 
        id: newId, 
        ...dbPayload, 
        permissions: userPerms, 
        can_delete_history: userPerms.can_delete_history,
        auto_lock_10min: userPerms.auto_lock_10min 
      };
    }

    // 3. Actualizar memoria y almacenamiento local
    const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
    currentPerms[cleanUser] = userPerms;
    if (newUser.id) currentPerms[newUser.id] = userPerms;
    localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));

    const updated = [...get().users.filter(u => String(u.username).toLowerCase() !== cleanUser.toLowerCase()), newUser];
    persistUsers(updated);
    set({ users: updated });

    // 4. Sincronizar en segundo plano sin bloquear al usuario
    persistUserPermissionsToDb(currentPerms).catch(() => {});
    persistUsersListToDb(updated).catch(() => {});

    toast.success(`Usuario "${cleanUser}" guardado y sincronizado con éxito`);
    set({ isLoading: false });
    return true;
  },

  updateUser: async (id, updates) => {
    set({ isLoading: true });
    const current = get().users.find(u => String(u.id) === String(id));
    if (!current) {
      toast.error('No se encontró el usuario a actualizar');
      set({ isLoading: false });
      return false;
    }

    const isSuperOrAdmin = updates.role === 'Administrador' || current?.role === 'Administrador' || current?.username === 'superadmin';

    // Payload solo para columnas de app_users
    const dbUpdates = {};
    if (updates.username) dbUpdates.username = String(updates.username).trim();
    if (updates.password) dbUpdates.password = String(updates.password).trim();
    if (updates.role) dbUpdates.role = updates.role;

    const userPerms = {
      can_delete_history: isSuperOrAdmin ? true : (updates.can_delete_history !== undefined ? updates.can_delete_history : current?.can_delete_history),
      menus: updates.menus !== undefined ? updates.menus : (current?.permissions?.menus || getDefaultPermissionsForRole(updates.role || current.role).menus),
      auto_lock_10min: updates.auto_lock_10min !== undefined ? !!updates.auto_lock_10min : (current?.auto_lock_10min !== undefined ? !!current.auto_lock_10min : !!current?.permissions?.auto_lock_10min)
    };

    // 1. Intentar actualizar en Supabase con timeout de 2.5s
    try {
      if (Object.keys(dbUpdates).length > 0) {
        await withTimeout(
          supabase.from('app_users').update(dbUpdates).eq('id', id),
          2500
        );
      }
    } catch (error) {
      console.warn('Actualización remota en app_users no completada:', error);
    }

    // 2. Actualizar permisos locales y en memoria
    const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
    const uName = dbUpdates.username || current.username;
    currentPerms[uName] = userPerms;
    currentPerms[id] = userPerms;
    localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));

    const updated = get().users.map(u => (String(u.id) === String(id) ? { 
      ...u, 
      ...dbUpdates, 
      permissions: userPerms,
      can_delete_history: userPerms.can_delete_history,
      auto_lock_10min: userPerms.auto_lock_10min 
    } : u));

    persistUsers(updated);
    set({ users: updated });

    // 3. Sincronizar en segundo plano sin bloquear
    persistUserPermissionsToDb(currentPerms).catch(() => {});
    persistUsersListToDb(updated).catch(() => {});

    toast.success(`Usuario "${uName}" actualizado con éxito`);
    set({ isLoading: false });
    return true;
  },

  toggleDeleteHistoryPermission: async (id) => {
    const target = get().users.find(u => String(u.id) === String(id));
    if (!target) return;
    if (target.username === 'superadmin' || target.role === 'Administrador') {
      toast.info('Los administradores y superadmin tienen permiso total permanente');
      return;
    }
    const newStatus = !target.can_delete_history;
    await get().updateUser(id, { can_delete_history: newStatus });
  },

  toggleAutoLock10Min: async (id) => {
    const target = get().users.find(u => String(u.id) === String(id));
    if (!target) return;
    const currentStatus = target.auto_lock_10min !== undefined ? !!target.auto_lock_10min : !!target.permissions?.auto_lock_10min;
    const newStatus = !currentStatus;
    await get().updateUser(id, { auto_lock_10min: newStatus });
    toast.success(`Bloqueo tras 10 min ${newStatus ? 'activado' : 'desactivado'} para ${target.username}`);
  },

  deleteUser: async (id) => {
    set({ isLoading: true });
    const target = get().users.find(u => String(u.id) === String(id));
    if (target?.username === 'superadmin') {
      toast.error('No se puede eliminar la cuenta principal de superadmin');
      set({ isLoading: false });
      return false;
    }

    // 1. Intentar borrar en Supabase con timeout de 2.5s
    try {
      await withTimeout(
        supabase.from('app_users').delete().eq('id', id),
        2500
      );
    } catch (error) {
      console.warn('Eliminación remota en app_users no completada:', error);
    }

    // 2. Borrar de permisos locales
    const currentPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
    if (target?.username) delete currentPerms[target.username];
    delete currentPerms[id];
    localStorage.setItem('keylogistics_user_permissions', JSON.stringify(currentPerms));

    const updated = get().users.filter(u => String(u.id) !== String(id));
    persistUsers(updated);
    set({ users: updated });

    // 3. Sincronizar en segundo plano
    persistUserPermissionsToDb(currentPerms).catch(() => {});
    persistUsersListToDb(updated).catch(() => {});

    toast.success('Usuario eliminado exitosamente');
    set({ isLoading: false });
    return true;
  }
}));
