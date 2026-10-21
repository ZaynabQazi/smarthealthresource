'use strict';
/* External source router — live retrieval against the approved external sources.
   Every answer carries Source / Retrieved timestamp / Data status.
   External data is reference-only and is NEVER written back into the internal dataset. */

const UA = 'SmartHealthAllocator/1.0 (NGO decision-support prototype; contact: ngo@smarthealth.org)';

const SRC = {
  who: { name: 'WHO Global Health Observatory (OData API)', url: 'https://www.who.int/data/gho/info/gho-odata-api' },
  osm: { name: 'OpenStreetMap (Overpass API)', url: 'https://wiki.openstreetmap.org/wiki/Overpass_API' },
  ndma: { name: 'NDMA — National Disaster Management Authority, Alerts', url: 'https://ndma.gov.pk/alerts' },
  rescue: { name: 'Rescue 1122 — Punjab Emergency Service', url: 'https://www.rescue.gov.pk/' },
  census: { name: 'Pakistan Bureau of Statistics — 2023 Digital Census portal', url: 'https://census23.pbos.gov.pk/' },
  pslm: { name: 'PSLM District Dashboard (SDGs)', url: 'https://pslm-sdgs.data.gov.pk/districtlevel' },
  econ: { name: 'PBS Geo-Economic Observatory', url: 'https://economic.data.gov.pk/' },
  punjab: { name: 'Punjab Primary & Secondary Healthcare Department — BHU listing', url: 'https://pshealthpunjab.gov.pk/Home/BHU' }
};

async function fetchText(url, ms, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...extraHeaders }, signal: controller.signal });
    const text = res.ok ? await res.text() : '';
    return { reachable: true, ok: res.ok, status: res.status, text };
  } catch (e) {
    return { reachable: false, ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : 'network error' };
  } finally { clearTimeout(timer); }
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}
function staticText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}
function isoNow() { return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }

/* ---------- per-language framing ---------- */

const HEAD = {
  en: s => `EXTERNAL SOURCE — live retrieval\n${s}`,
  ur: s => `بیرونی ذریعہ — براہِ راست حصول\n${s}`,
  roman: s => `EXTERNAL SOURCE — live retrieval\n${s}`
};
const REF = {
  en: 'Reference only — external data never changes the internal dashboard dataset or priority scores. The NGO officer\'s decision remains final.',
  ur: 'یہ ڈیٹا صرف حوالے کے لیے ہے — یہ اندرونی ڈیش بورڈ ڈیٹا یا ترجیحی اسکورز کو ہرگز تبدیل نہیں کرتا۔ حتمی فیصلہ این جی او افسر کا ہے۔',
  roman: 'Reference ke liye hai — external data kabhi internal dashboard data ya priority scores ko change nahi karta. Final faisla NGO officer ka hai.'
};
const LBL = {
  src: { en: 'Source', ur: 'ذریعہ', roman: 'Source' },
  ret: { en: 'Retrieved', ur: 'حصول کا وقت', roman: 'Retrieved' },
  stat: { en: 'Data status', ur: 'ڈیٹا کی حیثیت', roman: 'Data status' },
  see: { en: 'View source:', ur: 'ذریعہ دیکھیں:', roman: 'Source dekhein:' }
};
function frame(L, src, body, status, extra) {
  return `${HEAD[L](body)}\n—\n${LBL.src[L]}: ${src.name}\n${LBL.ret[L]}: ${isoNow()}\n${LBL.stat[L]}: ${status[L] || status.en}\n${LBL.see[L]} ${src.url}${extra ? '\n' + extra : ''}\n\n${REF[L]}`;
}

