import { create } from 'zustand';

// Simple static auth for "superadmin" / "Key2026$"
export const useAuthStore = create((set) => ({
  isAuthenticated: false,
  login: (username, password) => {
    if (username === 'superadmin' && password === 'Key2026$') {
      set({ isAuthenticated: true });
      return true;
    }
    return false;
  },
  logout: () => set({ isAuthenticated: false })
}));
