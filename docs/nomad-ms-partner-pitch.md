# NIS2 Gap-analysverktyg — Microsoft Partner Pitch
**För: Nomad Cyber · Datum: 2026-04-08**

---

## Vad vi har byggt

Ett gratis, webbaserat NIS2-självskattningsverktyg på **nis2klar.se/nis2-gap-analys.html** som:

1. Låter företag göra en NIS2 gap-analys på 8 minuter (25 frågor, 5 domäner)
2. Integrerar med **Microsoft 365 via Graph API** för att autofylla tekniska svar
3. Genererar en **anpassad rapport** med prioriterade gap och konkreta åtgärder
4. Fångar leads med namn, e-post och bolag — skickar notis direkt

---

## De 5 NIS2-domänerna

| Domän | Fokus |
|-------|-------|
| Styrning & Ledning | Ansvar, policies, organisation |
| Riskhantering | Riskregister, MFA, patchning |
| Incidentrespons | Detektering, rapportering, loggning |
| Leverantörskedja | Tredjepartsrisk, avtal, åtkomst |
| Tekniska kontroller | EDR, kryptering, backup, IAM |

---

## Microsoft 365-integrationen (Graph API)

### Flöde
1. Användaren klickar **"Analysera med Microsoft 365 – direkt"** på intro-skärmen
2. OAuth 2.0 popup → Microsoft-inloggning
3. Vi hämtar data från Graph API (server-side, client secret exponeras aldrig)
4. Tekniska frågor autofylls → quiz startar med färre frågor kvar
5. Rapporten anpassas efter exakt vad tenanten har och saknar

### Graph API-endpoints vi använder
| Endpoint | Vad vi hämtar |
|----------|---------------|
| `/me` + `/organization` | Namn, e-post, bolagsnamn (prefills formuläret) |
| `/subscribedSkus` | Vilka Microsoft-licenser som är aktiva |
| `/identity/conditionalAccess/policies` | Om MFA-policies finns |
| `/security/secureScores` | Övergripande säkerhetspoäng |

### Licenser vi detekterar
- Microsoft Intune (M365 Business Premium / EMS)
- Microsoft Defender for Endpoint (Plan 1/2)
- Entra ID P1 (Conditional Access)
- Entra ID P2 (PIM, Identity Protection)
- Microsoft Purview (Information Protection)

### Hur många frågor kan autofyllas?
- **Med full licens (M365 E5):** ~9–11 av 25 frågor
- **Med M365 Business Premium:** ~6–8 frågor
- **Med basic M365:** ~2–3 frågor
- **14 frågor kan aldrig autofyllas** — de handlar om processer och dokument (riskregister, leverantörsavtal, incidentplaner) som inget IT-system kan svara på

---

## Licensanpassade åtgärder i rapporten

Rapporten är inte generisk — varje åtgärd anpassas efter vad tenanten faktiskt har:

### Exempel: MFA-frågan

| Situation | Rapporten säger |
|-----------|----------------|
| Har Entra P2 | *"Aktivera riskbaserad Conditional Access + Identity Protection — ingår i er licens"* |
| Har Entra P1 | *"Skapa en CA-policy som kräver MFA — ingår, tar 20 minuter"* |
| Har basic M365 | *"Aktivera Security Defaults — gratis och ingår i alla M365-planer"* |
| Inget M365 | Generisk åtgärd |

### Exempel: Patchning

| Situation | Rapporten säger |
|-----------|----------------|
| Har Intune | *"Konfigurera Windows Update Rings — ingår i er licens"* |
| Saknar Intune | *"Uppgradera till M365 Business Premium för Intune + automatiserad patchning"* |

**11 av 25 åtgärder** är licensanpassade. Resterande är processfrågor där licenser inte spelar roll.

---

## Partnerpositionering i rapporten

Längst ner i varje rapport visas ett CTA-block som:

1. Visar **"Certifierad Microsoft-partner"**-badge (om användaren loggat in med M365)
2. Listar vilka licenser de **redan har** (grön pill)
3. Listar vilka licenser de **saknar** med uppgraderingsväg (röd pill + produkt + ungefärligt pris)
4. CTA: **"Boka kostnadsfri genomgång →"** → bokar möte direkt

### Exempel på vad en lead ser:

```
✅ Microsoft Intune
✅ Entra ID P1

❌ Defender for Endpoint  → M365 Business Premium / Defender Plan 2
❌ Entra ID P2 (PIM)      → Entra ID P2-tillägg (~80 kr/admin/mån)
❌ Microsoft Purview      → M365 E3/E5 eller Purview-tillägg

[Boka kostnadsfri genomgång →]
Vi licensierar, konfigurerar och dokumenterar allt
```

---

## Varför detta är bra för partneraffären

### Kvalificerade leads
- Du vet exakt vilka licenser de saknar **innan** mötet
- Du vet deras NIS2-gap och risknivå
- De har själva identifierat behovet — ingen cold sell

### Förtroende via ärlighet
- Verktyget säger också *"detta ingår redan, aktivera det"*
- Signalerar expertis, inte säljtryck
- Ökar konverteringen när du väl rekommenderar ett köp

### Konkret intäktspotential per lead
- Direkt ur rapporten: saknade licenser × antal användare = ARR-potential
- Ingen manuell behovsanalys — verktyget gör det åt dig

### Differentiering mot andra MS-partners
- De flesta skickar ett generiskt NIS2-faktablad
- Du har analyserat deras faktiska Microsoft-tenant
- Rapporten är unik per kund — kan inte copy-pastas

---

## Teknisk stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | Vanilla HTML/JS, TailwindCSS-inspirerad custom CSS |
| Backend | Node.js / Express (HumanizedTrust backend, port 3004) |
| OAuth | Microsoft OAuth 2.0 Authorization Code Flow |
| Graph API | Axios, server-side token exchange |
| Lead capture | POST `/api/inbound` → HumanizedTrust DB + Resend notis |
| Hosting | nis2klar.se (nginx + Certbot SSL) |

### Azure App Registration
- **Client ID:** e3e945d5-1aa3-4f14-9e7d-8e876613de0d
- **Tenant:** common (multitenant — fungerar för alla MS-kunder)
- **Redirect URI:** https://nis2klar.se/auth/callback.html
- **Scopes:** User.Read, Organization.Read.All, Directory.Read.All, Policy.Read.All, SecurityEvents.Read.All

---

## Fas 2 — möjliga utbyggnader

| Idé | Vad det ger |
|-----|-------------|
| Fler Graph-endpoints (Sentinel, Azure Backup, Attack Simulator) | Fler autofyllda frågor (upp till ~14) |
| PDF-rapport med logotyp | Proffsigare deliverable, enklare att dela internt |
| White label för Nomad | Nomads kunder gör analysen, Nomad ser alla resultat |
| Automatisk uppföljning via Resend | E-postsekvens baserad på risknivå och saknade licenser |
| Jämförelse mot branschsnitt | *"Ni ligger under genomsnittet för er bransch på 3 domäner"* |

---

## Live-länk

**https://nis2klar.se/nis2-gap-analys.html**

*Testas enklast med ett Microsoft 365-konto — logga in på intro-skärmen.*