/* status strings: {en, ur, roman} */
const ST = {
  liveInd: { en: 'live — indicators retrieved', ur: 'براہِ راست — اشاریے حاصل ہو گئے', roman: 'live — indicators mil gaye' },
  liveFac: n => ({ en: `live — ${n} mapped facilit${n === 1 ? 'y' : 'ies'} retrieved`, ur: `براہِ راست — ${n} سہولیات حاصل ہو گئیں`, roman: `live — ${n} facilities mil gaye` }),
  osmZero: { en: 'live retrieval — 0 results (reflects OpenStreetMap coverage, not ground reality)', ur: 'براہِ راست حصول — صفر نتائج (یہ OpenStreetMap کی کوریج کی حد ہے، زمینی حقیقت نہیں)', roman: 'live retrieval — 0 results (OpenStreetMap ki coverage ki had hai, ground reality nahi)' },
  dynamic: { en: 'page reachable — content loads dynamically, no data extractable from static HTML', ur: 'صفحہ دستیاب ہے — مواد ڈائنامک لوڈ ہوتا ہے، جامد HTML سے کوئی ڈیٹا حاصل نہیں ہو سکا', roman: 'page reachable — content dynamically load hota hai, static HTML se data extract nahi ho saka' },
  down: code => ({ en: `unavailable — server returned HTTP ${code}`, ur: `دستیاب نہیں — سرور نے HTTP ${code} دیا`, roman: `available nahi — server ne HTTP ${code} diya` }),
  fail: { en: 'retrieval failed — network error or timeout', ur: 'حصول ناکام — نیٹ ورک خرابی یا ٹائم آؤٹ', roman: 'retrieval fail — network error ya timeout' },
  liveExtract: { en: 'live — text extracted from page', ur: 'براہِ راست — صفحے سے متن حاصل ہوا', roman: 'live — page se text mila' }
};

/* ---------- WHO GHO (live OData) ---------- */

const WHO_INDICATORS = [
  { code: 'WHOSIS_000001', name: 'Life expectancy at birth (years)', re: /life expectancy|اوسط عمر|عمر|umar|umr/i },
  { code: 'UHC_INDEX_REPORTED', name: 'UHC service coverage index (0–100)', re: /uhc|universal health|coverage|کوریج/i },
  { code: 'MDG_0000000001', name: 'Under-five mortality rate (per 1,000 live births)', re: /under.?5|under.?five|child mortal|infant|بچوں کی اموات|بچوں/i },
  { code: 'MDG_0000000026', name: 'Maternal mortality ratio (per 100,000 live births)', re: /maternal|مادرانہ|زچگی|maadrana/i }
];
async function whoRow(code) {
  const url = `https://ghoapi.azureedge.net/api/${encodeURIComponent(code)}?$filter=${encodeURIComponent("SpatialDim eq 'PAK'")}&$top=5&$orderby=${encodeURIComponent('TimeDim desc')}`;
  const r = await fetchText(url, 12000, { Accept: 'application/json' });
  if (!r.ok) return { code, error: r.status || r.error };
  const rows = JSON.parse(r.text).value;
  const row = rows.find(x => x.Dim1 === 'BTSX') || rows.find(x => !x.Dim1) || rows[0];
  return { code, row };
}
async function handleWho(L, raw) {
  const picked = WHO_INDICATORS.filter(i => i.re.test(raw)).slice(0, 3);
  const chosen = picked.length ? picked : [WHO_INDICATORS[0], WHO_INDICATORS[1]];
  const results = await Promise.all(chosen.map(i => whoRow(i.code)));
  const lines = [];
  let okCount = 0;
  for (let i = 0; i < chosen.length; i++) {
    const r = results[i];
    if (r.error || !r.row) { lines.push(`• ${chosen[i].name}: unavailable right now (${r.error === 'timeout' ? 'request timed out' : r.error === 'network error' ? 'could not reach the API' : 'HTTP ' + r.error})`); continue; }
    okCount++;
    const row = r.row;
    const val = String(row.Value);
    const bounds = !val.includes('[') && row.Low != null && row.High != null ? ` [uncertainty range ${Math.round(row.Low * 10) / 10}–${Math.round(row.High * 10) / 10}]` : '';
    lines.push(`• ${chosen[i].name} — Pakistan: ${val} (${row.TimeDim})${bounds}`);
  }
  const intro = {
    en: `Live WHO Global Health Observatory data for Pakistan (latest reported years):`,
    ur: `پاکستان کے لیے ڈبلیو ایچ او گلوبل ہیلتھ آبزرویٹری کا براہِ راست ڈیٹا (تازہ دستیاب سال):`,
    roman: `Pakistan ke liye WHO Global Health Observatory ka live data (latest available years):`
  }[L];
  const status = okCount ? ST.liveInd : ST.fail;
  return { answer: frame(L, SRC.who, `${intro}\n${lines.join('\n')}`, status), status: okCount ? 'ok' : 'fail' };
}

/* ---------- OpenStreetMap Overpass (live, GET + User-Agent required) ---------- */

