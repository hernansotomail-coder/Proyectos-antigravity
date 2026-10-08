import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Users, UserCog, CalendarClock, LayoutDashboard, Menu, X, LogOut, ChevronDown, ChevronRight, Truck } from 'lucide-react';
import { Toaster } from 'sonner';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAsistenciaOpen, setIsAsistenciaOpen] = useState(true);
  const [isAsignacionOpen, setIsAsignacionOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const asignacionItems = [
    { name: 'Disponibilización', path: '/assignment', icon: Truck },
    { name: 'Flota', path: '/fleet', icon: Truck },
  ];

  const asistenciaItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Agregar Dotación', path: '/add-staff', icon: Users },
    { name: 'Gestión Dotación', path: '/manage-staff', icon: UserCog },
    { name: 'Asistencia', path: '/attendance', icon: CalendarClock },
  ];

  const isAnyAsignacionActive = asignacionItems.some(item => location.pathname === item.path);
  const isAnyAsistenciaActive = asistenciaItems.some(item => location.pathname === item.path);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm z-10">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-blue-600 tracking-tight">Keylogistics</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">Torre de Control</p>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
          {/* Menú Control de Asignación */}
          <div className="pt-2">
            <button
              onClick={() => setIsAsignacionOpen(!isAsignacionOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                isAnyAsignacionActive && !isAsignacionOpen
                  ? 'bg-slate-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Truck size={20} />
                <span>Control Asignación</span>
              </div>
              {isAsignacionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            {isAsignacionOpen && (
              <div className="mt-1 ml-4 pl-4 border-l-2 border-slate-100 space-y-1">
                {asignacionItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Menú Asistencia */}
          <div className="pt-2">
            <button
              onClick={() => setIsAsistenciaOpen(!isAsistenciaOpen)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                isAnyAsistenciaActive && !isAsistenciaOpen
                  ? 'bg-slate-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <CalendarClock size={20} />
                <span>Asistencia</span>
              </div>
              {isAsistenciaOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            {isAsistenciaOpen && (
              <div className="mt-1 ml-4 pl-4 border-l-2 border-slate-100 space-y-1">
                {asistenciaItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
        {isAuthenticated && (
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all"
            >
              <LogOut size={20} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 z-10">
          <h1 className="text-xl font-bold text-blue-600">Keylogistics</h1>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600 bg-slate-100 rounded-md">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <nav className="md:hidden bg-white border-b border-slate-200 px-4 py-2 space-y-1 z-20 absolute w-full top-16 shadow-lg">
            
            <div className="font-semibold text-xs text-slate-400 uppercase tracking-wider px-4 pt-2 pb-2">
              Control Asignación
            </div>
            {asignacionItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg pl-8 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{item.name}</span>
              </NavLink>
            ))}
            
            <div className="font-semibold text-xs text-slate-400 uppercase tracking-wider px-4 pt-4 pb-2">
              Asistencia
            </div>
            {asistenciaItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg pl-8 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{item.name}</span>
              </NavLink>
            ))}

            {isAuthenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 mt-4 border-t border-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={20} />
                <span>Cerrar Sesión</span>
              </button>
            )}
          </nav>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-slate-50 flex flex-col">
          <Outlet />
        </div>
      </main>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}
