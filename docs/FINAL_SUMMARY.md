# Final Project Summary — Smart Health Resource Allocator

> Migration update: legacy SQLite references below are superseded by the Supabase integration and `docs/EMERGENCY_QR.md`. Apply `supabase/emergency_schema.sql` and set the Vercel environment variables before production deployment.

## 1. Project Purpose

A decision-support web application for NGO program officers to prioritize health-resource allocation across underserved villages in South Punjab, Pakistan. Built for the **Alkhidmat × Alibaba Cloud Hackathon**.

The application ingests a supplied dataset of 15 village records, applies a transparent weighted scoring formula to produce priority rankings, and presents the results through an interactive map, filterable tables, location detail pages, data-quality flags, and a multilingual AI assistant — all behind secure session-based authentication.

---

## 2. Implemented Features

| # | Feature | Status |
|---|---------|--------|
| 1 | Secure signup / login with scrypt password hashing | BUILT |
| 2 | Session management with HttpOnly cookies (24-hour expiry) | BUILT |
| 3 | KPI dashboard (total locations, avg priority, high-priority count, total population) | BUILT |
| 4 | Leaflet map with OpenStreetMap tiles and marker popups | BUILT |
| 5 | Priority ranking table with sorting | BUILT |
| 6 | District, tehsil, priority, flood-risk, and confidence filters | BUILT |
| 7 | Free-text search across locations | BUILT |
| 8 | Location detail page with score breakdown and recommended action | BUILT |
| 9 | Data quality page with duplicate detection and missing-data flags | BUILT |
| 10 | CSV export of filtered data | BUILT |
| 11 | AI chatbot — deterministic internal answers (village data) | BUILT |
| 12 | AI chatbot — external source routing (8 verified sources) | BUILT |
| 13 | AI chatbot — optional Grok API fallback for unmatched questions | BUILT |
| 14 | Multilingual UI (English, Urdu) with RTL layout | BUILT |
| 15 | Responsive design (single-column reflow at ~455px) | BUILT |
| 16 | Score-override refusal (chatbot never modifies priority scores) | BUILT |
| 17 | Methodology explanation page | BUILT |

---

## 3. How It Works

1. The user creates an account or logs in with existing credentials.
2. The server verifies credentials using scrypt hash comparison and issues a session token stored as an HttpOnly cookie.
3. The authenticated user accesses the dashboard, which loads the scored village dataset from `/api/data`.
4. The scoring engine applies five weighted factors to each village record:
   - **Flood risk** (40%): High=40, Medium-High=30, Medium=20, Low=10
   - **Facility distance** (25%): normalized against 40 km ceiling
   - **BHU absence** (15%): 15 points if no Basic Health Unit on site
   - **Road accessibility** (10%): Poor/Difficult=10, Moderate=5, Good=0
   - **Verified population** (10%): normalized against 20,000 ceiling
5. Scores are normalized to 0–100 and classified into priority tiers (Critical ≥80, High 60–79, Medium 40–59, Low 0–39, Survey Required if null).
6. Confidence levels reflect data completeness: High (≥75% fields available), Medium (45–74%), Low (<45%).
7. The AI assistant answers questions using deterministic logic for internal data, routes external queries to 8 verified sources, and falls back to Grok API only when no deterministic match exists.
8. All responses display source metadata (Source, Retrieved timestamp, Data status) for transparency.

---

## 4. Frontend Technology

| Technology | Purpose |
|------------|---------|
| HTML5 | Page structure (index, login, dashboard, detail, chat, data-quality, methodology) |
| CSS3 (custom) | Styling with CSS variables, RTL support, responsive breakpoints |
| Vanilla JavaScript (ES modules) | Client-side logic, fetch API, DOM manipulation, no frameworks |
| Leaflet.js 1.9.4 | Interactive map rendering with OpenStreetMap tiles |
| Chart.js 4.4.0 | KPI visualizations on the dashboard |

All frontend files are static and served directly by the Node.js HTTP server from the `src/` directory.

---

## 5. Backend Technology

| Technology | Purpose |
|------------|---------|
| Node.js ≥18 | Runtime environment |
| Built-in `http` module | HTTP server (no Express, no frameworks) |
| `better-sqlite3` | Synchronous SQLite database for user and session storage |
| Built-in `crypto` module | scrypt password hashing, random salt/token generation, timing-safe comparison |
| Built-in `fs` / `path` | File serving, villages.json loading, .env parsing |
| `fetch` (Node 18+ built-in) | HTTP requests to external sources and Grok API |

---

## 6. Database

