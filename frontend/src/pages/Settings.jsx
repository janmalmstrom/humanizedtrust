import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Settings() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Setup flow state
  const [setupStep, setSetupStep] = useState(null); // null | 'qr' | 'success'
  const [qrData, setQrData] = useState(null);
  const [secretKey, setSecretKey] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable flow state
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/totp/status')
      .then(({ data }) => setMfaEnabled(data.enabled))
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  async function startSetup() {
    setSetupLoading(true); setSetupError('');
    try {
      const { data } = await api.post('/auth/totp/setup');
      setQrData(data.qr);
      setSecretKey(data.secret);
      setSetupStep('qr');
    } catch {
      setSetupError('Failed to start setup — try again');
    } finally {
      setSetupLoading(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setSetupLoading(true); setSetupError('');
    try {
      await api.post('/auth/totp/confirm', { code: confirmCode });
      setMfaEnabled(true);
      setSetupStep('success');
      setConfirmCode('');
    } catch (err) {
      setSetupError(err.response?.data?.error || 'Invalid code — try again');
      setConfirmCode('');
    } finally {
      setSetupLoading(false);
    }
  }

  async function disableMfa(e) {
    e.preventDefault();
    setDisableLoading(true); setDisableError('');
    try {
      await api.post('/auth/totp/disable', { password: disablePassword });
      setMfaEnabled(false);
      setShowDisable(false);
      setDisablePassword('');
      setSetupStep(null);
    } catch (err) {
      setDisableError(err.response?.data?.error || 'Invalid password');
    } finally {
      setDisableLoading(false);
    }
  }

  function formatSecret(s) {
    return s.match(/.{1,4}/g)?.join(' ') ?? s;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Settings</h1>

      {/* Account section */}
      <div className="bg-navy-800 rounded-xl border border-white/10 p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">Account</h2>
        <p className="text-xs text-slate-500">Manage account details and security preferences.</p>
      </div>

      {/* MFA section */}
      <div className="bg-navy-800 rounded-xl border border-white/10 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 48 48" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="2" fill="#F25022"/>
              <rect x="26" y="2" width="20" height="20" rx="2" fill="#7FBA00"/>
              <rect x="2" y="26" width="20" height="20" rx="2" fill="#00A4EF"/>
              <rect x="26" y="26" width="20" height="20" rx="2" fill="#FFB900"/>
            </svg>
            <div>
              <div className="text-sm font-semibold text-slate-200">Two-Factor Authentication</div>
              <div className="text-xs text-slate-400 mt-0.5">Microsoft Authenticator — TOTP (RFC 6238)</div>
            </div>
          </div>
          {!loadingStatus && (
            mfaEnabled ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"/>
                Enabled
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-500 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                Disabled
              </span>
            )
          )}
        </div>

        {/* Not enabled — show setup */}
        {!loadingStatus && !mfaEnabled && setupStep === null && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Add a second layer of security. After setup, you'll be asked for a 6-digit code from Microsoft Authenticator each time you log in.
            </p>
            {setupError && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{setupError}</div>
            )}
            <button
              onClick={startSetup}
              disabled={setupLoading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
            >
              {setupLoading ? 'Generating...' : 'Set up MFA'}
            </button>
          </div>
        )}

        {/* QR step */}
        {setupStep === 'qr' && (
          <div className="space-y-5">
            <div className="text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">Step 1 — Scan QR code</p>
              <p>Open Microsoft Authenticator → + → Other account → scan the QR code below.</p>
            </div>

            {qrData && (
              <div className="flex justify-center">
                <img src={qrData} alt="TOTP QR code" className="w-44 h-44 rounded-lg bg-white p-2" />
              </div>
            )}

            <div>
              <p className="text-xs text-slate-500 mb-1">Or enter the key manually:</p>
              <code className="block text-xs font-mono text-cyan-400 bg-navy-900 border border-white/10 rounded px-3 py-2 tracking-wider select-all">
                {formatSecret(secretKey)}
              </code>
            </div>

            <form onSubmit={confirmSetup} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Step 2 — Enter the 6-digit code to confirm
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmCode}
                  onChange={e => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2.5 text-center text-lg font-mono tracking-widest text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              {setupError && (
                <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{setupError}</div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={setupLoading || confirmCode.length !== 6}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
                >
                  {setupLoading ? 'Activating...' : 'Activate MFA'}
                </button>
                <button
                  type="button"
                  onClick={() => { setSetupStep(null); setSetupError(''); setConfirmCode(''); }}
                  className="text-sm text-slate-500 hover:text-slate-300 px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Success state */}
        {setupStep === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-3">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            MFA activated — Microsoft Authenticator will be required at next login.
          </div>
        )}

        {/* Enabled — show disable option */}
        {!loadingStatus && mfaEnabled && !showDisable && setupStep !== 'success' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              MFA is active. You'll be asked for a code from Microsoft Authenticator each time you sign in.
            </p>
            <button
              onClick={() => setShowDisable(true)}
              className="text-sm text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg px-4 py-2 transition-colors"
            >
              Disable MFA
            </button>
          </div>
        )}

        {/* Disable confirmation */}
        {showDisable && (
          <form onSubmit={disableMfa} className="space-y-3">
            <p className="text-xs text-slate-400">Enter your password to disable MFA.</p>
            <input
              type="password"
              value={disablePassword}
              onChange={e => setDisablePassword(e.target.value)}
              placeholder="Your password"
              autoFocus
              required
              className="w-full bg-navy-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
            {disableError && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{disableError}</div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={disableLoading || !disablePassword}
                className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                {disableLoading ? 'Disabling...' : 'Disable MFA'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDisable(false); setDisablePassword(''); setDisableError(''); }}
                className="text-sm text-slate-500 hover:text-slate-300 px-3 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
