# Smart Health Resource Allocator — Project Documentation

## 1. Problem and users

NGO program teams have limited outreach capacity and need a consistent way to compare rural locations. This system supports NGO admins, program officers, and (in a future production system) field officers. It is location/resource planning, not diagnosis, prediction, or autonomous allocation.

## 2. User journey

`NGO user → secure login (credentials) → session cookie → dashboard → filter locations → map → location detail → score factors + confidence → recommended operational action → NGO/program officer final decision`

## 3. Built features

| Status | Capability |
|---|---|
| BUILT | Secure login/signup with `crypto.scrypt` password hashing, random session tokens, HttpOnly cookies, and `timingSafeEqual` comparison |
| BUILT | Three seed accounts (NGO Admin, Program Officer, Field Officer) created idempotently on server startup for initial testing |
| BUILT | 15 supplied location records, filters, rankings, Leaflet map, detail view, CSV export |
| BUILT | Data-quality indicators, transparent weighted scoring, confidence calculation, English/Urdu UI |
| BUILT | Multilingual AI assistant (English, Urdu script, Roman Urdu, mixed English/Urdu) answering internal questions deterministically from the supplied dataset — scores are never overridden and missing fields are reported as Not Available / Survey Required |
| BUILT | External source routing over the 8 approved sources with backend live retrieval, Source / Retrieved / Data status on every external answer, and honest failure reporting |
| PARTIALLY BUILT | Server-side Grok route; used only for unmatched fallback questions and works only when `GROK_API_KEY` is configured |
| FUTURE | RBAC enforcement, field updates, audit logs, multi-organization isolation, production deployment |

Authentication uses SQLite-backed session storage with 24-hour expiry, automatic hourly session cleanup, and an auth gate that returns 401 for unauthenticated access to `/api/data` and `/api/chat`. Seed accounts are created idempotently on server startup — restarting the server does not create duplicates.

## 4. Dataset and quality findings

The system uses the 15 supplied Muzaffargarh and Rajanpur records. It does not add locations, coordinates, facilities, or outcomes.

- `RJ-07` occurs for both Tatarwala and Lalgarh. The source ID stays visible; an internal row key prevents interface collisions. Source verification is required.
- Fazilpur Outskirts (`RJ-09`) contains 98,627, an administrative/tehsil-level population. It is shown as `Not Available` for village population and excluded from scoring.
- Records with unavailable coordinates are not plotted.
- Missing facility distance, population, accessibility, or unknown flood risk are not inferred. The Data quality page exposes these gaps.

## 5. Scoring and confidence

The rule-based weighted framework is:

| Indicator | Weight |
|---|---:|
| Flood risk | 40% |
| Facility distance | 25% |
| BHU absence | 15% |
| Accessibility | 10% |
| Verified village population | 10% |

Only available verified factors enter the denominator. Priority tiers are Critical 80–100, High 60–79, Medium 40–59, and Low 0–39. Confidence represents input completeness, not certainty: High ≥75% verified weight, Medium 45–74%, Low <45%. A score and confidence must always be read separately.

## 6. Current versus future AI

**Built deterministic engine:** `server/chatEngine.js` matches intents (village profile, ranking, duplicates, missing data, methodology, override attempts, greetings, and more) and answers from the supplied dataset in English, Urdu script, Roman Urdu, and mixed English/Urdu. It refuses score-override requests, quotes the fixed 40/25/15/10/10 weights, and reports unavailable fields as Not Available or Survey Required.

**Built external-source routing:** `server/externalSources.js` routes topic questions to the approved sources — Punjab Health Department BHU listing, Pakistan Digital Census, PBS Geo-Economic Observatory, PSLM District Dashboard, NDMA alerts, Rescue 1122, OpenStreetMap Overpass, and the WHO GHO OData API. Retrieval happens on the backend (the API key, if any, never reaches the browser). Each external answer is framed with Source, Retrieved timestamp, and Data status, is marked reference-only, and never overwrites the internal dataset. Pages whose content loads dynamically via scripts are reported as such rather than guessed.

**Optional fallback:** unmatched questions go to the secure Grok route only when `GROK_API_KEY` is set; otherwise the assistant states plainly that no answer is available rather than inventing one.

**Future production architecture:** validated data → priority engine → score + confidence → LLM explanation layer → NGO decision. An LLM would explain, summarize, and translate; it would not determine allocation.

## 7. Architecture and data flow

```text
NGO User → Secure Login (scrypt + session cookie) → Dashboard
                                                     ↓
                                        Map / Ranking / Location Detail
                                                     ↓
                                  Auth Gate → Data Validation → Priority Engine
                                                     ↓
                                  Priority Score + Data Confidence
                                                     ↓
                             Explanation / Action → NGO Final Decision
```

Missing-data workflow: `Incomplete data → Survey Required → Field verification → Data updated → Priority recalculated`.

## 8. Technology

Implemented: HTML, CSS, vanilla JavaScript, Node.js serverless-compatible HTTP routing, Leaflet, OpenStreetMap tiles, Supabase Auth/REST integration, an embedded JSON dataset, and a Supabase emergency-report migration. The project is Vercel-ready once the required environment variables and SQL migration are applied. It does not include a trained ML model or patient-record store.