const DISTRICT_CENTRE = { Muzaffargarh: [30.0736, 71.1798], Rajanpur: [29.1044, 70.3283] };
function osmTarget(analysis, dataset) {
  const hit = (analysis.villages || []).find(v => typeof v.latitude === 'number' && typeof v.longitude === 'number');
  if (hit) return { label: `${hit.village} (${hit.id}) — supplied GPS coordinates`, lat: hit.latitude, lon: hit.longitude, exact: true };
  const centre = DISTRICT_CENTRE[analysis.district];
  if (centre) return { label: `${analysis.district} district — city-centre reference point (approximate; question did not name a mapped village)`, lat: centre[0], lon: centre[1], exact: false };
  return { label: 'Muzaffargarh city — default reference point (approximate)', lat: 30.0736, lon: 71.1798, exact: false };
}
async function handleOsm(L, analysis, dataset) {
  const t = osmTarget(analysis, dataset);
  const q = `[out:json][timeout:25];(node(around:15000,${t.lat},${t.lon})[amenity~"^(hospital|clinic|doctors|pharmacy)$"];way(around:15000,${t.lat},${t.lon})[amenity~"^(hospital|clinic|doctors|pharmacy)$"];);out tags center 15;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let r = null;
  for (const ep of endpoints) {
    r = await fetchText(`${ep}?data=${encodeURIComponent(q)}`, 30000, { Accept: 'application/json' });
    if (r.ok) break;
  }
  const areaLine = {
    en: `Live OpenStreetMap query — mapped health facilities within ~15 km of: ${t.label}.`,
    ur: `براہِ راست OpenStreetMap سوال — اس مقام کے تقریباً 15 کلومیٹر کے اندر کی نقشے پر موجود صحت کی سہولیات: ${t.label}۔`,
    roman: `Live OpenStreetMap query — ${t.label} ke around 15 km mein mapped health facilities.`
  }[L];
  if (!r.ok) {
    const detail = !r.reachable ? (r.error === 'timeout' ? 'request timed out' : 'network error') : `HTTP ${r.status} from both the main and mirror endpoints`;
    const msg = { en: `The Overpass API could not be reached right now (${detail}). No facility data was retrieved, and I will not guess.`, ur: `اوور پاس اے پی آئی اس وقت دستیاب نہیں (${detail === 'request timed out' ? 'درخواست کا وقت ختم' : detail === 'network error' ? 'نیٹ ورک خرابی' : detail})۔ کوئی سہولتی ڈیٹا حاصل نہیں ہوا، اور میں اندازہ نہیں لگاؤں گا۔`, roman: `Overpass API abhi reach nahi hua (${detail === 'request timed out' ? 'request timeout' : detail === 'network error' ? 'network error' : detail}). Koi facility data nahi mila, aur main guess nahi karunga.` }[L];
    return { answer: frame(L, SRC.osm, `${areaLine}\n${msg}`, r.reachable ? ST.down(r.status) : ST.fail), status: 'fail' };
  }
  const els = JSON.parse(r.text).elements || [];
  if (!els.length) {
    const zeroMsg = {
      en: `0 mapped facilities were returned. IMPORTANT: this reflects OpenStreetMap's map coverage for this area, NOT the absence of health facilities on the ground — please verify locally before planning.`,
      ur: `صفر سہولیات واپس آئیں۔ اہم: یہ OpenStreetMap کے نقشے کی اس علاقے میں کوریج کی حد ظاہر کرتا ہے، زمین پر سہولیات کی عدم موجودگی نہیں — منصوبہ بندی سے پہلے مقامی طور پر تصدیق کریں۔`,
      roman: `0 mapped facilities milein. IMPORTANT: yeh OpenStreetMap ki coverage ki had hai, ground par facilities ki non-availability nahi — planning se pehle locally verify karein.`
    }[L];
    return { answer: frame(L, SRC.osm, `${areaLine}\n${zeroMsg}`, ST.osmZero), status: 'ok' };
  }
  const lines = els.slice(0, 15).map(e => `• ${e.tags && e.tags.name ? e.tags.name : '(unnamed in OpenStreetMap)'} — ${e.tags ? e.tags.amenity : 'unknown'}`);
  const countNote = { en: `${els.length} mapped facilit${els.length === 1 ? 'y' : 'ies'} found (showing up to 15). Names and classifications come from OpenStreetMap contributors and may be incomplete or outdated — verify locally before planning.`, ur: `${els.length} سہولیات ملیں (زیادہ سے زیادہ 15 دکھائی جا رہی ہیں)۔ نام اور درجہ بندی OpenStreetMap کے معاونین سے ہے اور نامکمل یا پرانی ہو سکتی ہے — منصوبہ بندی سے پہلے مقامی تصدیق کریں۔`, roman: `${els.length} facilities mileen (max 15 dikhaye). Naam OpenStreetMap contributors ke hain — incomplete ya purane ho sakte hain, locally verify karein.` }[L];
  return { answer: frame(L, SRC.osm, `${areaLine}\n${lines.join('\n')}\n${countNote}`, ST.liveFac(els.length)), status: 'ok' };
}

