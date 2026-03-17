import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/discovery', label: 'Discovery' },
];

export default function Layout() {
  const navigate = useNavigate();
  function logout() { clearToken(); navigate('/login'); }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-navy-900 border-r border-white/10 flex flex-col flex-shrink-0">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-cyan-500 font-bold text-lg tracking-tight">HumanizedTrust</div>
          <div className="text-slate-500 text-xs mt-0.5">Lead Intelligence</div>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Logga ut
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-navy-900">
        <Outlet />
      </main>
    </div>
  );
}
