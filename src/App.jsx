import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AddStaff from './components/AddStaff';
import ManageStaff from './components/ManageStaff';
import Attendance from './components/Attendance';
import Dashboard from './components/Dashboard';
import Login from './components/Login';





import AssignmentControl from './components/AssignmentControl';
import AddFleet from './components/AddFleet';
import ManageFleet from './components/ManageFleet';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="assignment" element={<Login><AssignmentControl /></Login>} />
          <Route path="fleet" element={<Login><AddFleet /></Login>} />
          <Route path="manage-fleet" element={<Login><ManageFleet /></Login>} />
          <Route path="add-staff" element={<Login><AddStaff /></Login>} />
          <Route path="manage-staff" element={<Login><ManageStaff /></Login>} />
          <Route path="attendance" element={<Login><Attendance /></Login>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