/* ---------- NDMA alerts (live check, honest dynamic-content report) ---------- */

async function handleNdma(L) {
  const r = await fetchText(SRC.ndma.url, 15000);
  const lead = { en: 'Live check of the NDMA alerts page:', ur: 'این ڈی ایم اے الرٹس صفحے کی براہِ راست جانچ:', roman: 'NDMA alerts page ki live check:' }[L];
  if (!r.reachable) {
    const msg = { en: `The NDMA site could not be reached (${r.error === 'timeout' ? 'timed out' : 'network error'}). No alert information was retrieved, and I will not guess.`, ur: `این ڈی ایم اے کی ویب سائٹ دستیاب نہیں (${r.error === 'timeout' ? 'وقت ختم' : 'نیٹ ورک خرابی'})۔ کوئی الرٹ معلومات حاصل نہیں ہوئی، اور میں اندازہ نہیں لگاؤں گا۔`, roman: `NDMA site reach nahi hui (${r.error === 'timeout' ? 'timeout' : 'network error'}). Koi alert info nahi mili, main guess nahi karunga.` }[L];
    return { answer: frame(L, SRC.ndma, `${lead}\n${msg}`, ST.fail), status: 'fail' };
  }
  if (!r.ok) return { answer: frame(L, SRC.ndma, `${lead}\n${{ en: `The page returned HTTP ${r.status}. No alert data retrieved.`, ur: `صفحے نے HTTP ${r.status} دیا۔ کوئی الرٹ ڈیٹا حاصل نہیں ہوا۔`, roman: `Page ne HTTP ${r.status} diya. Alert data nahi mila.` }[L]}`, ST.down(r.status)), status: 'fail' };
  const text = staticText(r.text).slice(0, 20000);
  const looksLikeNavigation = s => /home\s+about|sitemap|skip to (main )?content|cookie|all rights reserved|©/i.test(s)
    || (s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){5,}/g) || []).length > 0; // runs of 6+ consecutive capitalized words = menu
  const snippets = text.split(/(?<=[.!?۔])\s+/)
    .filter(s => s.trim().length >= 60)
    .filter(s => !looksLikeNavigation(s))
    .filter(s => /alert|warning|advisory|flood|انتباہ|سیلاب|خبردار/i.test(s) && /\b(20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(s))
    .slice(0, 2);
  if (snippets.length) {
    return { answer: frame(L, SRC.ndma, `${lead}\n${{ en: 'The page is reachable and the following alert-related text was found in the page content:', ur: 'صفحہ دستیاب ہے اور صفحے کے مواد میں درج ذیل الرٹ سے متعلق متن ملا:', roman: 'Page reachable hai aur content mein yeh alert-related text mila:' }[L]}\n${snippets.map(s => '• ' + s.trim().slice(0, 300)).join('\n')}`, ST.liveExtract), status: 'ok' };
  }
  const title = titleOf(r.text);
  const msg = {
    en: `The page loaded successfully (HTTP 200${title ? `; page title: “${title}”` : ''}), but its alert entries are loaded dynamically with scripts — no dated alert text exists in the static HTML I can read. No alerts are being reported here, and I will not fabricate any.`,
    ur: `صفحہ کامیابی سے لوڈ ہوا (HTTP 200${title ? `؛ صفحے کا عنوان: “${title}”` : ''})، لیکن اس کے الرٹ اندراجات اسکرپٹس سے ڈائنامک لوڈ ہوتے ہیں — جامد HTML میں کوئی تاریخ شدہ الرٹ متن موجود نہیں۔ میں کوئی الرٹ گھڑتا نہیں۔`,
    roman: `Page successfully load hua (HTTP 200${title ? `; title: “${title}”` : ''}), lekin alert entries scripts se dynamically load hoti hain — static HTML mein koi dated alert text nahi. Main koi alert fabricate nahi karta.`
  }[L];
  return { answer: frame(L, SRC.ndma, `${lead}\n${msg}`, ST.dynamic), status: 'ok' };
}

