'use strict';

/* Deterministic multilingual chat engine over the supplied dataset.
   Answers are template-built from verified records only; nothing is invented,
   scores are never overridden, and missing fields surface as Not Available. */

const URDU_RE = /[\u0600-\u06FF]/;

const ALIASES = {
  'Bet Isa': ['بیت عیسی', 'بیٹ عیسی'],
  'Basti Khair Pur Para': ['بستی خیر پور پارہ'],
  'Jhuggi Wala': ['جھگی والا'],
  'Bet Mir Hazar': ['بیت میر ہزار', 'بیٹ میر ہزار'],
  'Belaywala': ['بیلیوالا'],
  'Mir Wala': ['میر والا', 'میروالا'],
  'Kotla Sher Muhammad': ['کوٹلہ شیر محمد'],
  'Tatarwala': ['تاتر والا', 'تاٹر والا'],
  'Basti Rindan': ['بستی رنداں'],
  'Kotla Mughlan Rural': ['کوٹلہ مغلان'],
  'Harrand Outer Fringe': ['ہرند'],
  'Lalgarh': ['لال گڑھ', 'لالگرہ'],
  'Fazilpur Outskirts': ['فضل پور'],
  'Rangpur Remote Pockets': ['رنگ پور'],
  'Aludaywali Riverine Pocket': ['الودے والی']
};
const DISTRICT_URDU = { Muzaffargarh: ['مظفر گڑھ', 'مظفرگڑھ'], Rajanpur: ['راجن پور', 'راجنپور'] };

function detectLang(raw) {
  const urdu = (raw.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (raw.match(/[A-Za-z]/g) || []).length;
  if (urdu > 0 && latin >= 3) return 'mixed';
  if (urdu > 0) return 'ur';
  if (/\b(kya|kyun|kyo|kyu|kaise|kahan|kab|kon|kaun|konsa|konsi|sabse|sab se|zyada|zaroori|aham|pehle|pehlay|batayen|bataye|batao|bataen|maloom|abadi|sehat|elaj|madad|kitna|kitne|kitni|gaon|nahi|nhi|adhoora|adhura|adhuri|kami|chahiye|liye|keliye|hain|hoga|hai|kaam|haal|milta|milti|jaga|koi|bata|karo|badal|barha|lagta|raha|rahi|sath|kuch|abhi|dono|jaldi|faisla|jawab|sawal|tareef|mansooba|khaas|bilkul)\b|\b(ka|ki|ko|se)\b(?!\s*(wala|wali))|(?<!jhuggi\s)(?<!mir\s)\bwala\b/i.test(raw)) return 'roman';
  return 'en';
}

function matchTerms(v) {
  const base = v.village.replace(/\s*\([^)]*\)\s*/, '').trim();
  const words = base.split(/\s+/);
  const terms = [v.village.toLowerCase(), base.toLowerCase()];
  const paren = v.village.match(/\(([^)]+)\)/);
  if (paren) terms.push(paren[1].toLowerCase());
  if (words.length >= 2) terms.push(words.slice(0, 2).join(' ').toLowerCase());
  if (words[0].length >= 6) terms.push(words[0].toLowerCase());
  return [...new Set(terms.filter(t => t.length >= 4))];
}

function findVillages(raw, dataset) {
  const q = raw.toLowerCase();
  const hits = [];
  for (const v of dataset) {
    const alias = ALIASES[v.village.replace(/\s*\([^)]*\)\s*/, '').trim()] || [];
    if (q.includes(v.id.toLowerCase()) || matchTerms(v).some(t => q.includes(t)) || alias.some(a => raw.includes(a))) hits.push(v);
  }
  return hits;
}

function findDistrict(raw) {
  const q = raw.toLowerCase();
  for (const [name, urdu] of Object.entries(DISTRICT_URDU)) {
    if (q.includes(name.toLowerCase()) || urdu.some(u => raw.includes(u))) return name;
  }
  return null;
}

