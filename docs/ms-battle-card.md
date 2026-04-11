# Microsoft Battle Card — NIS2-segmentet (50+ anställda)
**Internt säljdokument · Jan Malmström · 2026-04-08**

---

## Det viktigaste argumentet: Ett tak

> *"Ni betalar redan för det — ni behöver bara aktivera det."*

M365 Business Premium (kr 285/user/mån) inkluderar:
- **Entra ID P1** (Okta kostar kr 185/user/mån extra)
- **Microsoft Intune** (Jamf kostar kr 300/user/mån extra)
- **Defender for Business** (Sophos/ESET kostar kr 150–250/user/mån extra)
- **Defender for Office 365 Plan 1** (email-security ingår)
- **Azure Information Protection** (Purview basic ingår)

En kund med 100 användare som köper dessa separat betalar **kr 63 500–70 000/mån**.
Samma kund med M365 Business Premium betalar **kr 28 500/mån**.

---

## Konkurentjämförelser

---

### CrowdStrike Falcon vs Microsoft Defender

**Vanlig kundinvändning:** *"Vi har CrowdStrike, det är bättre än Defender."*

| | CrowdStrike Falcon Go/Pro | Microsoft Defender for Endpoint P2 |
|--|--------------------------|-------------------------------------|
| **Pris** | ~kr 250–400/endpoint/mån | Ingår i M365 E3/E5 eller ~kr 185/user/mån |
| **EDR** | ✅ Marknadsledande | ✅ Fullständig XDR |
| **Integration med email** | ❌ Separat produkt | ✅ Defender for Office 365 ingår |
| **Integration med identitet** | ❌ Separat (behöver Okta/AD) | ✅ Entra ID inbyggt |
| **Automatisk isolering vid incident** | ✅ | ✅ |
| **SIEM-integration** | Separat kostnad (Splunk/etc) | Microsoft Sentinel (tillägg) |
| **NIS2-loggning** | ✅ men separat SIEM krävs | ✅ Unified Audit Log ingår i M365 |
| **Antal leverantörer att hantera** | 2–3 (CrowdStrike + IdP + SIEM) | 1 |

**Säljargument:**
- CrowdStrike skyddar endpoints men inte email, identitet eller data — tre av NIS2:s fyra tekniska krav är fortfarande öppna
- Med Defender for Endpoint P2 + M365 får ni XDR, email-skydd, identitetsskydd och loggning i samma portal — en incident syns i ett flöde, inte i tre separata dashboards
- Vid NIS2-tillsyn: en leverantör = en rapport, ett avtal, ett ansvar. Tre leverantörer = tre revisioner

---

### Okta vs Microsoft Entra ID

**Vanlig kundinvändning:** *"Vi kör Okta för SSO och MFA."*

| | Okta Workforce Identity | Microsoft Entra ID P1/P2 |
|--|------------------------|--------------------------|
| **Pris** | kr 185/user/mån (Essentials) | Ingår i M365 Business Premium |
| **SSO** | ✅ | ✅ |
| **MFA / Conditional Access** | ✅ | ✅ |
| **Privileged Access (PIM)** | Okta PAM — separat produkt, dyrt | ✅ Ingår i Entra P2 |
| **Integration med M365/Teams** | Fungerar men kräver konfiguration | ✅ Native |
| **Device compliance** | ❌ Behöver Intune eller Jamf | ✅ Native med Intune |
| **Identity Protection (AI-risk)** | ✅ | ✅ Ingår i P2 |
| **NIS2 access reviews** | ✅ tillägg | ✅ Ingår i P2 |

**Säljargument:**
- Okta är ett utmärkt fristående IAM-verktyg — men kostar kr 185+/user/mån **utöver** M365-licensen ni redan betalar
- Entra ID P1 ingår redan i M365 Business Premium. Ni betalar alltså dubbelt för IAM om ni kör Okta ovanpå M365
- Entra P2 (PIM + riskbaserad inloggning) kostar ca kr 80/user/mån som tillägg — jämfört med Okta Advanced Server Access som kostar mångfalt mer
- För NIS2: Entra + Intune + Defender ger ett sammanhängande Zero Trust-ramverk. Okta + Jamf + CrowdStrike ger tre separata ramverk som måste integreras manuellt

