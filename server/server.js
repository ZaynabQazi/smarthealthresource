const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chat = require('./chatEngine');
const { handleExternal } = require('./externalSources');
const supabase = require('./supabase');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'src');
const villages = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'villages.json'), 'utf8'));
if (fs.existsSync(path.join(ROOT, '.env'))) {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const hit = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^['"]|['"]$/g, '');
  }
}

const flood = { High: 40, 'Medium-High': 30, Medium: 20, Low: 10 };
const access = { Poor: 10, Difficult: 10, Moderate: 5, Good: 0 };
function scored(v, i) {
  let got = 0, available = 15;
  if (flood[v.flood_risk] !== undefined) { got += flood[v.flood_risk]; available += 40; }
  if (typeof v.distance_km === 'number') { got += Math.min(v.distance_km / 40, 1) * 25; available += 25; }
  if (!v.has_bhu_on_site) got += 15;
  if (access[v.accessibility] !== undefined) { got += access[v.accessibility]; available += 10; }
  const populationVerified = typeof v.population === 'number' && v.id !== 'RJ-09';
  if (populationVerified) { got += Math.min(v.population / 20000, 1) * 10; available += 10; }
  const score = available ? Math.round(got / available * 100) : null;
  const confidence = available >= 75 ? 'High' : available >= 45 ? 'Medium' : 'Low';
  const level = score === null ? 'Survey Required' : score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 40 ? 'Medium' : 'Low';
  return { ...v, rowKey: `${v.id}-${i}`, score, confidence, confidencePct: available, priority: level, populationVerified };
}
const dataset = villages.map(scored);
const context = dataset.map(v => ({ location: v.village, id: v.id, district: v.district, tehsil: v.tehsil, priorityScore: v.score, priorityLevel: v.priority, confidence: `${v.confidence} (${v.confidencePct}%)`, floodRisk: v.flood_risk, distanceKm: v.distance_km ?? 'Not Available', bhuOnSite: v.has_bhu_on_site, accessibility: v.accessibility, verifiedPopulation: v.populationVerified ? v.population : 'Not Available' }));
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function parseCookies(req) {
  const cookie = req.headers.cookie || '';
  const cookies = {};
  cookie.split(';').forEach(c => {
    const [name, ...rest] = c.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}
function readBody(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let raw = ''; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Request too large')); req.destroy(); } else raw += c; });
    req.on('end', () => resolve(raw)); req.on('error', reject);
  });
}
function serve(req, res) {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(PUBLIC, '.' + pathname);
  if (pathname === '/scan') pathname = '/scan/index.html';
  const scanFile = path.resolve(PUBLIC, '.' + pathname);
  if (!scanFile.startsWith(PUBLIC) || !fs.existsSync(scanFile) || fs.statSync(scanFile).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[path.extname(scanFile)] || 'application/octet-stream', 'Cache-Control': pathname.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600' }); fs.createReadStream(scanFile).pipe(res);
}
function parseJson(raw) { try { return JSON.parse(raw); } catch { return null; } }
function normalizeEmergency(body) {
  const villageId = typeof body?.villageId === 'string' ? body.villageId.trim().slice(0, 80) : '';
  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim().replace(/[^+0-9]/g, '').slice(0, 20) : null;
  const reportedAt = typeof body?.reportedAt === 'string' && !Number.isNaN(Date.parse(body.reportedAt)) ? new Date(body.reportedAt).toISOString() : new Date().toISOString();
  const latitude = Number.isFinite(Number(body?.latitude)) ? Number(body.latitude) : null;
  const longitude = Number.isFinite(Number(body?.longitude)) ? Number(body.longitude) : null;
  return { villageId, type, phone, reportedAt, latitude, longitude };
}
function webhookAuthorized(req) { const supplied = String(req.headers['x-sms-webhook-secret'] || ''); const expected = String(process.env.SMS_WEBHOOK_SECRET || ''); return Boolean(expected && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))); }
async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    const body = parseJson(await readBody(req)); const email = body?.email; const password = body?.password;
    if (!email || !password) return json(res, 400, { error: 'Email and password required.' });
    try { await supabase.signUp(email, password); return json(res, 201, { message: 'Account created. Check email confirmation if enabled in Supabase.' }); }
    catch (error) { return json(res, error.status === 400 ? 400 : 503, { error: error.message }); }
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = parseJson(await readBody(req)); const email = body?.email; const password = body?.password;
    if (!email || !password) return json(res, 400, { error: 'Email and password required.' });
    try { const result = await supabase.signIn(email, password); if (!result.access_token) return json(res, 401, { error: 'Invalid email or password.' }); res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `session=${encodeURIComponent(result.access_token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${result.expires_in || 3600}`
    }); return res.end(JSON.stringify({ message: 'Login successful', expiresAt: result.expires_at })); }
    catch (error) { return json(res, error.status === 400 ? 401 : 503, { error: error.message }); }
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const cookies = parseCookies(req);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0'
    });
    return res.end(JSON.stringify({ message: 'Logged out' }));
  }

  if (req.method === 'GET' && pathname === '/api/auth/verify') {
    const cookies = parseCookies(req);
    try { const user = await supabase.getUser(cookies.session); return json(res, 200, { authenticated: Boolean(user?.id), user: user?.email || null }); }
    catch { return json(res, 401, { authenticated: false }); }
  }

  if (req.method === 'POST' && pathname === '/api/emergency/report') {
    const body = parseJson(await readBody(req));
    if (!body || body.website) return json(res, 202, { accepted: false, reason: 'ignored' });
    const report = normalizeEmergency(body);
    if (!report.villageId || !['pregnancy','child','accident','other'].includes(report.type)) return json(res, 400, { error: 'Invalid emergency report.' });
    try { const result = await supabase.rpc('submit_emergency_report', { p_village_id: report.villageId, p_emergency_type: report.type, p_phone: report.phone, p_reported_at: report.reportedAt, p_latitude: report.latitude, p_longitude: report.longitude, p_source: body.queued ? 'offline_queue' : 'qr' }); return json(res, 200, result); }
    catch (error) { return json(res, error.status === 400 ? 400 : 503, { error: 'Could not submit report. Save it on this phone and try again.' }); }
  }

  if (req.method === 'POST' && pathname === '/api/sms') {
    if (!webhookAuthorized(req)) return json(res, 401, { error: 'Unauthorized webhook.' });
    const body = parseJson(await readBody(req)); const message = String(body?.message || body?.text || '').trim();
    const match = message.match(/^(?:EMERGENCY\s+)?([A-Z]{2,3}-?\d{2,}|V\d+)\s+(pregnancy|child|accident|other)(?:\s+\[?(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\]?)?$/i);
    const heartbeat = message.match(/^OK\s+([A-Z]{2,3}-?\d{2,}|V\d+)$/i);
    try {
      if (heartbeat) return json(res, 200, await supabase.rpc('record_village_heartbeat', { p_village_id: heartbeat[1] }, true));
      if (!match) return json(res, 400, { error: 'Expected: EMERGENCY V001 pregnancy [lat,lng] or OK V001' });
      const result = await supabase.rpc('submit_emergency_report', { p_village_id: match[1], p_emergency_type: match[2].toLowerCase(), p_phone: null, p_reported_at: new Date().toISOString(), p_latitude: match[3] ? Number(match[3]) : null, p_longitude: match[4] ? Number(match[4]) : null, p_source: 'sms' }, true);
      return json(res, 200, result);
    } catch (error) { return json(res, 503, { error: error.message }); }
  }

  const cookies = parseCookies(req);
  let session = null; try { session = await supabase.getUser(cookies.session); } catch {}
  if (!session && (pathname === '/api/data' || pathname === '/api/chat' || pathname === '/api/emergency/status')) {
    return json(res, 401, { error: 'Authentication required' });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/data')) return json(res, 200, dataset);
  if (req.method === 'GET' && pathname === '/api/emergency/status') { try { return json(res, 200, await supabase.emergencyStatus()); } catch (error) { return json(res, 503, { error: error.message }); } }
  if (req.method === 'POST' && pathname === '/api/chat') {
    const raw = await readBody(req);
    let question; try { question = JSON.parse(raw).question; } catch { return json(res, 400, { error: 'Invalid request.' }); }
    if (!question || typeof question !== 'string' || question.length > 1500) return json(res, 400, { error: 'Please enter a question (up to 1,500 characters).' });
    const analysis = chat.analyze(question, dataset);
    if (analysis.intent.startsWith('ext_')) {
      const ext = await handleExternal(analysis.intent, analysis, dataset);
      if (ext) return json(res, 200, ext);
    }
    const deterministic = chat.answer(analysis, dataset);
    if (analysis.intent !== 'fallback' || !process.env.GROK_API_KEY) return json(res, 200, deterministic);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${process.env.GROK_API_KEY}` }, body: JSON.stringify({ model:'grok-3-mini', temperature:0.2, max_tokens:450, messages:[
        { role:'system', content:'You are the Smart Health Resource Allocation Assistant for an NGO decision-support dashboard. Use ONLY the supplied dashboard data for factual claims. If a field is missing, say it is unavailable. Never invent facility names, populations, health outcomes, road facts, geographic facts, or statistics. Clearly separate data-supported findings, operational recommendations, and missing information. Do not diagnose patients or claim medical certainty. Keep answers concise and practical.' },
        { role:'system', content:`Verified dashboard dataset:\n${JSON.stringify(context)}` },
        { role:'user', content:question }
      ] }) });
      const body = await response.json();
      if (!response.ok || !body.choices?.[0]?.message?.content) return json(res, 200, deterministic);
      return json(res, 200, { answer: body.choices[0].message.content, lang: analysis.lang, intent: 'fallback', origin: 'internal-ai', meta: { source: 'Internal dashboard dataset (verified fields) — AI-assisted phrasing', url: '/api/data', retrievedAt: new Date().toISOString(), status: 'AI-assisted — grounded in the supplied dataset only; scores are never changed' } });
    } catch (error) { return json(res, 200, deterministic); }
    finally { clearTimeout(timer); }
  }
  serve(req, res);
}

module.exports = handler;

if (require.main === module) {
  http.createServer(handler).listen(process.env.PORT || 3000, () => console.log('Smart Health Resource Allocator: http://localhost:3000'));
}
