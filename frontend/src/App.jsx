import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Discovery from './pages/Discovery';
import Pipeline from './pages/Pipeline';
import Sequences from './pages/Sequences';
import Enrichment from './pages/Enrichment';
import SEO from './pages/SEO';
import Settings from './pages/Settings';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="sequences" element={<Sequences />} />
        <Route path="enrichment" element={<Enrichment />} />
        <Route path="discovery" element={<Discovery />} />
        <Route path="seo" element={<SEO />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
