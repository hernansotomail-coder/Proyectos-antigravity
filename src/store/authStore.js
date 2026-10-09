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
        
      if (error) throw error;
        
      if (data) {
        set({ isAuthenticated: true, user: data });
        return true;
      }
      return false;
    } catch(err) {
      console.log("Error de BD (probablemente falta la tabla o hay RLS), usando datos por defecto:", err);
      // Fallback
      if (username === 'superadmin' && password === 'superadmin97') {
         set({ isAuthenticated: true, user: { username: 'superadmin', role: 'Administrador' } });
         return true;
      }
      if (username === 'adminkey' && password === 'adminkey2026') {
         set({ isAuthenticated: true, user: { username: 'adminkey', role: 'Administrativo' } });
         return true;
      }
      if (username === 'visualkey' && password === 'visualkey2026') {
         set({ isAuthenticated: true, user: { username: 'visualkey', role: 'Visualizador' } });
         return true;
      }
      return false;
    }
  },
  logout: () => set({ isAuthenticated: false, user: null })
}));
