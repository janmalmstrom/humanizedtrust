(function () {
  var CONSENT_KEY = 'nis2klar_cookie_consent';

  if (localStorage.getItem(CONSENT_KEY)) return;

  var style = document.createElement('style');
  style.textContent = [
    '#ck{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1c1c1f;border-top:2px solid #f5c518;',
    'padding:20px 32px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;',
    'flex-wrap:wrap;box-shadow:0 -4px 32px rgba(0,0,0,0.5);font-family:Barlow,sans-serif;}',
    '#ck-text{flex:1;min-width:260px;}',
    '#ck-text p{margin:0 0 6px;color:#ccc;font-size:15px;line-height:1.6;}',
    '#ck-text a{color:#f5c518;font-size:13px;}',
    '#ck-toggle{background:none;border:none;color:#f5c518;font-size:13px;cursor:pointer;padding:0;text-decoration:underline;}',
    '#ck-details{margin-top:12px;display:none;gap:10px;flex-direction:column;}',
    '#ck-details.open{display:flex;}',
    '.ck-box{background:#141416;border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:12px 16px;}',
    '.ck-box-title{font-size:13px;font-weight:700;margin-bottom:4px;}',
    '.ck-box-body{font-size:13px;color:#888;}',
    '#ck-btns{display:flex;gap:12px;align-items:center;flex-shrink:0;flex-wrap:wrap;}',
    '#ck-reject{background:transparent;border:1px solid rgba(255,255,255,0.15);color:#aaa;',
    'border-radius:4px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;font-family:Barlow,sans-serif;}',
    '#ck-reject:hover{border-color:#aaa;}',
    '#ck-accept{background:#f5c518;border:none;color:#000;border-radius:4px;',
    'padding:10px 24px;font-size:14px;font-weight:800;cursor:pointer;font-family:Poppins,sans-serif;}',
    '#ck-accept:hover{background:#e0b010;}',
    '@media(max-width:600px){#ck{padding:16px 20px;}#ck-btns{width:100%;}}'
  ].join('');
  document.head.appendChild(style);

  var banner = document.createElement('div');
  banner.id = 'ck';
  banner.innerHTML = [
    '<div id="ck-text">',
      '<p>🍪 Vi använder nödvändiga cookies för att webbplatsen ska fungera. Inga spårningscookies eller annonscookies används.',
        ' <button id="ck-toggle">Mer information</button>',
      '</p>',
      '<div id="ck-details">',
        '<div class="ck-box">',
          '<div class="ck-box-title" style="color:#4ade80">✅ Nödvändiga cookies (alltid aktiva)</div>',
          '<div class="ck-box-body">Sessionscookies som krävs för att webbplatsen ska fungera korrekt. Lagras bara under ditt besök.</div>',
        '</div>',
        '<div class="ck-box">',
          '<div class="ck-box-title" style="color:#60a5fa">🔤 Google Fonts</div>',
          '<div class="ck-box-body">Vi laddar typsnitt från Google Fonts. Google kan sätta en funktionell cookie. Inga personuppgifter delas för reklamändamål.</div>',
        '</div>',
      '</div>',
      '<p style="margin-top:10px;font-size:13px;">',
        '<a href="/integritetspolicy.html">Integritetspolicy</a>',
        ' &nbsp;·&nbsp; ',
        '<a href="/cookies.html">Cookiepolicy</a>',
      '</p>',
    '</div>',
    '<div id="ck-btns">',
      '<button id="ck-reject">Endast nödvändiga</button>',
      '<button id="ck-accept">Godkänn alla</button>',
    '</div>'
  ].join('');

  document.body.appendChild(banner);

  document.getElementById('ck-toggle').addEventListener('click', function () {
    var d = document.getElementById('ck-details');
    d.classList.toggle('open');
    this.textContent = d.classList.contains('open') ? 'Dölj detaljer' : 'Mer information';
  });

  document.getElementById('ck-accept').addEventListener('click', function () {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    document.getElementById('ck').remove();
  });

  document.getElementById('ck-reject').addEventListener('click', function () {
    localStorage.setItem(CONSENT_KEY, 'essential');
    document.getElementById('ck').remove();
  });
})();
