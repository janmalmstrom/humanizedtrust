'use strict';
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const CLIENT_ID    = 'e3e945d5-1aa3-4f14-9e7d-8e876613de0d';
const REDIRECT_URI = 'https://nis2klar.se/auth/callback';
const TOKEN_URL    = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH        = 'https://graph.microsoft.com/v1.0';

// POST /api/microsoft-auth — exchange code, call Graph, return autofills
router.post('/', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'code required' });

  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: 'Microsoft auth not configured on server' });

  // ── Token exchange ────────────────────────────────────────────────
  let accessToken;
  try {
    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: secret,
      code,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    });
    const { data } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    accessToken = data.access_token;
  } catch (err) {
    const detail = err.response?.data?.error_description || err.message;
    console.error('[ms-auth] token exchange failed:', detail);
    return res.status(400).json({ success: false, error: 'Token exchange failed', detail });
  }

  // ── Graph helper ─────────────────────────────────────────────────
  const g = async (path) => {
    try {
      const { data } = await axios.get(`${GRAPH}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    } catch (err) {
      const code = err.response?.data?.error?.code;
      const msg  = err.response?.data?.error?.message;
      console.warn(`[ms-auth] Graph ${path} →`, err.response?.status, code, msg?.substring(0, 80));
      return null;
    }
  };

  // ── Parallel Graph calls ─────────────────────────────────────────
  const [me, org, caPolicies, skus, secureScore] = await Promise.all([
    g('/me'),
    g('/organization'),
    g('/identity/conditionalAccess/policies'),
    g('/subscribedSkus'),
    g('/security/secureScores?$top=1'),
  ]);

  // ── Profile ──────────────────────────────────────────────────────
  const profile = {
    email:   me?.userPrincipalName || me?.mail || '',
    name:    me?.displayName || '',
    company: org?.value?.[0]?.displayName || '',
  };

  // ── License analysis ─────────────────────────────────────────────
  const skuList = (skus?.value || []).map(s => (s.skuPartNumber || '').toUpperCase());

  const has = (...kws) => kws.some(kw => skuList.some(s => s.includes(kw)));

  const hasIntune   = has('INTUNE', 'EMS_E3', 'EMS_E5', 'M365_E3', 'M365_E5', 'M365_F1', 'M365_F3', 'SPB') ||
                      skuList.some(s => s.startsWith('M365') && !s.includes('BASIC'));
  const hasDefender = has('DEFENDER', 'ATPENTERPRISE', 'ATP_ENTERPRISE', 'MDATP', 'WIN_DEF_ATP',
                          'THREAT_INTELLIGENCE', 'MDE_SMB');
  const hasEntraP2  = has('AAD_PREMIUM_P2', 'ENTRA_P2', 'EMS_E5', 'M365_E5', 'IDENTITY_THREAT_PROTECTION');
  const hasEntraP1  = hasEntraP2 || has('AAD_PREMIUM', 'EMS_E3', 'M365_E3', 'M365_E5', 'M365_F3', 'SPB');
  const hasPurview  = has('AIP_PREMIUM', 'INFORMATION_PROTECTION', 'PURVIEW', 'COMPLIANCE_E5', 'M365_COMPLIANCE');
  const hasM365Any  = has('M365', 'O365', 'OFFICE365', 'SPB', 'BUSINESS_PREMIUM');

  // ── Conditional Access analysis ──────────────────────────────────
  const policies = (caPolicies?.value || []);
  const enabled  = policies.filter(p => p.state === 'enabled' || p.state === 'enabledForReportingButNotEnforced');
  const mfaPolicies = enabled.filter(p => {
    const controls = p.grantControls?.builtInControls || [];
    return controls.some(c => ['mfa','compliantDevice','domainJoinedDevice'].includes(c));
  });
  const hasMfaCA  = mfaPolicies.length > 0;
  const hasSomeCA = enabled.length > 0;

  // ── Secure Score ─────────────────────────────────────────────────
  const ss    = secureScore?.value?.[0];
  const ssPct = ss ? Math.round(ss.currentScore / ss.maxScore * 100) : null;

  // ── Map Graph data → quiz answer autofills ────────────────────────
  // Keys: d{domainIdx}_q{questionIdx}  →  2=Ja, 1=Delvis, 0=Nej
  const autofills = {};
  const evidence  = {};

  function fill(key, val, text) {
    autofills[key] = val;
    evidence[key]  = text;
  }

  // Domain 0 — Styrning
  if (hasDefender) {
    fill('d0_q4', 1,
      'Microsoft Defender for Office 365 inkluderar Attack Simulator för phishing-träning. ' +
      'Verifiera att ni kör regelbundna träningskampanjer.');
  }

  // Domain 1 — Riskhantering
  if (hasIntune) {
    fill('d1_q2', 1,
      'Microsoft Intune är licensierat — ni har kapacitet för enhetsregistrering och inventering. ' +
      'Verifiera att alla enheter (inklusive mobiler) är enrollade i Intune.');
    fill('d1_q4', 1,
      'Intune hanterar Windows Update-policies centralt. ' +
      'Aktivera Windows Autopatch eller en Update Ring för att säkerställa systematisk patchning.');
  }
  if (hasMfaCA) {
    fill('d1_q3', 2,
      `${mfaPolicies.length} aktiv Conditional Access-policy som kräver MFA hittades i er Entra ID. ` +
      'Bra — verifiera att policyn täcker alla användare (inte bara admins).');
  } else if (hasSomeCA || hasEntraP1) {
    fill('d1_q3', 1,
      hasEntraP1
        ? 'Entra ID P1/P2 är licensierat (stöder Conditional Access) men inga aktiva MFA-policies hittades. ' +
          'Skapa en Conditional Access-policy som kräver MFA för alla användare.'
        : `${enabled.length} Conditional Access-policy finns men ingen verifierad MFA-policy identifierades.`);
  }

  // Domain 2 — Incidentrespons
  if (hasDefender) {
    fill('d2_q1', 1,
      'Microsoft Defender ger automatiserad incidentdetektering och XDR-korrelation. ' +
      'Konfigurera alerting till jourhavande person för att nå 4-timmarsmålet.');
    fill('d2_q3', 1,
      'Defender for Endpoint loggar endpoint-aktivitet. För NIS2-komplett loggning rekommenderas ' +
      'Microsoft Sentinel (SIEM) som samlar loggar från hela M365-miljön.');
  }

  // Domain 3 — Leverantörskedja  (Graph ger inte tillräcklig info — hoppa över)

  // Domain 4 — Tekniska kontroller
  if (hasDefender) {
    fill('d4_q1', 2,
      'Microsoft Defender for Endpoint är licensierat. ' +
      'Verifiera att EDR-agenten är distribuerad och aktiv på ALLA enheter, inklusive servrar.');
  } else if (hasM365Any) {
    fill('d4_q1', 1,
      'Microsoft 365 inkluderar Microsoft Defender Antivirus (basic). ' +
      'För fullständigt EDR (XDR, Live Response, Threat Hunting) krävs Defender for Endpoint Plan 2.');
  }
  if (hasPurview) {
    fill('d4_q2', 1,
      'Microsoft Purview Information Protection är licensierat. ' +
      'Konfigurera känslighetsetiketter (Sensitivity Labels) och krypteringspolicies för konfidentiell data.');
  } else if (hasM365Any) {
    fill('d4_q2', 1,
      'Microsoft 365 inkluderar BitLocker och TLS. ' +
      'Aktivera BitLocker på alla bärbara datorer och verifiera att känslig data krypteras vid sändning.');
  }
  if (hasEntraP2) {
    fill('d4_q4', 2,
      'Entra ID P2 är licensierat — Privileged Identity Management (PIM) är tillgängligt. ' +
      'Konfigurera PIM för alla administratörskonton (just-in-time access, approval workflow).');
  } else if (hasEntraP1) {
    fill('d4_q4', 1,
      'Entra ID P1 är licensierat — Conditional Access stöds men PIM kräver P2. ' +
      'Uppgradera till Entra ID P2 för Privileged Identity Management.');
  }

  console.log(`[ms-auth] autofills: ${Object.keys(autofills).length} answers, ssPct=${ssPct}, co=${profile.company}`);

  res.json({
    success: true,
    profile,
    autofills,
    evidence,
    secureScore: ssPct,
    licenseSummary: { hasIntune, hasDefender, hasEntraP1, hasEntraP2, hasPurview },
  });
});

module.exports = router;
