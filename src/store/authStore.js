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
  user: initialSession.user, // { username, role, can_delete_history }
  login: async (username, password) => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();
        
      if (error) throw error;
        
      if (data) {
        localStorage.setItem('keylogistics_auth_user', JSON.stringify(data));
        set({ isAuthenticated: true, user: data });
        return true;
      }
      return false;
    } catch(err) {
      console.log("Error de BD (probablemente falta la tabla o hay RLS), usando datos por defecto:", err);
      // Fallback
      if (username === 'superadmin' && password === 'superadmin97') {
         const usr = { username: 'superadmin', role: 'Administrador', can_delete_history: true };
         localStorage.setItem('keylogistics_auth_user', JSON.stringify(usr));
         set({ isAuthenticated: true, user: usr });
         return true;
      }
      if (username === 'adminkey' && password === 'adminkey2026') {
         const usr = { username: 'adminkey', role: 'Administrativo', can_delete_history: false };
         localStorage.setItem('keylogistics_auth_user', JSON.stringify(usr));
         set({ isAuthenticated: true, user: usr });
         return true;
      }
      if (username === 'visualkey' && password === 'visualkey2026') {
         const usr = { username: 'visualkey', role: 'Visualizador', can_delete_history: false };
         localStorage.setItem('keylogistics_auth_user', JSON.stringify(usr));
         set({ isAuthenticated: true, user: usr });
         return true;
      }
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