- **Engine**: SQLite (via `better-sqlite3`)
- **File**: `users.db` (gitignored, auto-created on first run)
- **Tables**:
  - `users` — id (PK, autoincrement), email (unique), password_hash (128-char hex), salt (32-char hex), created_at
  - `sessions` — token (PK, 64-char hex), user_id (FK → users.id), expires_at (ISO-8601)
- **Relationship**: One user → many sessions (1:N)
- **Maintenance**: Expired sessions cleaned hourly via `setInterval`
- **Seeding**: 3 seed accounts created idempotently on server startup for initial testing

---

## 7. APIs and Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/signup` | No | Create new user account |
| POST | `/api/auth/login` | No | Authenticate and receive session cookie |
| POST | `/api/auth/logout` | No | Invalidate session |
| GET | `/api/auth/verify` | No | Check if session is valid |
| GET | `/api/data` | Yes | Return scored village dataset |
| POST | `/api/chat` | Yes | Submit question, receive AI assistant response |

All API responses are JSON with `charset=utf-8`.

---

## 8. AI / LLM Integration

- **Primary**: Deterministic rule-based chat engine (`chatEngine.js`) — handles village queries, score explanations, data-quality questions, greetings, and score-override refusals without any external API.
- **External sources**: 8 verified URLs routed by topic intent (WHO, NDMA, Census, PBS, BHU, Rescue 1122, OSM, SES).
- **Fallback**: Grok API (`grok-3-mini` model) — only invoked when a question matches no deterministic pattern AND `GROK_API_KEY` is configured. Response is grounded in the supplied dataset only; scores are never modified.
- **Language detection**: English, Urdu script, Roman Urdu, and mixed input are all detected and routed.
- **Guardrails**: Score-override refusal in all three languages; empty/oversized/non-string input rejected with HTTP 400; max 1,500 characters per question.

---

## 9. Technology & Tools Stack

| Tool / Technology | Where Used | Purpose |
|-------------------|------------|---------|
| Node.js ≥18 | Backend runtime | HTTP server, API logic, file serving |
| `http` module (built-in) | `server.js` | Create HTTP server without frameworks |
| `crypto` module (built-in) | `database.js` | scrypt hashing, random bytes, timing-safe compare |
| `fs` / `path` (built-in) | `server.js` | Static file serving, villages.json loading |
| `better-sqlite3` | `database.js` | SQLite database for users and sessions |
| `fetch` (Node 18+ built-in) | `server.js`, `externalSources.js` | HTTP requests to external sources and Grok API |
| SQLite | `users.db` | Persistent user and session storage |
| HTML5 | `src/*.html` | Page structure |
| CSS3 | `src/styles/*.css` | Styling, RTL, responsive layout |
| Vanilla JavaScript | `src/scripts/*.js` | Client-side logic, no frameworks |
| Leaflet.js 1.9.4 | `src/scripts/app.js` | Interactive map with OpenStreetMap tiles |
| Chart.js 4.4.0 | `src/scripts/app.js` | Dashboard KPI charts |
| villages.json | `src/data/villages.json` | 15 supplied village records (read-only) |
| SVG | `diagrams/*.svg` | Architecture and flow diagrams |
| Git | Project root | Version control |
| npm | `package.json` | Dependency management |

---

## 10. Backend Summary

**Server architecture**: Single Node.js process using the built-in `http` module — no Express, no Koa, no frameworks. All routing is manual via URL pathname matching.

**File structure**:
- `server/server.js` — HTTP server, route handling, scoring engine, Grok API integration
- `server/database.js` — SQLite schema, auth functions (signup, login, verifySession, logout), seed account creation
- `server/chatEngine.js` — Deterministic intent analysis and answer generation
- `server/externalSources.js` — External URL routing for 8 verified sources

**Authentication flow**:
1. Signup: email + password → validate → generate 16-byte random salt → `crypto.scryptSync(password, salt, 64)` → store hash (128-char hex) + salt in SQLite.
2. Login: email lookup → recompute hash with stored salt → `crypto.timingSafeEqual` comparison → generate 32-byte random token → store in sessions table with 24-hour expiry → set `HttpOnly; SameSite=Strict; Max-Age=86400` cookie.
3. Session verify: read cookie → lookup token in sessions table where `expires_at > now()`.
4. Logout: delete session row → clear cookie with `Max-Age=0`.
5. Protected routes (`/api/data`, `/api/chat`): return 401 if no valid session.

**Scoring engine**: Runs once at server startup. Reads `villages.json`, applies the five-factor weighted formula, normalizes to 0–100, assigns priority tier and confidence level, and stores the result in memory. The scored dataset is served on every `/api/data` request.