---

### Jamf vs Microsoft Intune

**Vanlig kundinvändning:** *"Vi har mycket Mac — vi kör Jamf."*

| | Jamf Pro/Business | Microsoft Intune |
|--|-------------------|-----------------|
| **Pris** | kr 280–350/device/mån | Ingår i M365 Business Premium |
| **Mac-hantering** | ✅ Marknadsledande | ✅ Bra (förbättrat kraftigt 2023–2025) |
| **Windows-hantering** | ❌ Inte relevant | ✅ Fullständig |
| **iOS/Android** | ✅ | ✅ |
| **Integration med Entra ID** | Kräver konfiguration | ✅ Native |
| **Autopatch** | ❌ | ✅ Ingår |
| **Compliance policies för CA** | Via integration | ✅ Native med Entra |
| **NIS2 enhetsloggning** | ✅ men separat | ✅ Unified med Defender |

**Säljargument:**
- Jamf är bäst för Mac-only-miljöer. Men de flesta bolag med 50+ anställda har en blandad miljö (Windows + Mac + mobil)
- Intune hanterar alla tre plattformarna i ett verktyg som redan ingår i licensen
- Det verkliga problemet med Jamf: det saknar native integration med identitet och säkerhet. En enhet kan vara Jamf-hanterad men ha gammal mjukvara, okrypterad disk och inga CA-regler — och det syns inte i ett samlat flöde
- Med Intune + Entra + Defender ser ni i realtid: enhet → användare → policy → risk. En vy.

---

### Sophos / ESET vs Microsoft Defender

**Vanlig kundinvändning:** *"Vi har Sophos/ESET, det har vi alltid haft."*

| | Sophos Intercept X Advanced | Microsoft Defender for Business |
|--|----------------------------|----------------------------------|
| **Pris** | kr 180–250/user/mån | Ingår i M365 Business Premium |
| **Antivirus** | ✅ | ✅ |
| **EDR** | ✅ (Intercept X Advanced) | ✅ |
| **XDR (email + identity + endpoint)** | ❌ Separat Sophos-produkter | ✅ Native |
| **Managed detection (MDR)** | ✅ Sophos MDR (dyr tillval) | Microsoft Defender Experts (tillägg) |
| **Central management** | Sophos Central | Microsoft Defender-portalen |
| **NIS2-loggning** | ✅ men separat SIEM | ✅ Unified Audit Log |
| **Antal leverantörer** | 1 (men täcker bara endpoint) | 1 (täcker endpoint + email + identitet) |

**Säljargument:**
- Sophos och ESET är bra antiviruslösningar från en era när hot kom via filer och USB-minnen
- Moderna hot (phishing, credential theft, supply chain attacks) kräver korrelation mellan email, identitet och endpoint — det klarar inte Sophos eller ESET utan ytterligare produkter
- Microsoft Defender for Business (ingår i Business Premium) är faktiskt topprankad av Gartner och AV-TEST i EDR-kategorin — myten att Defender är sämre är 5 år gammal
- Sophos kostar kr 180–250/user/mån och täcker bara endpoints. Defender ingår och täcker hela ytan

---

### Google Workspace vs Microsoft 365

**Vanlig kundinvändning:** *"Vi kör Google — det är billigare och enklare."*

| | Google Workspace Business Plus | Microsoft 365 Business Premium |
|--|--------------------------------|--------------------------------|
| **Pris** | ~kr 220/user/mån | ~kr 285/user/mån |
| **Email / Kalender** | ✅ Gmail | ✅ Outlook |
| **Samarbete** | ✅ Docs/Sheets/Meet | ✅ Teams/Office |
| **Endpoint Management (MDM)** | Basic (Google Endpoint Management) | ✅ Intune — fullständig MDM/MAM |
| **EDR** | ❌ Saknas | ✅ Defender for Business |
| **MFA / Conditional Access** | Basic MFA | ✅ Entra ID P1 med CA |
| **PIM / PAM** | ❌ Saknas | ✅ Entra P2 (tillägg) |
| **SIEM / Audit** | Google Cloud Audit Logs (separat) | ✅ Unified Audit Log ingår |
| **DLP / Dataklassificering** | Basic | ✅ Purview |
| **NIS2-kontroller inbyggda** | ~3–4 av 25 | ~9–11 av 25 |

