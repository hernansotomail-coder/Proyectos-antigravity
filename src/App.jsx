import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AddStaff from './components/AddStaff';
import ManageStaff from './components/ManageStaff';
import Attendance from './components/Attendance';
import Dashboard from './components/Dashboard';
import Login from './components/Login';





function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="add-staff" element={<Login><AddStaff /></Login>} />
          <Route path="manage-staff" element={<Login><ManageStaff /></Login>} />
          <Route path="attendance" element={<Login><Attendance /></Login>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
