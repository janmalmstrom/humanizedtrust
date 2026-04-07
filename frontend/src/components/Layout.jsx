import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/leads', label: 'Leads' },
  { to: '/sequences', label: 'Sequences' },
  { to: '/enrichment', label: 'Enrichment' },
  { to: '/discovery', label: 'Discovery' },
  { to: '/seo', label: '🔍 NIS2Klar SEO' },
];

export default function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() { clearToken(); navigate('/login'); }

  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      {/* Top nav */}
      <header className="bg-navy-800 border-b border-white/10 flex-shrink-0 z-10">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <div>
            <span className="text-cyan-500 font-bold text-base tracking-tight">HumanizedTrust</span>
            <span className="text-slate-500 text-xs ml-2 hidden sm:inline">Lead Intelligence</span>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <button
              onClick={logout}
              className="hidden md:block text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Log out
            </button>
            {/* Hamburger (mobile) */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden p-2 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/10 px-4 py-3 space-y-1">
            {nav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                    isActive ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="pt-2 border-t border-white/10 mt-2">
              <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-2">
                Log out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