**Säljargument:**
- Google är kr 65/user/mån billigare — men det inkluderar ingen EDR, inget fullständigt MDM, ingen PIM
- För NIS2 behöver en Google-kund lägga till: CrowdStrike (~kr 300) + Okta (~kr 185) + Jamf (~kr 300) = kr 785 extra per user per månad
- Total kostnad: Google kr 220 + tillägg kr 785 = **kr 1 005/user/mån** vs M365 Business Premium **kr 285/user/mån**
- Google är rätt val för ett techbolag som inte berörs av NIS2. För ett NIS2-skyldigt bolag är det ett dyrt val

---

## Sammanfattning: Microsoft vs fältet

| Kontroll | Microsoft | Best-of-breed alternativ | Merkostnad |
|----------|-----------|--------------------------|------------|
| Email-skydd | ✅ Defender for O365 (ingår) | Proofpoint ~kr 120/user | +kr 120 |
| EDR | ✅ Defender (ingår) | CrowdStrike ~kr 300/user | +kr 300 |
| MDM | ✅ Intune (ingår) | Jamf ~kr 300/device | +kr 300 |
| IAM/MFA | ✅ Entra P1 (ingår) | Okta ~kr 185/user | +kr 185 |
| PAM/PIM | ✅ Entra P2 (~kr 80 tillägg) | CyberArk/BeyondTrust ~kr 500+ | +kr 420 |
| DLP | ✅ Purview basic (ingår) | Forcepoint ~kr 200/user | +kr 200 |
| **Total** | **~kr 285–365/user/mån** | **~kr 1 785+/user/mån** | **+kr 1 420** |

---

## Mot NIS2-tillsyn: ett-tak-argumentet

NIS2 kräver att ni kan **dokumentera och bevisa** era kontroller vid tillsyn.

**Med 5 olika leverantörer:**
- 5 separata portaler
- 5 separata loggar att korrelera
- 5 separata avtal att granska (leverantörskedjeansvar enligt NIS2 artikel 21)
- 5 separata SLA:er att hänvisa till vid incident
- Integrationer som kan gå sönder vid uppdateringar

**Med Microsoft:**
- En portal (Defender XDR / Security Center)
- En unified audit log
- Ett avtal (Microsoft-kundavtalet)
- En rapport till MSB som täcker hela ytan

> *"Vid en MSB-tillsyn vill ni visa ett sammanhängande säkerhetsramverk — inte ett lapptäcke av verktyg som fungerar var för sig."*

---

## Snabbsvar på vanliga invändningar

**"CrowdStrike är bättre än Defender"**
> Defender for Endpoint P2 är topprankad av Gartner och AV-TEST. Skillnaden är marginell — men CrowdStrike täcker bara endpoints. Defender täcker endpoint + email + identitet + data i ett flöde.

**"Vi har redan Okta, det fungerar bra"**
> Det fungerar säkert bra — men ni betalar kr 185/user/mån för något som ingår i er M365-licens. Vi kan migrera er till Entra ID och sänka er månadskostnad direkt.

**"Jamf är bäst för Mac"**
> Det stämmer historiskt. Intune har kommit ikapp kraftigt och hanterar nu Mac lika bra för de flesta use cases — och hanterar dessutom Windows och mobiler. Jamf täcker bara Mac.

**"Google är billigare"**
> Google är billigare för email och kalender. För NIS2 behöver ni lägga till EDR, MDM och IAM — då är Google 3x dyrare totalt.

**"Vi är vana vid våra nuvarande verktyg"**
> Det förstår jag. Frågan är inte om de fungerar — det gör de säkert. Frågan är om ni vill betala kr 1 400 extra per user per månad och hantera 4 leverantörsrelationer för att bibehålla den vanan.

---

*Dokument: `/home/janne/humanizedtrust/docs/ms-battle-card.md`*
*Uppdatera prisuppgifter kvartalsvis — MS justerar priser regelbundet.*
