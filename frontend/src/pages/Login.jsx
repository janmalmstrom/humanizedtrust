import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
      } else {
        setToken(data.token);
        navigate('/dashboard');
      }
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/totp/login', { mfa_token: mfaToken, code });
      setToken(data.token);
      navigate('/dashboard');
    } catch {
      setError('Invalid code — check Microsoft Authenticator and try again');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  }

  if (mfaToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-cyan-500 font-bold text-2xl">HumanizedTrust</div>
            <div className="text-slate-400 text-sm mt-1">Two-factor authentication</div>
          </div>
          <form onSubmit={handleMfa} className="bg-navy-800 rounded-xl p-8 border border-white/10 space-y-5">
            {/* Microsoft Authenticator icon area */}
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
              <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 48 48" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="2" fill="#F25022"/>
                <rect x="26" y="2" width="20" height="20" rx="2" fill="#7FBA00"/>
                <rect x="2" y="26" width="20" height="20" rx="2" fill="#00A4EF"/>
                <rect x="26" y="26" width="20" height="20" rx="2" fill="#FFB900"/>
              </svg>
              <div>
                <div className="text-sm text-slate-200 font-medium">Microsoft Authenticator</div>
                <div className="text-xs text-slate-400">Open the app and enter the 6-digit code</div>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={handleCodeChange}
                placeholder="000000"
                autoFocus
                required
                className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-3 text-center text-xl font-mono tracking-widest text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setMfaToken(null); setCode(''); setError(''); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-cyan-500 font-bold text-2xl">HumanizedTrust</div>
          <div className="text-slate-400 text-sm mt-1">Lead Intelligence for the Swedish market</div>
        </div>
        <form onSubmit={handleLogin} className="bg-navy-800 rounded-xl p-8 border border-white/10 space-y-4">
          {error && <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
