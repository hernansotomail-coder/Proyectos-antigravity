import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AddStaff from './components/AddStaff';
import ManageStaff from './components/ManageStaff';
import Attendance from './components/Attendance';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import UsersManager from './components/UsersManager';

import AssignmentControl from './components/AssignmentControl';
import HistoricalAssignment from './components/HistoricalAssignment';
import RouteDispatch from './components/RouteDispatch';
import AddFleet from './components/AddFleet';
import ManageFleet from './components/ManageFleet';
import FleetDashboard from './components/FleetDashboard';
import WashDashboard from './components/WashDashboard';
import FleetWashes from './components/FleetWashes';
import DailyPlanning from './components/DailyPlanning';
import RuteoView from './components/RuteoView';
import Briefing from './components/Briefing';
import ChangeHistory from './components/ChangeHistory';
import ManualDeUso from './components/ManualDeUso';
import { usePlanningStore } from './store/planningStore';
import { supabase } from './lib/supabase';

function App() {
  const { initPlanningFromDb } = usePlanningStore();

  useEffect(() => {
    initPlanningFromDb?.();

    // Suscripción Realtime a Supabase: sincroniza automáticamente entre notebooks cuando cualquiera guarde o transmita
    try {
      const channel = supabase
        .channel('realtime:planning_assignments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_assignments' }, (payload) => {
          console.log('[Realtime] Notificación de actualización en planning_assignments:', payload);
          initPlanningFromDb?.();
        })
        .subscribe();

      return () => {
        try {
          supabase.removeChannel(channel);
        } catch (e) {}
      };
    } catch (err) {
      console.warn('[Realtime] Error iniciando suscripción:', err);
    }
  }, [initPlanningFromDb]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="assignment" element={<Login><AssignmentControl /></Login>} />
          <Route path="historical-assignment" element={<Login><HistoricalAssignment /></Login>} />
          <Route path="route-dispatch" element={<Login><RouteDispatch /></Login>} />
          <Route path="fleet-dashboard" element={<Login><FleetDashboard /></Login>} />
          <Route path="wash-dashboard" element={<Login><WashDashboard /></Login>} />
          <Route path="fleet" element={<Login><AddFleet /></Login>} />
          <Route path="manage-fleet" element={<Login><ManageFleet /></Login>} />
          <Route path="fleet-washes" element={<Login><FleetWashes /></Login>} />
          <Route path="daily-planning" element={<Login><DailyPlanning /></Login>} />
          <Route path="ruteo" element={<Login><RuteoView /></Login>} />
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
    </BrowserRouter>
  );
}

export default App;
