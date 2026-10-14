import React from 'react';
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
import AddFleet from './components/AddFleet';
import ManageFleet from './components/ManageFleet';
import FleetDashboard from './components/FleetDashboard';
import DailyPlanning from './components/DailyPlanning';
import RuteoView from './components/RuteoView';
import Briefing from './components/Briefing';
import ChangeHistory from './components/ChangeHistory';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="assignment" element={<Login><AssignmentControl /></Login>} />
          <Route path="historical-assignment" element={<Login><HistoricalAssignment /></Login>} />
          <Route path="fleet-dashboard" element={<Login><FleetDashboard /></Login>} />
          <Route path="fleet" element={<Login><AddFleet /></Login>} />
          <Route path="manage-fleet" element={<Login><ManageFleet /></Login>} />
          <Route path="daily-planning" element={<Login><DailyPlanning /></Login>} />
          <Route path="ruteo" element={<Login><RuteoView /></Login>} />
          <Route path="change-history" element={<Login><ChangeHistory /></Login>} />
          <Route path="briefing" element={<Login><Briefing /></Login>} />
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
