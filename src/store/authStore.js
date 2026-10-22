import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const canUserDeleteHistory = (user) => {
  if (!user) return false;
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'superadmin') return true;
  if (user.role === 'Administrador') return true;
  if (user.can_delete_history === true) return true;
  
  try {
    const saved = localStorage.getItem('keylogistics_user_permissions');
    if (saved) {
      const perms = JSON.parse(saved);
      if (perms[username]?.can_delete_history === true) return true;
      if (user.id && perms[user.id]?.can_delete_history === true) return true;
    }
  } catch (e) {}
  
  return false;
};

// Verificar si el usuario tiene permiso para VER un menú
export const canUserViewMenu = (user, menuKey) => {
  if (!user) return false;
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'superadmin' || user.role === 'Administrador') return true;

  // Si tiene permisos explícitos configurados
  const userMenus = user.permissions?.menus;
  if (userMenus && userMenus[menuKey] !== undefined) {
    return !!userMenus[menuKey].view;
  }

  try {
    const saved = localStorage.getItem('keylogistics_user_permissions');
    if (saved) {
      const perms = JSON.parse(saved);
      const userPerm = perms[username] || (user.id && perms[user.id]);
      if (userPerm?.menus && userPerm.menus[menuKey] !== undefined) {
        return !!userPerm.menus[menuKey].view;
      }
    }
  } catch (e) {}

  // Fallbacks predeterminados por Rol
  if (user.role === 'Visualizador') {
    // Por defecto el visualizador puede ver reportes/dashboards
    return ['dashboard', 'fleet-dashboard', 'wash-dashboard', 'change-history', 'briefing', 'historical-assignment'].includes(menuKey);
  }

  // Administrativo por defecto ve todos excepto mantenedor de usuarios
  if (menuKey === 'users') return false;
  return true;
};

// Verificar si el usuario tiene permiso para EDITAR un menú
export const canUserEditMenu = (user, menuKey) => {
  if (!user) return false;
  const username = String(user.username || '').trim().toLowerCase();
  if (username === 'superadmin' || user.role === 'Administrador') return true;

  if (user.role === 'Visualizador') return false;

  // Si tiene permisos explícitos configurados
  const userMenus = user.permissions?.menus;
  if (userMenus && userMenus[menuKey] !== undefined) {
    return !!userMenus[menuKey].edit;
  }

  try {
    const saved = localStorage.getItem('keylogistics_user_permissions');
    if (saved) {
      const perms = JSON.parse(saved);
      const userPerm = perms[username] || (user.id && perms[user.id]);
      if (userPerm?.menus && userPerm.menus[menuKey] !== undefined) {
        return !!userPerm.menus[menuKey].edit;
      }
    }
  } catch (e) {}

  if (menuKey === 'users') return false;
  return true;
};

const getStoredSession = () => {
  try {
    const saved = localStorage.getItem('keylogistics_auth_user');
    if (saved) {
      const user = JSON.parse(saved);
      return { isAuthenticated: true, user };
    }
  } catch (e) {}
  return { isAuthenticated: false, user: null };
};

const initialSession = getStoredSession();

export const useAuthStore = create((set, get) => ({
  isAuthenticated: initialSession.isAuthenticated,
  user: initialSession.user,
  login: async (username, password) => {
    try {
      const cleanUser = String(username || '').trim();
      const cleanPass = String(password || '').trim();

      // 1. Intentar consultar usuario en Supabase DB
      let foundUser = null;
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('*')
          .ilike('username', cleanUser)
          .eq('password', cleanPass)
          .single();
          
        if (!error && data) {
          foundUser = data;
        }
      } catch (dbErr) {
        console.warn('Error al consultar app_users en Supabase:', dbErr);
      }

      // 2. Si no lo encontró en BD, buscar en usuarios locales de userStore
      if (!foundUser) {
        try {
          const localUsers = JSON.parse(localStorage.getItem('keylogistics_app_users') || '[]');
          foundUser = localUsers.find(u => 
            String(u.username || '').trim().toLowerCase() === cleanUser.toLowerCase() && 
            String(u.password || '').trim() === cleanPass
          );
        } catch (e) {}
      }

      // 3. Fallbacks de emergencia para superadmin
      if (!foundUser && cleanUser.toLowerCase() === 'superadmin' && cleanPass === 'superadmin97') {
        foundUser = { username: 'superadmin', role: 'Administrador', can_delete_history: true };
      }

      if (foundUser) {
        // Cargar permisos desde Supabase DB (__user_permissions__)
        let permissions = null;
        try {
          const { data: permData } = await supabase
            .from('planning_assignments')
            .select('*')
            .eq('fecha', '__user_permissions__')
            .maybeSingle();

          if (permData && permData.assignments) {
            permissions = permData.assignments[foundUser.username] || 
                          (foundUser.id && permData.assignments[foundUser.id]) || null;
            // Sincronizar en localStorage
            localStorage.setItem('keylogistics_user_permissions', JSON.stringify(permData.assignments));
          }
        } catch (e) {
          console.warn('No se pudieron leer permisos remotos de Supabase:', e);
        }

        // Si no había remoto, buscar en localStorage
        if (!permissions) {
          try {
            const localPerms = JSON.parse(localStorage.getItem('keylogistics_user_permissions') || '{}');
            permissions = localPerms[foundUser.username] || (foundUser.id && localPerms[foundUser.id]) || null;
          } catch (e) {}
        }

        const isSuperOrAdmin = foundUser.role === 'Administrador' || foundUser.username === 'superadmin';
        const enrichedUser = {
          ...foundUser,
          permissions: permissions || { menus: {} },
          can_delete_history: isSuperOrAdmin ? true : (permissions?.can_delete_history === true || foundUser.can_delete_history === true)
        };

        localStorage.setItem('keylogistics_auth_user', JSON.stringify(enrichedUser));
        set({ isAuthenticated: true, user: enrichedUser });
        return true;
      }

      return false;
    } catch(err) {
      console.error("Error en proceso de login:", err);
      return false;
    }
  },
  setUser: (user) => {
    if (user) {
      localStorage.setItem('keylogistics_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('keylogistics_auth_user');
    }
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('keylogistics_auth_user');
    set({ isAuthenticated: false, user: null });
  }
}));