## 9. Architecture diagrams

Nine SVG diagrams are in `diagrams/`:

1. **System Architecture** (`01-system-architecture.svg`) — Browser, Node.js HTTP server, auth module, chat engine, external sources, SQLite database, villages.json dataset, optional Grok API, and frontend files.
2. **Authentication Flow** (`02-auth-flow.svg`) — Signup → scrypt hash → SQLite insert; login → verify → random token → HttpOnly cookie; session verify → protected routes.
3. **Data Flow & Scoring Engine** (`03-data-flow.svg`) — villages.json → weighted scoring (40/25/15/10/10) → priority tiers + confidence levels → frontend outputs (map, rankings, detail, KPIs, CSV export).
4. **AI Chat Pipeline** (`04-chat-pipeline.svg`) — User question → intent analysis → deterministic engine / external sources / AI-assisted fallback → response with source metadata.
5. **Deployment Architecture** (`05-deployment.svg`) — Current single-process deployment vs. production target (Alibaba Cloud ECS, PostgreSQL, CDN, monitoring).
6. **Use Case Diagram** (`06-use-case.svg`) — Actors (NGO Admin, Program Officer, Field Officer) and their interactions with system features.
7. **Entity-Relationship Diagram** (`07-erd.svg`) — Database entities: users, sessions, and their relationships.
8. **DFD Level 0 — Context Diagram** (`08-dfd-level0.svg`) — System boundary with external entities and data flows.
9. **DFD Level 1 — Decomposed Processes** (`09-dfd-level1.svg`) — Five internal processes: authentication, data scoring, chat routing, external retrieval, and session management.

## 10. Testing completed

All items below were exercised against the running application (live HTTP and browser interaction), not by code inspection alone:

- Secure signup: new accounts created, password hashing verified, duplicate email rejected.
- Secure login: wrong credentials rejected, valid credentials accepted, HttpOnly session cookie set.
- Auth gate: unauthenticated `/api/data` and `/api/chat` return 401; authenticated requests return data.
- Logout: session cookie cleared, subsequent API calls return 401.
- Dashboard: KPIs, Leaflet map with 8 plotted GPS records, marker popups, popup "View details" navigation.
- Filters (district, tehsil, priority, flood risk, confidence), search, clear filters, rankings sorting, and CSV export (verified header, 15 rows + header, RJ-07 twice, Fazilpur population cell empty).
- Location detail: score, confidence, verified record, score breakdown, recommended action, "Ask AI about this location", and data flags on RJ-07 (duplicate) and RJ-09 (population exclusion), in English and Urdu.
- Data quality page: all counts re-derived from `villages.json` and matched.
- English and Urdu UI with RTL direction, including the language toggle both ways.
- Chatbot over `/api/chat`: village questions in English, Urdu script, Roman Urdu, and mixed English/Urdu; greetings; score-override refusals in three languages; missing-data answers; RJ-07 duplicate answers; Fazilpur exclusion note; malformed-input rejection (empty, oversized, non-string → HTTP 400); score-integrity regression against the computed baseline.
- External sources: all 8 approved sources live-tested through the backend (WHO OData and OpenStreetMap Overpass return parsed data; Punjab Health, Census, PBS economic, NDMA, and Rescue 1122 pages fetched with HTTP status and honest reporting of dynamic-content limits; PSLM dashboard returned a source-side HTTP 500 and was reported as such). Routing matrix of 17 topic phrasings across languages all routed to the intended source.
- Responsive layout at ~455px width: single-column reflow, no horizontal overflow, table in scroll container.
- Live Grok response: **not verified in the current environment** (no API key); the no-key path returns an honest "not configured" answer.
- Chrome, Edge, Firefox, and Safari: **not verified in the current environment** (testing used a single Chromium-based browser).

## 11. Usage flow

1. Open the login page — create an account via signup or use existing credentials.
2. Log in to access the dashboard.
3. State the decision question: where should the NGO act first, and why?
4. Show KPIs and Available GPS Points on the map.
5. Filter a district or flood-risk level.
6. Open a high-priority location and explain score versus confidence.
7. Open Data quality and call out the RJ-07 and RJ-09 safeguards.
8. Export filtered data.
9. Ask the assistant an internal question (e.g. "Why is Kotla Sher Muhammad a priority?" or the same in Urdu), then an external one (e.g. WHO maternal mortality or NDMA alerts) to show the Source / Retrieved / Data status framing. Configure Grok only to enable the LLM fallback for unmatched questions.
10. Close by confirming that an NGO officer makes the final allocation decision.

## 12. Limitations and roadmap

Current limitations: limited supplied data, incomplete GPS and input fields, no RBAC enforcement (roles are designed but not enforced on routes), no field data entry, no production persistence beyond SQLite, and optional AI requiring an external key.

Roadmap: verify source IDs and fields; collect field-survey data; add RBAC middleware and audit trail; migrate to PostgreSQL; test with NGO workflows; then introduce a monitored explanation layer and multilingual field experience.
