'use strict';

const base = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
function configured() { return Boolean(base() && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_KEY); }
function headers(key, extra = {}) { return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }; }
async function request(path, { method = 'GET', body, service = false, authToken } = {}) {
  if (!configured()) throw new Error('Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_KEY.');
  const key = service ? process.env.SUPABASE_SERVICE_KEY : process.env.SUPABASE_ANON_KEY;
  const response = await fetch(`${base()}${path}`, { method, headers: headers(authToken || key, { apikey: process.env.SUPABASE_ANON_KEY }), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) { const error = new Error(data?.message || data?.error_description || `Supabase request failed (${response.status})`); error.status = response.status; throw error; }
  return data;
}
async function signUp(email, password) { return request('/auth/v1/signup', { method: 'POST', body: { email, password } }); }
async function signIn(email, password) { return request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); }
async function getUser(accessToken) { return request('/auth/v1/user', { authToken: accessToken }); }
async function rpc(name, body, service = false) { return request(`/rest/v1/rpc/${name}`, { method: 'POST', body, service }); }
async function emergencyStatus() { return request('/rest/v1/village_status?select=*', { service: true }); }
module.exports = { configured, signUp, signIn, getUser, rpc, emergencyStatus };
