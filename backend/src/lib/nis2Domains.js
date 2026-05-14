/**
 * Shared NIS2 domain data — used by generateGapPdf.js and inbound.js
 */
const DOMAINS = [
  {
    name: 'Styrning & Ledning',
    recs: [
      { title: 'Utse en NIS2-ansvarig med mandat', why: 'NIS2 artikel 20 kräver att ledningen tar aktivt ansvar — utan en utsedd person faller ansvaret i tomrum, och böterna drabbar ledningen personligen.', action: 'Utse en NIS2-ansvarig (behöver inte vara heltid). Dokumentera rollen i ett styrelsebeslut eller VD-direktiv. Kombineras ofta med IT-chefs- eller CFO-rollen i mindre bolag.' },
      { title: 'Ta fram och besluta om informationssäkerhetspolicy', why: 'En formellt beslutad policy är grundkravet för NIS2-efterlevnad och en förutsättning för att bygga resten av ramverket.', action: 'En sida räcker som start. Policyn ska täcka: syfte, scope, ägarskap och grundläggande principer. Låt styrelsen eller VD skriva under och kommunicera den till hela organisationen.' },
      { title: 'Sätt cybersäkerhet på styrelsens agenda', why: 'NIS2 slår fast att ledningen bär personligt ansvar för brister — om styrelsen inte diskuterar det dokumenterat kan de inte visa due diligence vid en tillsyn.', action: 'Lägg in "Cybersäkerhet & NIS2-status" som fast punkt på kvartalsvis styrelsemöte. Dokumentera diskussionen i protokollet. 15 minuter per möte räcker.' },
      { title: 'Dokumentera roller och ansvar för informationssäkerhet', why: 'Vid en MSB-tillsyn är det första de frågar "vem ansvarar för vad?" Utan dokumentation kan ni inte bevisa att ni lever upp till NIS2.', action: 'Skapa en enkel RACI-matris för era viktigaste informationssäkerhetsprocesser. En tabell i Word räcker som start.' },
      { title: 'Implementera regelbundna säkerhetsutbildningar', why: '90% av alla säkerhetsincidenter börjar med ett mänskligt misstag. NIS2 kräver att ni adresserar den mänskliga faktorn.', action: 'Kör en obligatorisk 30-minutersutbildning om phishing och lösenordssäkerhet en gång per år för all personal.' },
    ],
  },
  {
    name: 'Riskhantering',
    recs: [
      { title: 'Skapa ett IT-riskregister', why: 'NIS2 kräver ett systematiskt riskhanteringsramverk. Utan ett riskregister kan ni inte prioritera resurser eller visa att ni hanterar risker proaktivt.', action: 'Lista era 10 viktigaste IT-risker med sannolikhet (1–5), konsekvens (1–5) och ägare. Uppdatera kvartalsvis.' },
      { title: 'Implementera årliga riskbedömningar', why: 'Hotbilden förändras snabbt. En engångsbedömning räcker inte — NIS2 förväntar sig ett kontinuerligt riskarbete.', action: 'Koppla riskbedömningen till budgetprocessen (t.ex. oktober varje år). Bjud in IT, juridik och minst en ledningsperson.' },
      { title: 'Inventera och klassificera era informationstillgångar', why: 'Ni kan inte skydda det ni inte vet att ni har. Inventering är grundstenen för att prioritera skyddsåtgärder rätt.', action: 'Börja med system som hanterar personuppgifter, finansdata eller operationskritisk information.' },
      { title: 'Aktivera MFA för alla användare', why: 'MFA förhindrar 99,9% av kontorelaterade attacker enligt Microsoft. Det är den enskilt viktigaste tekniska kontrollen du kan implementera idag.', action: 'Aktivera Microsoft Entra ID Conditional Access (ingår i M365 Business Premium). Kräv MFA för all inloggning.' },
      { title: 'Inför systematisk patch-hantering', why: 'Opatchade system är inkörsport nummer ett för ransomware. NIS2 kräver att ni adresserar kända sårbarheter proaktivt.', action: 'Aktivera automatisk patchning för Windows via Windows Update for Business eller Microsoft Intune. Kritiska patchar inom 48h.' },
    ],
  },
  {
    name: 'Incidentrespons',
    recs: [
      { title: 'Ta fram och testa en incidentresponsplan', why: 'NIS2 kräver att ni har dokumenterade rutiner för att hantera incidenter. En oövad plan är i praktiken ingen plan.', action: 'Dokumentera: vem beslutar vad, vem kontaktar MSB, vem kommunicerar med kunder. Öva med en bordsövning en gång per år.' },
      { title: 'Bygg förmåga att identifiera incidenter snabbt', why: 'NIS2:s 24-timmarskrav för initial rapportering förutsätter att ni märker incidenten snabbt.', action: 'Implementera Microsoft Sentinel eller aktivera Microsoft Defender XDR om ni redan har M365.' },
      { title: 'Förbered MSB-rapporteringsprocessen', why: 'NIS2 kräver initial notification till MSB inom 24 timmar — och fullständig rapport inom 72 timmar.', action: 'Registrera er i MSB:s rapporteringsportal. Utse vem som ansvarar för att skicka rapporten.' },
      { title: 'Aktivera loggning och övervakning', why: 'Utan loggar kan ni inte svara på "vad hände, när och hur?" — vilket krävs för incidentrapportering och forensisk analys.', action: 'Aktivera Unified Audit Log i Microsoft 365. Sätt upp loggretention på minst 90 dagar.' },
      { title: 'Skapa en extern kommunikationsplan', why: 'Hur ni kommunicerar under en incident påverkar förtroende och varumärke kraftigt.', action: 'Definiera vem som kommunicerar med: kunder, media, myndigheter och styrelse. Ha färdiga meddelandemallar.' },
    ],
  },
  {
    name: 'Leverantörskedja',
    recs: [
      { title: 'Inventera era kritiska IT-leverantörer', why: 'NIS2 lägger explicit ansvar på er för era leverantörers säkerhet. Ni kan inte hantera risker ni inte känner till.', action: 'Skapa en leverantörslista med: leverantörsnamn, vilken data de hanterar, vilka system de har tillgång till.' },
      { title: 'Inför dokumenterade säkerhetskrav på leverantörer', why: 'NIS2 kräver att ni säkerställer att leverantörer uppfyller lämpliga säkerhetsnivåer.', action: 'Ta fram en 1-sidig "Säkerhetskravsbilaga" som biläggs alla nya leverantörsavtal.' },
      { title: 'Granska leverantörers säkerhetsnivå', why: 'En leverantör som uppfyllde kraven för två år sedan kanske inte gör det idag.', action: 'Kräv att kritiska leverantörer kan visa ISO 27001, SOC 2 Type II eller liknande certifiering.' },
      { title: 'Uppdatera leverantörsavtal med NIS2-klausuler', why: 'Utan avtalsstöd kan ni inte kräva åtgärder av leverantörer eller hålla dem ansvariga vid incidenter.', action: 'Gå igenom era 5 viktigaste leverantörsavtal och lägg till klausuler om rätt till revision och incidentrapporteringsskyldighet.' },
      { title: 'Kontrollera tredjepartsåtkomst systematiskt', why: 'Leverantörer med okontrollerad tillgång till era system är en av de vanligaste ingångspunkterna för attacker.', action: 'Implementera Privileged Identity Management (PIM) i Microsoft Entra ID — ger just-in-time-åtkomst.' },
    ],
  },
  {
    name: 'Tekniska kontroller',
    recs: [
      { title: 'Segmentera era nätverk', why: 'Utan nätverkssegmentering kan en angripare röra sig fritt till alla system — det förvandlar ett begränsat intrång till en fullskalig attack.', action: 'Separera minst: gästnätverk, produktionsnätverk och OT-nätverk. Konfigurera firewall-regler mellan segmenten.' },
      { title: 'Distribuera endpoint-skydd på alla enheter', why: 'Enheter utan EDR är blinda fläckar i er säkerhetsövervakning.', action: 'Aktivera Microsoft Defender for Endpoint på alla Windows-enheter (ingår i M365 Business Premium).' },
      { title: 'Implementera kryptering för känslig data', why: 'Om en angripare tar era data ska de inte kunna läsa dem. Kryptering är sista försvarslinjen och ett explicit NIS2-krav.', action: 'Aktivera BitLocker på alla bärbara datorer. Aktivera kryptering i SharePoint och OneDrive.' },
      { title: 'Testa era backup- och återställningsprocedurer', why: 'En backup som aldrig testats är inte en backup. Ransomware-attacker riktar sig specifikt mot backuper.', action: 'Följ 3-2-1-regeln: 3 kopior, 2 medier, 1 offsite/offline. Testa återställning minst en gång per år.' },
      { title: 'Inför IAM med principen om minsta privilegium', why: 'Överdrivna behörigheter är en av de vanligaste anledningarna till att angripare kan göra stor skada.', action: 'Genomför en behörighetsrevision. Implementera Microsoft Entra ID PIM för administratörskonton.' },
    ],
  },
];

module.exports = { DOMAINS };