/* ---------- Rescue 1122 (live check) ---------- */

async function handleRescue(L) {
  const r = await fetchText(SRC.rescue.url, 15000);
  const lead = { en: 'Live check of the Rescue 1122 website:', ur: 'ریسکیو 1122 ویب سائٹ کی براہِ راست جانچ:', roman: 'Rescue 1122 website ki live check:' }[L];
  if (!r.reachable || !r.ok) {
    const msg = { en: `The site could not be reached right now (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timed out' : 'network error'}). I will not state details I could not verify.`, ur: `ویب سائٹ اس وقت دستیاب نہیں (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'وقت ختم' : 'نیٹ ورک خرابی'})۔ میں ان تفصیلات کا ذکر نہیں کروں گا جن کی تصدیق نہ ہو سکی۔`, roman: `Site abhi reach nahi hui (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timeout' : 'network error'}). Main un details ka zikr nahi kara jo verify na ho sakein.` }[L];
    return { answer: frame(L, SRC.rescue, `${lead}\n${msg}`, r.reachable ? ST.down(r.status) : ST.fail), status: 'fail' };
  }
  const title = titleOf(r.text);
  const msg = {
    en: `The official site loaded successfully (HTTP 200${title ? `; page title: “${title}”` : ''}). Rescue 1122 is the Punjab Emergency Service — its emergency number is 1122 (as also reflected in the service's own name/title). For life-threatening emergencies, call 1122 directly.`,
    ur: `سرکاری ویب سائٹ کامیابی سے لوڈ ہوئی (HTTP 200${title ? `؛ صفحے کا عنوان: “${title}”` : ''})۔ ریسکیو 1122 پنجاب ایمرجنسی سروس ہے — اس کا ایمرجنسی نمبر 1122 ہے (جو سروس کے اپنے نام میں بھی موجود ہے)۔ ہنگامی صورتحال میں براہِ راست 1122 پر کال کریں۔`,
    roman: `Official site successfully load hui (HTTP 200${title ? `; title: “${title}”` : ''}). Rescue 1122 Punjab Emergency Service hai — iska emergency number 1122 hai (service ke apne naam mein bhi shamil hai). Emergency mein seedha 1122 par call karein.`
  }[L];
  return { answer: frame(L, SRC.rescue, `${lead}\n${msg}`, ST.liveExtract), status: 'ok' };
}

/* ---------- PBS 2023 digital census (live check) ---------- */

async function handleCensus(L) {
  const r = await fetchText(SRC.census.url, 20000);
  const lead = { en: 'Live check of the PBS 2023 Digital Census portal:', ur: 'پی بی ایس 2023 ڈیجیٹل مردم شماری پورٹل کی براہِ راست جانچ:', roman: 'PBS 2023 Digital Census portal ki live check:' }[L];
  if (!r.reachable || !r.ok) {
    const msg = { en: `The portal could not be reached right now (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timed out' : 'network error'}). No census figures were retrieved, and I will not quote numbers I could not fetch.`, ur: `پورٹل اس وقت دستیاب نہیں (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'وقت ختم' : 'نیٹ ورک خرابی'})۔ کوئی مردم شماری اعداد حاصل نہیں ہوئے، اور میں ان اعداد کا حوالہ نہیں دوں گا جو حاصل نہ ہو سکے۔`, roman: `Portal abhi reach nahi hua (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timeout' : 'network error'}). Census figures nahi milein, aur main wo numbers quote nahi kara jo fetch na hue.` }[L];
    return { answer: frame(L, SRC.census, `${lead}\n${msg}`, r.reachable ? ST.down(r.status) : ST.fail), status: 'fail' };
  }
  const title = titleOf(r.text);
  const text = staticText(r.text);
  const headline = (text.match(/[^.!?۔]{0,80}\b(241|240|population of (Pakistan|the country))[^.!?۔]{0,120}/i) || [])[0];
  const parts = [
    { en: `The portal loaded successfully (HTTP 200${title ? `; page title: “${title}”` : ''}).`, ur: `پورٹل کامیابی سے لوڈ ہوا (HTTP 200${title ? `؛ صفحے کا عنوان: “${title}”` : ''})۔`, roman: `Portal successfully load hua (HTTP 200${title ? `; title: “${title}”` : ''}).` },
    headline ? { en: `Text found on the page: “${headline.trim().slice(0, 220)}”.`, ur: `صفحے پر موجود متن: “${headline.trim().slice(0, 220)}”۔`, roman: `Page par mila text: “${headline.trim().slice(0, 220)}”.` } : { en: 'District-level census tables are interactive on the portal — no static national/district figures were present in the HTML I can read, so I am not quoting any number.', ur: 'اضلاع کی سطح کی مردم شماری کے ٹیبلز پورٹل پر انٹرایکٹو ہیں — قابلِ مطالعہ HTML میں کوئی جامد قومی/اضلاعی اعداد موجود نہیں تھے، اس لیے میں کوئی عدد نقل نہیں کر رہا۔', roman: 'District-level census tables portal par interactive hain — readable HTML mein koi static figures nahi the, is liye main koi number quote nahi kara.' }
  ].map(p => p[L]);
  return { answer: frame(L, SRC.census, `${lead}\n${parts.join('\n')}`, headline ? ST.liveExtract : ST.dynamic), status: 'ok' };
}

