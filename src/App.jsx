import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

// Carga perezosa (Lazy loading) de módulos para máxima optimización de memoria
const AddStaff = lazy(() => import('./components/AddStaff'));
const ManageStaff = lazy(() => import('./components/ManageStaff'));
const Attendance = lazy(() => import('./components/Attendance'));
const UsersManager = lazy(() => import('./components/UsersManager'));
const AssignmentControl = lazy(() => import('./components/AssignmentControl'));
const HistoricalAssignment = lazy(() => import('./components/HistoricalAssignment'));
const RouteDispatch = lazy(() => import('./components/RouteDispatch'));
const AddFleet = lazy(() => import('./components/AddFleet'));
const ManageFleet = lazy(() => import('./components/ManageFleet'));
const FleetDashboard = lazy(() => import('./components/FleetDashboard'));
const WashDashboard = lazy(() => import('./components/WashDashboard'));
const FleetWashes = lazy(() => import('./components/FleetWashes'));
const DailyPlanning = lazy(() => import('./components/DailyPlanning'));
const RuteoView = lazy(() => import('./components/RuteoView'));
const Briefing = lazy(() => import('./components/Briefing'));
const ChangeHistory = lazy(() => import('./components/ChangeHistory'));
const ManualDeUso = lazy(() => import('./components/ManualDeUso'));
const EstatusDiario = lazy(() => import('./components/EstatusDiario'));

import { usePlanningStore } from './store/planningStore';
import { useFleetStore } from './store/fleetStore';
import { useStaffStore } from './store/staffStore';
import { supabase } from './lib/supabase';

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[45vh] text-slate-400 gap-2.5 animate-in fade-in duration-200">
    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-xs font-semibold text-slate-500">Cargando módulo...</span>
  </div>
);

function App() {
  const { initPlanningFromDb } = usePlanningStore();

  useEffect(() => {
    // 0. Liberación de memoria local (eliminar cachés antiguas no utilizadas)
    try {
      localStorage.removeItem('keylogistics_pago_dotacion');
      localStorage.removeItem('keylogistics_pago_dotacion_transmitted');
      localStorage.removeItem('keylogistics_pago_dotacion_contracts');
      localStorage.removeItem('keylogistics_pago_dotacion_history');
    } catch (e) {}

    // 1. Carga inicial garantizada de datos desde Supabase
    initPlanningFromDb?.();
    useFleetStore.getState().fetchFleet?.();
    useStaffStore.getState().fetchStaff?.();

    // 2. Intervalo periódico en segundo plano para refrescar flota y dotación si la conexión falló
    const refreshInterval = setInterval(() => {
      // Optimización: si la pestaña está en segundo plano u oculta, pausar para no gastar red ni CPU
      if (typeof document !== 'undefined' && document.hidden) return;
      useFleetStore.getState().fetchFleet?.();
      useStaffStore.getState().fetchStaff?.();
    }, 180000); // Cada 3 minutos

    // 3. Suscripciones Realtime a Supabase: sincroniza automáticamente entre notebooks
    let debounceTimer = null;
    let fleetTimer = null;
    let staffTimer = null;
    try {
      const channelPlanning = supabase
        .channel('realtime:planning_assignments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_assignments' }, (payload) => {
          console.log('[Realtime] Notificación de actualización en planning_assignments:', payload?.new?.fecha || payload);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const status = usePlanningStore.getState().cloudSyncStatus;
            if (status !== 'syncing') {
              initPlanningFromDb?.();
            }
          }, 3500);
        })
        .subscribe();

      const channelFleet = supabase
        .channel('realtime:fleet')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet' }, () => {
          if (fleetTimer) clearTimeout(fleetTimer);
          fleetTimer = setTimeout(() => {
            useFleetStore.getState().fetchFleet?.();
          }, 600);
        })
        .subscribe();

      const channelStaff = supabase
        .channel('realtime:staff')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => {
          if (staffTimer) clearTimeout(staffTimer);
          staffTimer = setTimeout(() => {
            useStaffStore.getState().fetchStaff?.();
          }, 600);
        })
        .subscribe();

      return () => {
        clearInterval(refreshInterval);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (fleetTimer) clearTimeout(fleetTimer);
        if (staffTimer) clearTimeout(staffTimer);
        try {
          supabase.removeChannel(channelPlanning);
          supabase.removeChannel(channelFleet);
          supabase.removeChannel(channelStaff);
        } catch (e) {}
      };
    } catch (err) {
      console.warn('[Realtime] Error iniciando suscripción:', err);
      return () => clearInterval(refreshInterval);
    }
  }, [initPlanningFromDb]);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="assignment" element={<Login><AssignmentControl /></Login>} />
            <Route path="historical-assignment" element={<Login><HistoricalAssignment /></Login>} />
            <Route path="route-dispatch" element={<Login><RouteDispatch /></Login>} />
            <Route path="route-dispatch-external" element={<Login><RouteDispatch onlyExternal={true} /></Login>} />
            <Route path="fleet-dashboard" element={<Login><FleetDashboard /></Login>} />
            <Route path="fleet-spid" element={<Login><FleetDashboard isSpidOnly={true} /></Login>} />
            <Route path="wash-dashboard" element={<Login><WashDashboard /></Login>} />
            <Route path="fleet" element={<Login><AddFleet /></Login>} />
            <Route path="manage-fleet" element={<Login><ManageFleet /></Login>} />
            <Route path="fleet-washes" element={<Login><FleetWashes /></Login>} />
            <Route path="daily-planning" element={<Login><DailyPlanning /></Login>} />
            <Route path="ruteo" element={<Login><RuteoView /></Login>} />
            <Route path="estatus-diario" element={<Login><EstatusDiario /></Login>} />
            <Route path="change-history" element={<Login><ChangeHistory /></Login>} />
            <Route path="briefing" element={<Login><Briefing /></Login>} />
            <Route path="manual-de-uso" element={<Login><ManualDeUso /></Login>} />
            <Route path="planning" element={<Navigate to="/daily-planning" replace />} />
            <Route path="add-staff" element={<Login><AddStaff /></Login>} />
            <Route path="manage-staff" element={<Login><ManageStaff /></Login>} />
            <Route path="attendance" element={<Login><Attendance /></Login>} />
            <Route path="users" element={<Login><UsersManager /></Login>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