**Chat pipeline**:
1. Intent analysis (language detection + keyword matching)
2. If internal intent → deterministic answer from dataset
3. If external intent → route to matching source via `handleExternal`
4. If fallback + Grok key exists → call Grok API with system prompt + dataset context
5. If fallback + no key → return honest "not configured" response

**External sources**: WHO OData, OpenStreetMap Overpass, Punjab Health (BHU list), Pakistan Census 2023, PBS economic indicators, NDMA alerts, Rescue 1122, and SES. Each source is fetched with a 10-second timeout; failures are reported honestly without fabricating data.

**Error handling**: Malformed JSON → 400; missing auth → 401; oversized questions → 400; external source failures → graceful fallback to deterministic response.

---

## 11. Authentication & Security

| Feature | Implementation |
|---------|----------------|
| Password hashing | `crypto.scryptSync` with 16-byte random salt, 64-byte output (hex-encoded) |
| Token generation | `crypto.randomBytes(32)` — 64-char hex session token |
| Cookie security | `HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` |
| Session storage | SQLite `sessions` table with expiry timestamps |
| Timing-safe compare | `crypto.timingSafeEqual` for password hash comparison |
| Auth gate | `/api/data` and `/api/chat` return 401 without valid session |
| Session cleanup | Hourly deletion of expired sessions via `setInterval` |
| Path traversal protection | `path.resolve` + `startsWith(PUBLIC)` check on file serving |
| Input validation | Email format regex, password min 8 chars, question max 1,500 chars |

---

## 12. Scoring Methodology

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Flood risk | 40% | High=40, Medium-High=30, Medium=20, Low=10 |
| Facility distance | 25% | `min(distance_km / 40, 1) × 25` |
| BHU absence | 15% | 15 points if `has_bhu_on_site` is false |
| Road accessibility | 10% | Poor/Difficult=10, Moderate=5, Good=0 |
| Verified population | 10% | `min(population / 20000, 1) × 10` (excluded for RJ-09) |

**Normalization**: `score = round(got / available × 100)` — available starts at 15 (BHU) and increases as fields are present.

**Priority tiers**: Critical (80–100), High (60–79), Medium (40–59), Low (0–39), Survey Required (null score).

**Confidence tiers**: High (≥75% data available), Medium (45–74%), Low (<45%).

---

## 13. Map Technology

- **Library**: Leaflet.js 1.9.4 (loaded from CDN)
- **Tile provider**: OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
- **Features**: Marker clustering by priority tier, color-coded icons, popup with village name and "View details" link, fit-bounds on load, scroll-wheel zoom disabled.

---

## 14. Testing Completed

All items below were exercised against the running application (live HTTP and browser interaction):

- Login (wrong credentials rejected, valid credentials accepted) and logout with session cleared
- Dashboard KPIs, Leaflet map with plotted GPS records, marker popups, popup navigation
- Filters (district, tehsil, priority, flood risk, confidence), search, clear filters, rankings sorting, CSV export
- Location detail: score, confidence, verified record, score breakdown, recommended action, "Ask AI" link
- Data quality: all counts re-derived from villages.json and matched
- English and Urdu UI with RTL direction, language toggle both ways
- Chatbot: village questions in English, Urdu script, Roman Urdu, mixed; greetings; score-override refusals; missing-data answers; RJ-07 duplicate answers; Fazilpur exclusion note
- Malformed input rejection (empty, oversized, non-string → HTTP 400)
- External sources: all 8 sources live-tested through the backend
- Responsive layout at ~455px width

**Not verified**: Live Grok API response (no API key in test environment), cross-browser testing (single Chromium browser used).

---

## 15. Known Limitations

- Limited supplied data (15 village records with incomplete fields)
- No field data entry capability
- No role-based access control enforcement (roles are designed but not enforced on routes)
- SQLite is single-file and not suitable for production concurrency
- Grok API requires an external key (optional, graceful degradation without it)
- No audit trail for user actions
- Single-process deployment (no horizontal scaling)
- Cross-browser and live-Grok testing not completed in the hackathon environment

---

## 16. Architecture Diagrams

Nine SVG diagrams are in `diagrams/`:

1. **System Architecture** (`01-system-architecture.svg`)
2. **Authentication Flow** (`02-auth-flow.svg`)
3. **Data Flow & Scoring Engine** (`03-data-flow.svg`)
4. **AI Chat Pipeline** (`04-chat-pipeline.svg`)
5. **Deployment Architecture** (`05-deployment.svg`)
6. **Use Case Diagram** (`06-use-case.svg`)
7. **Entity-Relationship Diagram** (`07-erd.svg`)
8. **DFD Level 0 — Context Diagram** (`08-dfd-level0.svg`)
9. **DFD Level 1 — Decomposed Processes** (`09-dfd-level1.svg`)