function detectIntent(raw, hits) {
  const T = re => re.test(raw);
  if (T(/^\s*(hi|hello|hey|aoa|good (morning|afternoon|evening)|(assalamu?|asalamu?|salaam|salam)([\s-]*o?[\s-]*alaikum)?)\b[\s!.,?'']*(how are you|how r ?u|how is it going|how's it going|kaise ho|kaise hain|kia haal|kya haal)?[\s!.,?'']*$/i) || T(/^\s*(السلام علیکم|اسلام علیکم|ہیلو|ہائے|سلام|آداب)\s*(،|!)?\s*(آپ کیسے ہیں|کیسے ہو|خیریت ہے|خیریت)?\s*[!.,؟]*\s*$/)) return 'greeting';
  const why = T(/\bhow\b|\bwhy\b|kyun|kyo|کیوں|کیسے|kaise/i);
  if (!why && (T(/(change|set|make|override|increase|decrease|raise|lower|edit|update|fix|delete|remove)\b[^.!?]{0,60}\b(score|priority|priorities|ranking|rank)/i)
    || T(/(اسکور|سکور|ترجیح|درجہ بندی)[^۔؟!]{0,60}(تبدیل|بدل|بڑھا|کم کر|مٹا|ختم|کر دو|کردو|بنا دو|بناؤ)/)
    || T(/(score|priority|rank)[^.!?]{0,40}(barha|ghata|badal|change|kar do|kardo|override)|(change|override|badal|barha)[^.!?]{0,40}(score|priority|rank)/i))) return 'override';
  if (T(/world health organization|world health|global health|life expectancy|maternal|uhc|universal health|under-?5|under-?five|infant mortal|child mortal|مادرانہ|زچگی|اوسط عمر|بچوں کی اموات|عالمی (صحت|ادارہ|اعداد)|شرح اموات/i)
    || T(/\bwho\b[^.!?]{0,60}(health|data|indicator|says?|report|statistics)/i)) return 'ext_who';
  if (T(/ndma|این ڈی ایم اے/i)
    || (T(/alert|advisory|warning|انتباہ|خبردار|ہدایت|آگاہ/i) && T(/flood|disaster|monsoon|rain|سیلاب|آفت|موسم|بارش/i))
    || (T(/latest|current|news|تازہ|موجودہ|حالیہ|خبر/i) && T(/flood|disaster|سیلاب|آفت/i))) return 'ext_ndma';
  if (T(/rescue|1122|ریسکیو/i)
    || T(/\bemergency\b[^.!?]{0,60}(number|call|contact|helpline|phone|services?)/i)
    || T(/ایمرجنسی[^۔؟!]{0,60}(نمبر|رابطہ|فون|مدد|سروس)/)) return 'ext_rescue';
  if (T(/census|مردم شماری|بشماری|national population|population of pakistan|pakistan'?s population|قومی آبادی/i)) return 'ext_census';
  if (T(/poverty|literacy|socio-?economic|pslm|standard of living|education level|income|employment|غربت|خواندگی|معاشی|تعلیم/i)) return 'ext_socio';
  if (T(/punjab health|health department|pshealth|محکمہ صحت|صحت محکمہ/i)
    || T(/(bhus?\b|بی ایچ یو)[^.!?]{0,40}(list|directory|database|how many|فہرست|تمام|کتنے)/i)
    || T(/(\b(list|all|directory|database|how many)\b|فہرست|تمام|کتنے)[^.!?]{0,15}(bhus?\b|بی ایچ یو)/i)) return 'ext_punjab';
  if (T(/hospital|clinic|doctor|pharmacy|health ?facilit|medical cent|ہسپتال|شفاخانہ|کلینک|طبی/i)
    && T(/nearby|nearest|closest|near|around|map|mapped|openstreetmap|\bosm\b|gis|قریب|نزدیک|آس پاس|نقشہ|qareeb|qareebi|aas paas|\bpaas\b/i)) return 'ext_osm';
  if (T(/duplicate|same id|twice|two records|مکرر|دوہرا|دوہرایا|دو بار|نقل|ہم شکل|dupli/i)) return 'duplicates';
  if (hits.length) return 'village';
  if (findDistrict(raw)) return 'district';
  if (T(/(which|what|konsa|kaunsa|konsi|کس|کون)[^.!?]{0,60}(first|pehle|pehlay|پہلے|top|sabse|سب سے)|top priority|highest priority|most urgent|most important|immediate attention|act first|where should we|پہلے کس|کس گاؤں|sab\s?se[^.!?]{0,40}(pehle|pehlay|zyada|zaroori|aham)|سب سے[^۔؟!]{0,60}(پہلے|زیادہ|اہم|ترجیح)/i)) return 'top';
  if (T(/rank|standings?|leaderboard|top\s?\d|درجہ بندی|فہرست|ترتیب|tarteeb|list (all|of|the)|show all|all locations|all villages|poore|poora/i)) return 'rankings';
  if (T(/missing|incomplete|survey|not available|unavailable|gap|lacking|adhoo?r[aei]|گمشدہ|غائب|نامکمل|ناکافی|سروے|کون سے[^۔؟!]{0,40}(کم|نہیں)/i)) return 'missing';
  if (T(/(how|kaise|کیسے|کس طرح)[^.!?]{0,70}(score|calculat|comput|weight|banta|اسکور|حساب)|methodology|scoring|formula|framework|weights|weighted|transparent|calculat|طریقہ کار|حساب کتاب|وزن/i)) return 'methodology';
  if (T(/confidence|reliab|trust|اعتماد|قابلِ اعتماد|aitmada|bharosa|yakeen/i)) return 'confidence';
  if (T(/population|abadi|آبادی|kitne log|کی آبادی/i)) return 'population';
  if (T(/flood|pani|سیلاب|سیل/i)) return 'flood';
  if (T(/bhu|basic health unit|بی ایچ یو|ہیلتھ یونٹ|سہولت/i)) return 'bhu';
  return 'fallback';
}

function analyze(raw, dataset) {
  const villages = findVillages(raw, dataset);
  return { raw, lang: detectLang(raw), intent: detectIntent(raw, villages), villages, district: findDistrict(raw) };
}

/* ---------- shared building blocks ---------- */

const NA = { en: 'Not Available', ur: 'دستیاب نہیں', roman: 'available nahi' };
const LB = {
  flood: { High: ['High', 'زیادہ'], 'Medium-High': ['Medium-High', 'درمیانی سے زیادہ'], Medium: ['Medium', 'درمیانی'], Low: ['Low', 'کم'] },
  prio: { Critical: ['Critical', 'انتہائی اہم'], High: ['High', 'اہم'], Medium: ['Medium', 'درمیانی'], Low: ['Low', 'کم'], 'Survey Required': ['Survey Required', 'سروے درکار'] },
  conf: { High: ['High', 'اعلیٰ'], Medium: ['Medium', 'درمیانی'], Low: ['Low', 'کم'] },
  acc: { Poor: ['Poor', 'بہت مشکل'], Difficult: ['Difficult', 'مشکل'], Moderate: ['Moderate', 'درمیانی'], Good: ['Good', 'اچھی'] }
};
function lbl(map, value, L) { const hit = map[value]; return !hit ? NA[L] : L === 'ur' ? `${hit[1]} (${hit[0]})` : hit[0]; }
function yesNo(v, L) { return L === 'ur' ? (v ? 'ہاں' : 'نہیں') : L === 'roman' ? (v ? 'Haan' : 'Nahi') : v ? 'Yes' : 'No'; }
function dist(v, L) { return typeof v.distance_km === 'number' ? `${v.distance_km} km` : NA[L]; }
function pop(v, L) { return v.populationVerified ? v.population.toLocaleString('en-US') : NA[L]; }
function nameOf(v, L) { return L === 'ur' ? `${(ALIASES[v.village.replace(/\s*\([^)]*\)\s*/, '').trim()] || [])[0] || v.village} (${v.village})` : v.village; }
function action(v, L) {
  if (v.priority === 'Critical') return L === 'ur' ? 'موبائل ہیلتھ آؤٹ ریچ کی منصوبہ بندی کو ترجیح دیں؛ پہلے موجودہ میدانی حالات کی تصدیق کریں۔' : L === 'roman' ? 'Mobile health outreach ki planning ko priority den; pehle maujooda field conditions ki tasdeeq karen.' : 'Prioritise mobile health outreach planning; confirm current field conditions first.';
  if (v.priority === 'Survey Required') return L === 'ur' ? 'ڈیٹا کی توثیق کے لیے فیلڈ سروے طے کریں۔' : L === 'roman' ? 'Data ki tasdeeq ke liye field survey tay karen.' : 'Schedule a data-validation field survey.';
  return L === 'ur' ? 'اگلی آؤٹ ریچ منصوبہ بندی کے جائزے میں شامل کریں۔' : L === 'roman' ? 'Agli outreach planning review mein shamil karen.' : 'Use in the next outreach planning review.';
}
function prep(dataset) {
  const ranked = [...dataset].sort((a, b) => b.score - a.score);
  const bestVerified = [...dataset].sort((a, b) => b.confidencePct - a.confidencePct || b.score - a.score)[0];
  return {
    ranked,
    bestVerified,
    highFlood: dataset.filter(v => v.flood_risk === 'High'),
    withBhu: dataset.filter(v => v.has_bhu_on_site),
    verifiedPop: dataset.filter(v => v.populationVerified),
    noGps: dataset.filter(v => typeof v.latitude !== 'number').length,
    noDist: dataset.filter(v => typeof v.distance_km !== 'number').length,
    unknownFlood: dataset.filter(v => v.flood_risk === 'Unknown').length,
    unknownAcc: dataset.filter(v => v.accessibility === 'Unknown').length,
    dupIds: dataset.filter((v, i) => dataset.some((x, j) => j < i && x.id === v.id)).map(v => v.id),
    confHigh: dataset.filter(v => v.confidence === 'High').length,
    confMed: dataset.filter(v => v.confidence === 'Medium').length,
    confLow: dataset.filter(v => v.confidence === 'Low').length
  };
}
function locLine(v, L) { return `${nameOf(v, L)} (${v.id}, ${v.district} / ${v.tehsil})`; }

/* ---------- answer builders (one per intent, per language) ---------- */

const HEAD = {
  en: 'INTERNAL DASHBOARD DATA — verified supplied records (15 locations)',
  ur: 'اندرونی ڈیش بورڈ ڈیٹا — فراہم کردہ تصدیق شدہ ریکارڈز (15 مقامات)',
  roman: 'INTERNAL DASHBOARD DATA — verified supplied records (15 locations)'
};
const FOOT = {
  en: 'Missing fields are never guessed. The final allocation decision remains with the NGO officer.',
  ur: 'گمشدہ معلومات کا اندازہ کبھی نہیں لگایا جاتا۔ حتمی فیصلہ این جی او افسر کے پاس رہتا ہے۔',
  roman: 'Missing fields ka andaza kabhi nahi lagaya jata. Final faisla NGO officer ke paas rehta hai.'
};

function villageBlock(v, L) {
  const lines = [
    `${locLine(v, L)}`,
    L === 'ur' ? `ترجیحی اسکور: ${v.score}/100 (${lbl(LB.prio, v.priority, 'ur')}) · ڈیٹا اعتماد: ${lbl(LB.conf, v.confidence, 'ur')} (${v.confidencePct}%)`
      : L === 'roman' ? `Priority score: ${v.score}/100 (${v.priority}) · Data confidence: ${v.confidence} (${v.confidencePct}%)`
        : `Priority score: ${v.score}/100 (${v.priority}) · Data confidence: ${v.confidence} (${v.confidencePct}%)`,
    L === 'ur' ? `تصدیق شدہ ریکارڈ: سیلاب کا خطرہ ${lbl(LB.flood, v.flood_risk, 'ur')} · سہولت کا فاصلہ ${dist(v, 'ur')} · مقامی BHU: ${yesNo(v.has_bhu_on_site, 'ur')} · رسائی: ${lbl(LB.acc, v.accessibility, 'ur')} · تصدیق شدہ آبادی: ${pop(v, 'ur')}`
      : L === 'roman' ? `Verified record: flood risk ${lbl(LB.flood, v.flood_risk, 'roman')} · facility distance ${dist(v, 'roman')} · BHU on site: ${yesNo(v.has_bhu_on_site, 'roman')} · accessibility: ${lbl(LB.acc, v.accessibility, 'roman')} · verified population: ${pop(v, 'roman')}`
        : `Verified record: flood risk ${lbl(LB.flood, v.flood_risk, 'en')} · facility distance ${dist(v, 'en')} · BHU on site: ${yesNo(v.has_bhu_on_site, 'en')} · accessibility: ${lbl(LB.acc, v.accessibility, 'en')} · verified population: ${pop(v, 'en')}`
  ];
  if (v.id === 'RJ-09') lines.push(L === 'ur'
    ? 'نوٹ: ذریعے کی 98,627 آبادی تحصیل کی سطح کا انتظامی عدد ہے، اس لیے اسے گاؤں کی آبادی اور اسکورنگ سے عمداً خارج رکھا گیا ہے۔'
    : L === 'roman' ? 'Note: the source\'s 98,627 figure is a tehsil-level administrative value, deliberately excluded from village population and scoring.' : 'Note: the source\'s 98,627 figure is a tehsil-level administrative value, deliberately excluded from village population and scoring.');
  return lines.join('\n');
}

const B = {
  greeting: (a, d, L) => L === 'ur'
    ? `السلام علیکم! میں ڈیش بورڈ کا ڈیٹا معاون ہوں۔ میں فراہم کردہ 15 مقامات کے ریکارڈز (ترجیحات، اسکور، اعتماد، گمشدہ ڈیٹا، RJ-07 نقل، طریقۂ کار) اور منظور شدہ بیرونی ذرائع (WHO، OpenStreetMap، NDMA، Rescue 1122، مردم شماری، PSLM، صحت محکمہ پنجاب) سے جواب دیتا ہوں۔ میں معلومات گھڑتا نہیں اور اسکور میں مداخلت نہیں کرتا۔`
    : L === 'roman' ? `Assalam-o-alaikum! Main dashboard ka data assistant hoon. Main 15 supplied locations ke records (priorities, scores, confidence, missing data, RJ-07 duplicate, methodology) aur approved external sources (WHO, OpenStreetMap, NDMA, Rescue 1122, census, PSLM, Punjab Health) se jawab deta hoon. Main data gharat nahi karta aur scores mein dakhal nahi deta.`
      : `Hello! I am the dashboard's data assistant. I answer from the 15 supplied location records (priorities, scores, confidence, missing data, the RJ-07 duplicate, methodology) and from live checks against the approved external sources (WHO, OpenStreetMap, NDMA, Rescue 1122, PBS census, PSLM, Punjab Health Department). I never invent data and never override scores.`,
  override: (a, d, L) => L === 'ur'
    ? `نہیں — میں ترجیحی اسکور تبدیل یا override نہیں کر سکتا۔ اسکور ڈیش بورڈ کے deterministic انجن صرف تصدیق شدہ فیلڈز سے حساب کرتا ہے: سیلاب 40%، فاصلہ 25%، BHU کی عدم موجودگی 15%، رسائی 10%، تصدیق شدہ آبادی 10%۔ اگر بنیادی ڈیٹا بدلے تو اسکور خود بخود دوبارہ حساب ہوگا؛ ورنہ یہ ویسا ہی رہے گا۔ حتمی فیصلہ این جی او افسر کا ہے۔`
    : L === 'roman' ? `Nahi — main priority score change ya override nahi kar sakta. Score dashboard ke deterministic engine se sirf verified fields par calculate hota hai: flood 40%, distance 25%, no BHU 15%, accessibility 10%, verified population 10%. Agar base data badle to score khud dobara calculate hoga; warna waisa hi rahega. Final faisla NGO officer ka hai.`
      : `No — I cannot change or override priority scores. Scores are computed by the dashboard's deterministic engine from verified fields only: flood risk 40%, facility distance 25%, no BHU 15%, accessibility 10%, verified population 10%. If the underlying data changes, the score recalculates automatically; otherwise it stands. The final allocation decision remains with the NGO officer.`,
  top: (a, d, L) => {
    const p = prep(d);
    const top5 = p.ranked.slice(0, 5).map((v, i) => `${i + 1}. ${locLine(v, L)} — ${L === 'ur' ? `اسکور ${v.score}/100، ${lbl(LB.prio, v.priority, 'ur')}, اعتماد ${v.confidencePct}%` : `score ${v.score}/100, ${v.priority}, confidence ${v.confidencePct}%`}`).join('\n');
    const bv = p.bestVerified;
    return L === 'ur'
      ? `سب سے زیادہ ترجیحی اسکور (اندرونی ڈیش بورڈ ڈیٹا):\n${top5}\n\nسب سے مضبوط تصدیق شدہ ڈیٹا کے ساتھ سب سے اونچا اسکور: ${locLine(bv, 'ur')} — ${bv.score}/100، ${lbl(LB.prio, bv.priority, 'ur')}، اعتماد ${bv.confidencePct}% (${lbl(LB.conf, bv.confidence, 'ur')})۔\nاسکور کے ساتھ اعتماد ضرور دیکھیں: 100 اسکور صرف 55% تصدیق شدہ وزن پر مبنی ہیں، یعنی "عمل کریں مگر میدان میں تصدیق بھی کریں"۔\n${FOOT.ur}`
      : L === 'roman' ? `Sab se zyada priority scores (internal dashboard data):\n${top5}\n\nSab se strong verified data ke sath sab se high score: ${locLine(bv, 'roman')} — ${bv.score}/100, ${bv.priority}, confidence ${bv.confidencePct}% (${bv.confidence}).\nScore ke sath confidence bhi dekhen: 100 wale scores sirf 55% verified weight par based hain — "act, but verify in the field".\n${FOOT.roman}`
        : `Highest rule-based priority scores (internal dashboard data):\n${top5}\n\nHighest score with the strongest verified data: ${locLine(bv, 'en')} — ${bv.score}/100, ${bv.priority}, confidence ${bv.confidencePct}% (${bv.confidence}).\nAlways read scores together with confidence: the 100-scores rest on only 55% of weighted fields being verified — "act, but verify in the field".\n${FOOT.en}`;
  },
  rankings: (a, d, L) => {
    const p = prep(d);
    const all = p.ranked.map((v, i) => `${i + 1}. ${locLine(v, L)} — ${L === 'ur' ? `${v.score} (${lbl(LB.prio, v.priority, 'ur')}، اعتماد ${v.confidencePct}%)` : `${v.score} (${v.priority}, confidence ${v.confidencePct}%)`}`).join('\n');
    return L === 'ur' ? `تمام 15 مقامات کی درجہ بندی (اندرونی ڈیش بورڈ ڈیٹا):\n${all}\n${FOOT.ur}`
      : L === 'roman' ? `Poore 15 locations ki ranking (internal dashboard data):\n${all}\n${FOOT.roman}`
        : `All 15 locations ranked by rule-based score (internal dashboard data):\n${all}\n${FOOT.en}`;
  },
  village: (a, d, L) => {
    const hits = a.villages;
    const dup = hits.length > 1 && new Set(hits.map(v => v.id)).size < hits.length;
    const intro = L === 'ur' ? (hits.length > 1 ? 'آپ کے سوال سے ملنے والے ریکارڈز:' : 'اندرونی ڈیش بورڈ ڈیٹا — تصدیق شدہ ریکارڈ:')
      : hits.length > 1 ? 'Matching records from the supplied dataset:' : 'INTERNAL DASHBOARD DATA — verified supplied record';
    const blocks = hits.map(v => `${villageBlock(v, L)}\n${L === 'ur' ? 'تجویز کردہ عمل: ' + action(v, 'ur') : L === 'roman' ? 'Recommended action: ' + action(v, 'roman') : 'Recommended operational action: ' + action(v, 'en')}`).join('\n\n');
    const dupNote = dup ? (L === 'ur' ? '\nنوٹ: یہ دونوں ریکارڈز ایک ہی ذریعہ ID (RJ-07) پر ہیں — ذرائع کی تصدیق درکار ہے؛ دونوں برقرار رکھے گئے ہیں۔' : L === 'roman' ? '\nNote: both records share source ID RJ-07 — source verification required; both are retained.' : '\nNote: both records share source ID RJ-07 — source verification is required; both are retained.') : '';
    return `${intro}\n${blocks}${dupNote}\n${L === 'ur' ? 'گمشدہ فیلڈز کا اندازہ نہیں لگایا گیا — انہیں اسکور کے حساب سے خارج رکھا گیا ہے۔' : L === 'roman' ? 'Missing fields were not guessed — they were excluded from the score calculation.' : 'Missing fields were not guessed — they were excluded from the score calculation.'}\n${FOOT[L]}`;
  },
  district: (a, d, L) => {
    const rows = prep(d).ranked.filter(v => v.district === a.district)
      .map((v, i) => `${i + 1}. ${locLine(v, L)} — ${L === 'ur' ? `${v.score} (${lbl(LB.prio, v.priority, 'ur')}، اعتماد ${v.confidencePct}%)` : `${v.score} (${v.priority}, confidence ${v.confidencePct}%)`}`).join('\n');
    return L === 'ur' ? `ضلع ${a.district} کے مقامات ترجیح کے مطابق (اندرونی ڈیش بورڈ ڈیٹا):\n${rows}\n${FOOT.ur}`
      : L === 'roman' ? `District ${a.district} locations by priority (internal dashboard data):\n${rows}\n${FOOT.roman}`
        : `District ${a.district} locations by priority (internal dashboard data):\n${rows}\n${FOOT.en}`;
  },
  missing: (a, d, L) => {
    const p = prep(d);
    const noPopList = d.filter(v => !v.populationVerified).map(v => v.village).join(', ');
    const survey = d.filter(v => v.score === null).map(v => v.village);
    const body = L === 'ur' ? `15 فراہم کردہ ریکارڈز میں سے:\n• ${15 - p.verifiedPop.length} مقامات کی تصدیق شدہ گاؤں آبادی موجود نہیں (${noPopList})\n• ${p.noGps} مقامات کے GPS کوآرڈینیٹس موجود نہیں\n• ${p.noDist} مقامات کی سہولتی فاصلہ معلومات موجود نہیں\n• ${p.unknownFlood} مقام کا سیلابی خطرہ نامعلوم ہے\n• ${p.unknownAcc} مقامات کی سڑک رسائی نامعلوم ہے\n• RJ-07 ذریعہ ID دو ریکارڈز میں دہرا ہے\n• RJ-09 (فضل پور) کی 98,627 انتظامی آبادی اسکورنگ سے خارج ہے\n${survey.length ? `• اس وقت "سروے درکار" درجہ بندی میں کوئی مقام نہیں (تمام ریکارڈز پر کم از کم BHU وزن دستیاب ہے)` : '• اس وقت "سروے درکار" درجہ بندی میں کوئی مقام نہیں'}\nگمشدہ ڈیٹا کا اندازہ نہیں لگایا جاتا — مکمل ہونے پر اسکور خود بخود دوبارہ حساب ہوگا۔`
      : L === 'roman' ? `15 supplied records mein se:\n• ${15 - p.verifiedPop.length} locations ki verified village population available nahi\n• ${p.noGps} locations ke GPS coordinates available nahi\n• ${p.noDist} locations ka facility distance available nahi\n• ${p.unknownFlood} location ka flood risk unknown hai\n• ${p.unknownAcc} locations ki road accessibility unknown hai\n• RJ-07 source ID do records mein duplicate hai\n• RJ-09 (Fazilpur) ki 98,627 administrative population scoring se excluded hai\n• Abhi koi location "Survey Required" tier mein nahi (har record par kam az kam BHU weight available hai)\nMissing data ka andaza nahi lagaya jata — complete hone par score khud recalculate hota hai.`
        : `Of the 15 supplied records:\n• ${15 - p.verifiedPop.length} locations have no verified village population (${noPopList})\n• ${p.noGps} locations have no GPS coordinates\n• ${p.noDist} locations have no facility-distance value\n• ${p.unknownFlood} location has unknown flood risk\n• ${p.unknownAcc} locations have unknown road accessibility\n• Source ID RJ-07 is duplicated across two records\n• RJ-09 (Fazilpur Outskirts) has its 98,627 administrative population excluded from scoring\n• No location currently falls in the "Survey Required" tier (every record has at least the BHU weight available)\nMissing data is never estimated — when it is completed, scores recalculate automatically.`;
    return `${HEAD[L]}\n${body}\n${FOOT[L]}`;
  },
  duplicates: (a, d, L) => {
    const dupes = d.filter(v => v.id === 'RJ-07');
    const lines = dupes.map((v, i) => `${i + 1}. ${villageBlock(v, L)}`).join('\n\n');
    return L === 'ur' ? `${HEAD.ur}\nذریعہ ID RJ-07 فراہم کردہ ڈیٹا میں دو مرتبہ آتا ہے:\n${lines}\nدونوں ریکارڈز برقرار رکھے گئے ہیں اور انٹرفیس اندرونی row key سے انہیں الگ رکھتا ہے۔ غالباً ایک ID ذریعے کی غلطی ہے؛ ڈیٹا فراہم کرنے والے سے تصدیق درکار ہے۔ میں انہیں ضم یا تبدیل نہیں کروں گا۔`
      : L === 'roman' ? `${HEAD.roman}\nSource ID RJ-07 do dafa supplied dataset mein aata hai:\n${lines}\nDono records retain kiye gaye hain aur interface internal row key se unhein alag rakhta hai. Ghareeban tay aur ek ID source ki ghalti hai; data provider se verification zaroori hai. Main unhein merge ya change nahi karunga.`
        : `${HEAD.en}\nSource ID RJ-07 appears twice in the supplied dataset:\n${lines}\nBoth records are retained, and the interface keeps them distinct via an internal row key. One of the IDs is likely a source error; verification with the data provider is required. I will not merge or alter them.`;
  },
  methodology: (a, d, L) => L === 'ur'
    ? `${HEAD.ur}\nترجیحی اسکور = تصدیق شدہ فیلڈز کا وزنی مجموعہ، دستیاب وزن پر نارملائز:\n• سیلابی خطرہ 40% (زیادہ 40، درمیانی-زیادہ 30، درمیانی 20، کم 10 پوائنٹس)\n• سہولتی فاصلہ 25% (فاصلہ ÷ 40 کلومیٹر، حد سے زیادہ نہیں)\n• مقامی BHU کی عدم موجودگی 15%\n• سڑک رسائی 10% (بہت مشکل/مشکل 10، درمیانی 5، اچھی 0)\n• تصدیق شدہ گاؤں آبادی 10% (آبادی ÷ 20,000، حد سے زیادہ نہیں)\nغیر موجود عوامل اسکور اور نسب (denominator) دونوں سے خارج کیے جاتے ہیں — اندازہ کبھی نہیں لگایا جاتا۔\nدرجہ بندی: 80–100 انتہائی اہم · 60–79 اہم · 40–59 درمیانی · 0–39 کم · اسکور ممکن نہ ہو تو سروے درکار۔\nڈیٹا اعتماد الگ چیز ہے: اعلیٰ ≥75% وزن تصدیق شدہ، درمیانی 45–74%، کم <45%۔\n${FOOT.ur}`
    : L === 'roman' ? `${HEAD.roman}\nPriority score = rule-based weighted sum of verified fields, normalized by available weight:\n• Flood risk 40% (High 40, Medium-High 30, Medium 20, Low 10 points)\n• Facility distance 25% (distance / 40 km, capped)\n• No BHU on site 15%\n• Road accessibility 10% (Poor/Difficult 10, Moderate 5, Good 0)\n• Verified village population 10% (population / 20,000, capped)\nMissing factors are excluded from both the score and the denominator — never guessed.\nTiers: 80–100 Critical · 60–79 High · 40–59 Medium · 0–39 Low · Survey Required when no score can be calculated.\nData confidence is separate: High ≥75% of weighted fields verified, Medium 45–74%, Low <45%.\n${FOOT.roman}`
      : `${HEAD.en}\nPriority score = rule-based weighted sum of verified fields, normalized by available weight:\n• Flood risk 40% (High 40, Medium-High 30, Medium 20, Low 10 points)\n• Facility distance 25% (distance / 40 km, capped)\n• No BHU on site 15%\n• Road accessibility 10% (Poor/Difficult 10, Moderate 5, Good 0)\n• Verified village population 10% (population / 20,000, capped)\nMissing factors are excluded from both the score and the denominator — never guessed.\nTiers: 80–100 Critical · 60–79 High · 40–59 Medium · 0–39 Low · Survey Required when no score can be calculated.\nData confidence is separate: High ≥75% of weighted fields verified, Medium 45–74%, Low <45%.\n${FOOT.en}`,
  confidence: (a, d, L) => {
    const p = prep(d);
    return L === 'ur' ? `${HEAD.ur}\nڈیٹا اعتماد بتاتا ہے کہ وزنی فریم ورک کا کتنا حصہ تصدیق شدہ فیلڈز پر مبنی ہے: اعلیٰ ≥75%، درمیانی 45–74%، کم <45%۔\nموجودہ ڈیٹا سیٹ میں: ${p.confHigh} مقامات اعلیٰ، ${p.confMed} درمیانی، ${p.confLow} کم اعتماد والے ہیں۔\nاعتماد ان پٹ کی تکمیل بتاتا ہے، نتیجے کی قطعیت نہیں — اعلیٰ اسکور کم اعتماد کے ساتھ بھی ہو سکتا ہے، اور یہ دونوں الگ الگ پڑھے جاتے ہیں۔\n${FOOT.ur}`
      : L === 'roman' ? `${HEAD.roman}\nData confidence batata hai ke weighted framework ka kitna hissa verified fields par based hai: High ≥75%, Medium 45–74%, Low <45%.\nCurrent dataset mein: ${p.confHigh} locations High, ${p.confMed} Medium, ${p.confLow} Low confidence.\nConfidence input completeness batata hai, outcome certainty nahi — high score low confidence ke sath bhi ho sakta hai, aur dono ko alag alag parha jata hai.\n${FOOT.roman}`
        : `${HEAD.en}\nData confidence shows how much of the weighted framework rests on verified fields: High ≥75%, Medium 45–74%, Low <45%.\nIn the current dataset: ${p.confHigh} locations are High, ${p.confMed} Medium, and ${p.confLow} Low confidence.\nConfidence describes input completeness, not certainty of an outcome — a high score can still carry low confidence, and the two are always read separately.\n${FOOT.en}`;
  },
  population: (a, d, L) => {
    const p = prep(d);
    const list = p.verifiedPop.map(v => `${nameOf(v, L)} (${v.id}) — ${v.population.toLocaleString('en-US')}`).join('; ');
    return L === 'ur' ? `${HEAD.ur}\nصرف ${p.verifiedPop.length} مقامات کی تصدیق شدہ گاؤں آبادی موجود ہے: ${list}۔\nفضل پور (RJ-09) کی 98,627 تعداد تحصیل کی سطح کا انتظامی عدد ہے اور اسے گاؤں کے ڈیٹا سے خارج رکھا گیا ہے۔ باقی تمام مقامات: ${NA.ur} — فیلڈ سروے درکار ہے۔\n${FOOT.ur}`
      : L === 'roman' ? `${HEAD.roman}\nSirf ${p.verifiedPop.length} locations ki verified village population available hai: ${list}.\nFazilpur (RJ-09) ka 98,627 figure tehsil-level administrative value hai aur village data se exclude kiya gaya hai. Baqi tamam locations: ${NA.roman} — field survey chahiye.\n${FOOT.roman}`
        : `${HEAD.en}\nOnly ${p.verifiedPop.length} of 15 locations have a verified village population: ${list}.\nFazilpur Outskirts\' (RJ-09) 98,627 figure is a tehsil-level administrative value, excluded from village data. All other locations: ${NA.en} — a field survey is required.\n${FOOT.en}`;
  },
  flood: (a, d, L) => {
    const p = prep(d);
    const high = p.highFlood.map(v => `${nameOf(v, L)} (${v.id})`).join(', ');
    return L === 'ur' ? `${HEAD.ur}\nسیلابی خطرہ فراہم کردہ ڈیٹا کے مطابق: ${p.highFlood.length} مقامات "زیادہ"، 4 "درمیانی سے زیادہ"، 1 "کم"، 1 "نامعلوم"۔\nزیادہ خطرے والے مقامات: ${high}۔\nسیلاب کا وزن اسکورنگ میں سب سے زیادہ (40%) ہے، اس لیے یہ فیلڈ کسی بھی ترجیحی تجزیے کی بنیاد ہے۔\n${FOOT.ur}`
      : L === 'roman' ? `${HEAD.roman}\nFlood risk supplied data ke mutabiq: ${p.highFlood.length} locations "High", 4 "Medium-High", 1 "Low", 1 "Unknown".\nHigh-risk locations: ${high}.\nFlood ka weight scoring mein sab se zyada (40%) hai, is liye ye field kisi bhi priority analysis ki bunyad hai.\n${FOOT.roman}`
        : `${HEAD.en}\nFlood risk in the supplied data: ${p.highFlood.length} locations "High", 4 "Medium-High", 1 "Low", 1 "Unknown".\nHigh-risk locations: ${high}.\nFlood risk carries the largest scoring weight (40%), so this field anchors any priority analysis.\n${FOOT.en}`;
  },
  bhu: (a, d, L) => {
    const p = prep(d);
    const list = p.withBhu.map(v => `${nameOf(v, L)} (${v.id})`).join(', ');
    return L === 'ur' ? `${HEAD.ur}\nفراہم کردہ ڈیٹا کے مطابق ${p.withBhu.length} مقامات پر مقامی BHU ریکارڈ ہے: ${list}۔\nباقی ${15 - p.withBhu.length} مقامات پر BHU موجود نہیں، جو اسکورنگ میں 15% وزن رکھتا ہے۔\n${FOOT.ur}`
      : L === 'roman' ? `${HEAD.roman}\nSupplied data ke mutabiq ${p.withBhu.length} locations par on-site BHU record hai: ${list}.\nBaqi ${15 - p.withBhu.length} locations par BHU record nahi, jo scoring mein 15% weight rakhta hai.\n${FOOT.roman}`
        : `${HEAD.en}\nPer the supplied data, ${p.withBhu.length} locations have a BHU recorded on site: ${list}.\nThe other ${15 - p.withBhu.length} locations have no BHU on record, which carries 15% of the scoring weight.\n${FOOT.en}`;
  },
  fallback: (a, d, L) => L === 'ur'
    ? `میں صرف ڈیش بورڈ کے فراہم کردہ ڈیٹا (15 گاؤں ریکارڈز) اور منظور شدہ بیرونی ذرائع (WHO، OpenStreetMap، NDMA، Rescue 1122، مردم شماری/PBS، PSLM، صحت محکمہ پنجاب) کے لائیو معائنوں سے جواب دے سکتا ہوں — اس سوال کے لیے میرے پاس کوئی تصدیق شدہ معلومات نہیں، اور میں اندازہ یا گھڑاؤ نہیں کروں گا۔\nآپ پوچھ سکتے ہیں: ترجیحات · کسی مخصوص مقام کی تفصیل · گمشدہ ڈیٹا اور سروے · RJ-07 نقل · طریقۂ کار · ڈیٹا اعتماد · سیلابی خطرہ · BHU کی صورتحال — یا بیرونی سوالات جو WHO، OpenStreetMap، NDMA، Rescue 1122، PBS، PSLM یا صحت محکمہ پنجاب کی طرف بھیجے جائیں۔\n(اختیاری Grok لائبریری configure ہو تو آزادانہ سوالات کی وضاحت بھی ممکن ہے۔)`
    : L === 'roman' ? `Main sirf dashboard ke supplied data (15 village records) aur approved external sources (WHO, OpenStreetMap, NDMA, Rescue 1122, PBS census, PSLM, Punjab Health) ke live checks se jawab de sakta hoon — is sawal ke liye mere paas koi verified maloomat nahi, aur main andaza ya fabrication nahi karunga.\nAap pooch sakte hain: priorities · kisi location ki detail · missing data aur surveys · RJ-07 duplicate · methodology · data confidence · flood risk · BHU status — ya external sawal jo WHO, OpenStreetMap, NDMA, Rescue 1122, PBS, PSLM ya Punjab Health ki taraf route hon.\n(Optional Grok layer configure ho to free-form sawalon ki wazahat bhi mumkin hai.)`
      : `I can only answer from the dashboard's supplied dataset (15 village records) and live checks against the approved external sources (WHO, OpenStreetMap, NDMA, Rescue 1122, PBS census, PSLM, Punjab Health Department) — I hold no verified information for this question, and I will not guess or fabricate.\nYou can ask about: priorities · any specific location · missing data and surveys · the RJ-07 duplicate · methodology · data confidence · flood risk · BHU status — or external questions routed to WHO, OpenStreetMap, NDMA, Rescue 1122, PBS, PSLM, or the Punjab Health Department.\n(With the optional Grok layer configured, free-form questions can also be explained.)`
};

function answer(a, dataset) {
  const L = a.lang === 'mixed' ? 'ur' : a.lang;
  const builder = B[a.intent] || B.fallback;
  return {
    answer: builder(a, dataset, L),
    lang: a.lang,
    intent: a.intent,
    origin: 'internal',
    meta: { source: 'Internal dashboard dataset — 15 supplied village records (verified fields only)', url: '/api/data', retrievedAt: new Date().toISOString(), status: 'verified supplied data' }
  };
}

module.exports = { analyze, answer, detectLang, detectIntent, findVillages };
