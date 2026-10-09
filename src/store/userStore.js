import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const useUserStore = create((set, get) => ({
  users: [],
  isLoading: false,
  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      set({ users: data || [] });
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      set({ isLoading: false });
    }
  },
  addUser: async (userData) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('app_users').insert([userData]).select();
      if (error) throw error;
      set({ users: [...get().users, data[0]] });
      toast.success('Usuario creado con éxito');
      return true;
    } catch (error) {
      console.error(error);
      toast.error('Error al crear usuario (¿Usuario duplicado?)');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  updateUser: async (id, updates) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.from('app_users').update(updates).eq('id', id);
      if (error) throw error;
      set({ users: get().users.map(u => u.id === id ? { ...u, ...updates } : u) });
      toast.success('Usuario actualizado');
      return true;
    } catch (error) {
      console.error(error);
      toast.error('Error al actualizar usuario');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  deleteUser: async (id) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) throw error;
      set({ users: get().users.filter(u => u.id !== id) });
      toast.success('Usuario eliminado');
      return true;
    } catch (error) {
      console.error(error);
      toast.error('Error al eliminar usuario');
      return false;
    } finally {
      set({ isLoading: false });
    }
  }
}));
