# Emergency QR and Offline Resilience

## Built components

- Public Urdu-first `/scan?v=<village-id>&n=<village-name>` reporting page with English toggle.
- Four large report choices: pregnancy, child, accident, other.
- Mandatory safety wording: this is not an ambulance service; life-threatening situations must call 1122 first.
- Optional phone number and a hidden honeypot field.
- Browser queue with the original client timestamp, 30-second retry, online-event retry, and pre-filled SMS fallback.
- Service worker caches the scanner after its first successful visit.
- Server-only `/api/emergency/report` route and `/api/sms` webhook.
- SQL migration with RLS, a security-definer reporting RPC with a five-minute village cooldown, heartbeat RPC, and a `village_status` view for silent-village detection.
- Authenticated NGO-only Emergency QR dashboard page showing public scan links and, after Supabase configuration, silent/recent signal statuses.

## Deployment order

1. Create or identify the existing Supabase `public.villages` table, ensuring `id` is a text key compatible with the supplied source IDs.
2. Apply `supabase/emergency_schema.sql` in the Supabase SQL editor. Review it first if your `villages` table uses different column names or an integer/UUID primary key.
3. Add the values from `.env.example` to Vercel environment variables. `SUPABASE_SERVICE_KEY` and `SMS_WEBHOOK_SECRET` are server-only secrets.
4. Configure Supabase Auth email/password and its allowed redirect settings.
5. Deploy. Use `https://your-domain/scan?v=MZ-01&n=Bet%20Isa` as a QR target after verifying the actual village ID exists in Supabase.
6. Configure the SMS provider to call `POST /api/sms` with header `x-sms-webhook-secret: <SMS_WEBHOOK_SECRET>` and JSON `{ "message": "EMERGENCY MZ-01 pregnancy [29.6,70.7]" }`.

## Security model

- `emergency_reports` has RLS enabled with no anonymous read/update/delete policy.
- Reports are accepted through a narrowly scoped RPC that enforces allowed categories and server-time cooldown. The public scanner never receives Supabase keys.
- The SMS endpoint requires the shared secret and uses the Supabase service key only on the server.
- Dashboard emergency-status access is protected by the existing authenticated dashboard gate.

## Known configuration-dependent items

The SQL migration, Supabase Auth flow, report persistence, SMS callback, and silent-village status require a real Supabase project and Vercel environment variables. They cannot be verified locally without those credentials.
