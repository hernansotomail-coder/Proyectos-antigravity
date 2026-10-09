import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAuthStore = create((set) => ({
  isAuthenticated: false,
  user: null, // { username, role }
  login: async (username, password) => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();
        
      if (data) {
        set({ isAuthenticated: true, user: data });
        return true;
      }
      return false;
    } catch(err) {
      // Fallback in case table doesn't exist yet
      if (username === 'superadmin' && password === 'superadmin97') {
         set({ isAuthenticated: true, user: { username: 'superadmin', role: 'Administrador' } });
         return true;
      }
      return false;
    }
  },
  logout: () => set({ isAuthenticated: false, user: null })
}));