/* ---------- PSLM / PBS socio-economic (live check with fallback) ---------- */

async function handleSocio(L) {
  const lead = { en: 'Live check of the approved socio-economic sources:', ur: 'منظور شدہ معاشی و سماجی ذرائع کی براہِ راست جانچ:', roman: 'Approved socio-economic sources ki live check:' }[L];
  const lines = [];
  const pslm = await fetchText(SRC.pslm.url, 15000);
  if (!pslm.reachable) {
    lines.push({ en: `• PSLM District Dashboard: could not be reached (${pslm.error === 'timeout' ? 'timed out' : 'network error'}) — no PSLM indicators retrieved.`, ur: `• پی ایس ایل ایم ڈسٹرکٹ ڈیش بورڈ: دستیاب نہیں (${pslm.error === 'timeout' ? 'وقت ختم' : 'نیٹ ورک خرابی'}) — کوئی پی ایس ایل ایم اشارہ حاصل نہیں ہوا۔`, roman: `• PSLM District Dashboard: reach nahi hua (${pslm.error === 'timeout' ? 'timeout' : 'network error'}) — koi PSLM indicator nahi mila.` }[L]);
  } else if (!pslm.ok) {
    lines.push({ en: `• PSLM District Dashboard: the source server itself returned HTTP ${pslm.status} — the source is failing on its side right now; no PSLM indicators retrieved.`, ur: `• پی ایس ایل ایم ڈسٹرکٹ ڈیش بورڈ: ذریعے کے سرور نے خود HTTP ${pslm.status} دیا — ذریعہ اپنی طرف سے ناکام ہے؛ کوئی اشارہ حاصل نہیں ہوا۔`, roman: `• PSLM District Dashboard: source ka server khud HTTP ${pslm.status} de raha hai — source apni taraf se fail hai; koi indicator nahi mila.` }[L]);
  } else {
    const t = titleOf(pslm.text);
    lines.push({ en: `• PSLM District Dashboard: reachable (HTTP 200${t ? `; title: “${t}”` : ''}) — district tables are interactive; no static figures extractable here.`, ur: `• پی ایس ایل ایم ڈسٹرکٹ ڈیش بورڈ: دستیاب (HTTP 200${t ? `؛ عنوان: “${t}”` : ''}) — اضلاعی ٹیبلز انٹرایکٹو ہیں؛ یہاں سے کوئی جامد اعداد حاصل نہیں ہو سکے۔`, roman: `• PSLM District Dashboard: reachable (HTTP 200${t ? `; title: “${t}”` : ''}) — district tables interactive hain; static figures extract nahi hue.` }[L]);
  }
  const econ = await fetchText(SRC.econ.url, 25000);
  if (!econ.reachable) {
    lines.push({ en: `• PBS Geo-Economic Observatory: could not be reached (${econ.error === 'timeout' ? 'timed out (it is a slow-loading source)' : 'network error'}).`, ur: `• پی بی ایس جیو اکنامک آبزرویٹری: دستیاب نہیں (${econ.error === 'timeout' ? 'وقت ختم (یہ سست لوڈ ہونے والا ذریعہ ہے)' : 'نیٹ ورک خرابی'})۔`, roman: `• PBS Geo-Economic Observatory: reach nahi hui (${econ.error === 'timeout' ? 'timeout (yeh slow source hai)' : 'network error'}).` }[L]);
  } else if (!econ.ok) {
    lines.push({ en: `• PBS Geo-Economic Observatory: HTTP ${econ.status} — unavailable right now.`, ur: `• پی بی ایس جیو اکنامک آبزرویٹری: HTTP ${econ.status} — اس وقت دستیاب نہیں۔`, roman: `• PBS Geo-Economic Observatory: HTTP ${econ.status} — abhi available nahi.` }[L]);
  } else {
    const t = titleOf(econ.text);
    lines.push({ en: `• PBS Geo-Economic Observatory: reachable (HTTP 200${t ? `; title: “${t}”` : ''}) — interactive dashboard; district socio-economic tables must be read on the portal itself.`, ur: `• پی بی ایس جیو اکنامک آبزرویٹری: دستیاب (HTTP 200${t ? `؛ عنوان: “${t}”` : ''}) — انٹرایکٹو ڈیش بورڈ؛ اضلاعی معاشی و سماجی ٹیبلز پورٹل پر ہی دیکھے جانے چاہئیں۔`, roman: `• PBS Geo-Economic Observatory: reachable (HTTP 200${t ? `; title: “${t}”` : ''}) — interactive dashboard; district tables portal par hi dekhein.` }[L]);
  }
  const closing = { en: 'No socio-economic indicator values are being quoted because neither source exposed extractable static data in this live check — I will not invent figures.', ur: 'کوئی معاشی و سماجی اشارہ نقل نہیں کیا جا رہا کیونکہ دونوں ذرائع نے اس جانچ میں قابلِ حصول جامد ڈیٹا فراہم نہیں کیا — میں اعداد نہیں گھڑوں گا۔', roman: 'Koi socio-economic indicator quote nahi ho raha kyunki dono sources ne is live check mein extractable static data nahi diya — main figures nahi banaonga.' }[L];
  return { answer: frame(L, SRC.pslm, `${lead}\n${lines.join('\n')}\n${closing}`, ST.dynamic), status: 'partial' };
}

