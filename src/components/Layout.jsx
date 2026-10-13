import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Users, UserCog, CalendarClock, LayoutDashboard, Menu, X, 
  LogOut, ChevronDown, ChevronRight, ChevronLeft, Truck, Key, Layers, 
  FileText, FileSpreadsheet, History, Shield, Wrench
} from 'lucide-react';
import { Toaster } from 'sonner';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Barra retráctil (Requisito 4)

  const [isPlanificacionOpen, setIsPlanificacionOpen] = useState(true);
  const [isTransporteOpen, setIsTransporteOpen] = useState(true);
  const [isAdminFlotaOpen, setIsAdminFlotaOpen] = useState(true);
  const [isAdminDotacionOpen, setIsAdminDotacionOpen] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, logout, user } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 1. Menú Planificación
  const planificacionItems = [
    { name: 'Asignación diaria', path: '/daily-planning', icon: Layers },
    { name: 'Ruteo', path: '/ruteo', icon: FileSpreadsheet },
    { name: 'Briefing', path: '/briefing', icon: FileText },
  ];

  // 2. Menú Transporte (Operacional)
  const transporteItems = [
    { name: 'Disponibilización', path: '/assignment', icon: Truck },
    { name: 'Histórico disponibilización', path: '/historical-assignment', icon: History },
  ];

  // 3. Menú Administración Flota (Nuevo menú - Requisito 5)
  let adminFlotaItems = [
    { name: 'Dashboard Flota', path: '/fleet-dashboard', icon: LayoutDashboard },
    { name: 'Agregar Flota', path: '/fleet', icon: Truck },
    { name: 'Gestión Flota', path: '/manage-fleet', icon: UserCog },
  ];

  // 4. Menú Administración dotación (Antes "Administración" - Requisito 5)
  let adminDotacionItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Agregar Dotación', path: '/add-staff', icon: Users },
    { name: 'Gestión Dotación', path: '/manage-staff', icon: UserCog },
    { name: 'Asistencia', path: '/attendance', icon: CalendarClock },
  ];

  // Reglas de acceso por Rol
  if (user?.role === 'Administrador') {
    adminDotacionItems.push({ name: 'Usuarios', path: '/users', icon: Key });
  } else if (user?.role === 'Visualizador') {
    // El usuario Visualizador solo puede ver Dashboard Flota y Dashboard
    adminFlotaItems = adminFlotaItems.filter(i => i.name === 'Dashboard Flota');
    adminDotacionItems = adminDotacionItems.filter(i => i.name === 'Dashboard');
  }

  const isAnyPlanificacionActive = planificacionItems.some(
    item => location.pathname === item.path || location.pathname === '/planning'
  );
  const isAnyTransporteActive = transporteItems.some(item => location.pathname === item.path);
  const isAnyAdminFlotaActive = adminFlotaItems.some(item => location.pathname === item.path);
  const isAnyAdminDotacionActive = adminDotacionItems.some(item => location.pathname === item.path);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* Sidebar Desktop Retráctil (Requisito 4) */}
      <aside 
        className={`hidden md:flex flex-col bg-white border-r border-slate-200 shadow-sm z-20 transition-all duration-300 ease-in-out shrink-0 ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header del Sidebar */}
        <div className={`border-b border-slate-100 flex items-center transition-all ${
          isSidebarCollapsed ? 'p-3 flex-col gap-2 justify-center' : 'p-5 justify-between'
        }`}>
          {!isSidebarCollapsed ? (
            <>
              <div>
                <h1 className="text-xl font-black text-blue-600 tracking-tight">Keylogistics</h1>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Torre de Control</p>
              </div>
              <button 
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
                title="Contraer menú"
              >
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full">
              <div 
                onClick={() => setIsSidebarCollapsed(false)}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-black text-base shadow-sm cursor-pointer hover:scale-105 transition-transform"
                title="Keylogistics - Clic para expandir menú"
              >
                KL
              </div>
              <button 
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                title="Expandir menú"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Navegación Desktop */}
        <nav className="flex-1 px-3 space-y-2 mt-3 overflow-y-auto overflow-x-hidden">
          
          {/* VISTA EXPANDIDA */}
          {!isSidebarCollapsed ? (
            <>
              {/* 1. Menú Planificación */}
              {user?.role !== 'Visualizador' && (
                <div className="pt-1">
                  <button
                    onClick={() => setIsPlanificacionOpen(!isPlanificacionOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                      isAnyPlanificacionActive && !isPlanificacionOpen
                        ? 'bg-blue-50/70 text-blue-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CalendarClock size={18} className="text-blue-600 shrink-0" />
                      <span className="text-xs font-bold">Planificación</span>
                    </div>
                    {isPlanificacionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  
                  {isPlanificacionOpen && (
                    <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-1">
                      {planificacionItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-xs font-semibold ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`
                          }
                        >
                          <item.icon size={16} />
                          <span>{item.name}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Menú Transporte */}
              {user?.role !== 'Visualizador' && (
                <div className="pt-1">
                  <button
                    onClick={() => setIsTransporteOpen(!isTransporteOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                      isAnyTransporteActive && !isTransporteOpen
                        ? 'bg-blue-50/70 text-blue-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck size={18} className="text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold">Transporte</span>
                    </div>
                    {isTransporteOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  
                  {isTransporteOpen && (
                    <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-1">
                      {transporteItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-xs font-semibold ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`
                          }
                        >
                          <item.icon size={16} />
                          <span>{item.name}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Menú Administración Flota (Requisito 5) */}
              <div className="pt-1">
                <button
                  onClick={() => setIsAdminFlotaOpen(!isAdminFlotaOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                    isAnyAdminFlotaActive && !isAdminFlotaOpen
                      ? 'bg-blue-50/70 text-blue-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield size={18} className="text-indigo-600 shrink-0" />
                    <span className="text-xs font-bold">Administración Flota</span>
                  </div>
                  {isAdminFlotaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {isAdminFlotaOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-1">
                    {adminFlotaItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-xs font-semibold ${
                            isActive
                              ? 'bg-blue-50 text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                      >
                        <item.icon size={16} />
                        <span>{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Menú Administración dotación (Requisito 5) */}
              <div className="pt-1">
                <button
                  onClick={() => setIsAdminDotacionOpen(!isAdminDotacionOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                    isAnyAdminDotacionActive && !isAdminDotacionOpen
                      ? 'bg-blue-50/70 text-blue-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users size={18} className="text-amber-600 shrink-0" />
                    <span className="text-xs font-bold">Administración dotación</span>
                  </div>
                  {isAdminDotacionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {isAdminDotacionOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-1">
                    {adminDotacionItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-xs font-semibold ${
                            isActive
                              ? 'bg-blue-50 text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                      >
                        <item.icon size={16} />
                        <span>{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* VISTA RETRÁCTIL / COLAPSADA (Íconos centrados con Tooltip) */
            <div className="flex flex-col items-center gap-3 pt-2">
              
              {/* Planificación colapsado */}
              {user?.role !== 'Visualizador' && (
                <div className="flex flex-col items-center gap-1.5 w-full pb-2 border-b border-slate-100">
                  <span className="text-[8px] font-black text-slate-300 uppercase">Plan</span>
                  {planificacionItems.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        title={item.name}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isActive 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'
                        }`}
                      >
                        <item.icon size={18} />
                      </NavLink>
                    );
                  })}
                </div>
              )}

              {/* Transporte colapsado */}
              {user?.role !== 'Visualizador' && (
                <div className="flex flex-col items-center gap-1.5 w-full pb-2 border-b border-slate-100">
                  <span className="text-[8px] font-black text-slate-300 uppercase">Transp</span>
                  {transporteItems.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        title={item.name}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isActive 
                            ? 'bg-emerald-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:bg-slate-100 hover:text-emerald-600'
                        }`}
                      >
                        <item.icon size={18} />
                      </NavLink>
                    );
                  })}
                </div>
              )}

              {/* Administración Flota colapsado */}
              <div className="flex flex-col items-center gap-1.5 w-full pb-2 border-b border-slate-100">
                <span className="text-[8px] font-black text-slate-300 uppercase">Flota</span>
                {adminFlotaItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={item.name}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        isActive 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
                      }`}
                    >
                      <item.icon size={18} />
                    </NavLink>
                  );
                })}
              </div>

              {/* Administración Dotación colapsado */}
              <div className="flex flex-col items-center gap-1.5 w-full pb-2">
                <span className="text-[8px] font-black text-slate-300 uppercase">Dotac</span>
                {adminDotacionItems.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={item.name}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        isActive 
                          ? 'bg-amber-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:bg-slate-100 hover:text-amber-600'
                      }`}
                    >
                      <item.icon size={18} />
                    </NavLink>
                  );
                })}
              </div>

            </div>
          )}

        </nav>

        {/* Footer Sidebar (Cerrar Sesión) */}
        {isAuthenticated && (
          <div className="p-3 border-t border-slate-100">
            {!isSidebarCollapsed ? (
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all text-xs font-semibold"
              >
                <LogOut size={16} />
                <span>Cerrar Sesión</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                title="Cerrar Sesión"
                className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
              KL
            </div>
            <h1 className="text-lg font-bold text-slate-800">Keylogistics</h1>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="p-2 text-slate-600 bg-slate-100 rounded-xl"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <nav className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2 z-30 absolute w-full top-16 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
            {user?.role !== 'Visualizador' && (
              <>
                <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider px-2 pt-1">
                  Planificación
                </div>
                {planificacionItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                      }`
                    }
                  >
                    <item.icon size={16} />
                    <span>{item.name}</span>
                  </NavLink>
                ))}

                <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider px-2 pt-2">
                  Transporte
                </div>
                {transporteItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                      }`
                    }
                  >
                    <item.icon size={16} />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </>
            )}

            <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider px-2 pt-2">
              Administración Flota
            </div>
            {adminFlotaItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                  }`
                }
              >
                <item.icon size={16} />
                <span>{item.name}</span>
              </NavLink>
            ))}

            <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider px-2 pt-2">
              Administración dotación
            </div>
            {adminDotacionItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                  }`
                }
              >
                <item.icon size={16} />
                <span>{item.name}</span>
              </NavLink>
            ))}

            {isAuthenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setIsMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 mt-3 border-t border-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 text-xs font-semibold"
              >
                <LogOut size={16} />
                <span>Cerrar Sesión</span>
              </button>
            )}
          </nav>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-slate-50 flex flex-col min-h-0">
          <Outlet />
        </div>
      </main>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}