/* ---------- Punjab Health BHU listing (live check) ---------- */

async function handlePunjab(L) {
  const r = await fetchText(SRC.punjab.url, 15000);
  const lead = { en: 'Live check of the Punjab Health Department BHU listing page:', ur: 'پنجاب ہیلتھ ڈیپارٹمنٹ کے بی ایچ یو فہرست صفحے کی براہِ راست جانچ:', roman: 'Punjab Health Department BHU listing page ki live check:' }[L];
  if (!r.reachable || !r.ok) {
    const msg = { en: `The page could not be reached right now (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timed out' : 'network error'}). No BHU information was retrieved, and I will not invent facility listings.`, ur: `صفحہ اس وقت دستیاب نہیں (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'وقت ختم' : 'نیٹ ورک خرابی'})۔ کوئی بی ایچ یو معلومات حاصل نہیں ہوئی، اور میں سہولت کی فہرست نہیں گھڑوں گا۔`, roman: `Page abhi reach nahi hua (${r.reachable ? 'HTTP ' + r.status : r.error === 'timeout' ? 'timeout' : 'network error'}). BHU info nahi mili, aur main facility listing nahi banaonga.` }[L];
    return { answer: frame(L, SRC.punjab, `${lead}\n${msg}`, r.reachable ? ST.down(r.status) : ST.fail), status: 'fail' };
  }
  const title = titleOf(r.text);
  const text = staticText(r.text);
  const bhuCount = (text.match(/\bBHU\b/gi) || []).length;
  const names = [...text.matchAll(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\s+BHU\b/g)].slice(0, 10).map(m => m[1] + ' BHU');
  const body = [
    { en: `The page loaded successfully (HTTP 200${title ? `; page title: “${title}”` : ''}).`, ur: `صفحہ کامیابی سے لوڈ ہوا (HTTP 200${title ? `؛ صفحے کا عنوان: “${title}”` : ''})۔`, roman: `Page successfully load hua (HTTP 200${title ? `; title: “${title}”` : ''}).` },
    names.length
      ? { en: `BHU entries visible in the page text (unverified listing, first ${names.length}): ${names.join(' · ')}.`, ur: `صفحے کے متن میں نظر آنے والے بی ایچ یو اندراجات (غیر تصدیق شدہ فہرست، پہلے ${names.length}): ${names.join(' · ')}۔`, roman: `Page text mein visible BHU entries (unverified, pehle ${names.length}): ${names.join(' · ')}.` }
      : { en: `The BHU directory on this page is served through a dynamic (form/database-driven) listing — the static HTML contains ${bhuCount} “BHU” mentions but no structured facility records (names, locations, staffing) that can be reliably extracted. I will not invent BHU records.`, ur: `اس صفحے کی بی ایچ یو ڈائریکٹری ایک ڈائنامک (فارم/ڈیٹا بیس پر مبنی) فہرست سے چلتی ہے — جامد HTML میں “BHU” کے ${bhuCount} ذکر ہیں مگر کوئی منظم سہولتی ریکارڈ (نام، مقامات، عملہ) قابلِ اعتماد طریقے سے حاصل نہیں ہو سکتا۔ میں بی ایچ یو ریکارڈ نہیں گھڑوں گا۔`, roman: `Is page ki BHU directory dynamic (form/database-driven) listing hai — static HTML mein “BHU” ke ${bhuCount} mentions hain magar koi structured facility records (naam, locations, staffing) reliably extract nahi ho sakte. Main BHU records nahi banaonga.` }
  ].map(p => p[L]);
  const guide = { en: 'For the authoritative BHU list for a district, use the department\'s search form on the linked page.', ur: 'کسی ضلع کی مستند بی ایچ یو فہرست کے لیے منسلک صفحے پر محکمے کا تلاش فارم استعمال کریں۔', roman: 'Kisi district ki authoritative BHU list ke liye linked page par department ka search form use karein.' }[L];
  return { answer: frame(L, SRC.punjab, `${lead}\n${body.join('\n')}\n${guide}`, names.length ? ST.liveExtract : ST.dynamic), status: 'ok' };
}

/* ---------- dispatcher ---------- */

const INTENT_SRC = { ext_who: 'who', ext_osm: 'osm', ext_ndma: 'ndma', ext_rescue: 'rescue', ext_census: 'census', ext_socio: 'pslm', ext_punjab: 'punjab' };
const OUTCOME = {
  ok: { en: 'live retrieval succeeded', ur: 'براہِ راست حصول کامیاب رہا', roman: 'live retrieval kamyab raha' },
  partial: { en: 'partial — at least one checked source failed or exposed no extractable data', ur: 'جزوی — کم از کم ایک جانچا گیا ذریعہ ناکام رہا یا قابلِ حصول ڈیٹا نہیں دے سکا', roman: 'partial — kam az kam ek checked source fail raha ya extractable data nahi de saka' },
  fail: { en: 'retrieval failed — see the answer for details', ur: 'حصول ناکام — تفصیل جواب میں دیکھیں', roman: 'retrieval fail — tafseel jawab mein dekhein' }
};

async function handleExternal(intent, analysis, dataset) {
  const L = analysis && analysis.lang === 'mixed' ? 'ur' : (analysis && analysis.lang) || 'en';
  const src = SRC[INTENT_SRC[intent]] || { name: 'External source router', url: 'about:blank' };
  let r = null;
  try {
    switch (intent) {
      case 'ext_who': r = await handleWho(L, (analysis && analysis.raw) || ''); break;
      case 'ext_osm': r = await handleOsm(L, analysis, dataset); break;
      case 'ext_ndma': r = await handleNdma(L); break;
      case 'ext_rescue': r = await handleRescue(L); break;
      case 'ext_census': r = await handleCensus(L); break;
      case 'ext_socio': r = await handleSocio(L); break;
      case 'ext_punjab': r = await handlePunjab(L); break;
    }
  } catch (e) {
    const msg = { en: 'The external source check failed unexpectedly. Nothing was retrieved, and I will not guess.', ur: 'بیرونی ذریعے کی جانچ غیر متوقع طور پر ناکام ہو گئی۔ کچھ حاصل نہیں ہوا، اور میں اندازہ نہیں لگاؤں گا۔', roman: 'External source check unexpectedly fail ho gaya. Kuch retrieve nahi hua, main guess nahi kara.' }[L];
    r = { answer: frame(L, src, msg, ST.fail), status: 'fail' };
  }
  if (!r || !r.answer) return null;
  const outcome = OUTCOME[r.status] || { en: String(r.status), ur: String(r.status), roman: String(r.status) };
  return {
    answer: r.answer,
    lang: (analysis && analysis.lang) || 'en',
    intent,
    origin: 'external',
    meta: {
      source: src.name,
      url: src.url,
      retrievedAt: new Date().toISOString(),
      status: outcome[L] || outcome.en
    }
  };
}

module.exports = { handleExternal, SRC };
