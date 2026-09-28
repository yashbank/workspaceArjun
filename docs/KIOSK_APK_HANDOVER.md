# Kiosk Android App — Build Handover

**Audience: an AI coding agent or developer building the Android kiosk app.** This document is
the complete brief — repo access, what already exists, what to build, the exact API contract,
and every env/config value needed. No other document or conversation history is assumed.

## 1. What this app is

A dedicated Android app for a wall-mounted or gate tablet at **Bhaskar Paper Products**, a paper
factory. Workers tap in/out at shift start/end by scanning or typing their badge code. This
replaces nothing existing — it is a **new client** for a device pairing + punch protocol that
already exists, fully built and tested, on the server. Nobody signs into this app with a
username/password; a tablet is paired once by an Admin from the web portal, then acts as itself
using a device token.

There is no separate backend to build. The Android app is a client of the existing Next.js app's
API routes.

## 2. Repo access

- Give the build agent read access to this repository at its current `main` branch.
- Relevant paths (everything needed is under these):
  - `src/server/mis/kiosk-device.ts` — the full device lifecycle: pairing, token issuance,
    revocation, the employee-roster pull. Read this file's own docstrings first; they explain
    every security decision (secrets hashed not stored, one-time token collection, etc.).
  - `src/server/mis/attendance-punch.ts` — `ingestDevicePunch`, the punch-processing logic,
    including badge lookup and the exact `PunchPayload` shape.
  - `src/lib/mis/offline/idempotency.ts` — the queued-write envelope every punch is wrapped in,
    and why (offline queueing, replay safety).
  - `src/app/api/mis/kiosk/*/route.ts` — the four thin HTTP handlers (§4 below reproduces their
    contract, but these are the source of truth if anything drifts).
  - `src/app/api/mis/kiosk/kiosk-routes.test.ts`, `src/server/mis/kiosk-device.test.ts`,
    `src/app/api/mis/kiosk/punch/route.test.ts` — exact request/response examples for every case,
    including every error code.
  - `docs/DEVELOPMENT_GUIDE.md` and `docs/DECISIONS.md` — search for **D18** (pairing design),
    **D19** (what a tablet may know / staleness), **D15** (whose clock decides punch time),
    **D22** (factory-day boundary). `docs/MIS_UI_SPEC.md` — search **K10** (pairing flow design)
    and **K12** (device health self-report) for the intended on-screen flow and copy tone.

## 3. What already exists vs. what to build

**Already built and tested (server side, do not re-design):**
- Tablet self-registration → pairing code → Admin approval in the web portal → one-time token
  collection.
- Token-authenticated employee roster pull (name, badge code, today's shift — nothing else;
  no wages, no personal data beyond a name).
- Token-authenticated punch intake with offline-safe idempotency (replaying the same punch twice
  is a no-op, not a duplicate).
- Device health reporting (battery, app version, queued-punch count) surfaced on the web portal's
  own kiosk-health card.
- Revocation (a retired tablet's queued punches still land, but it can no longer pull).

**To build (this app):**
1. **First-run pairing screen.** Call `POST /api/mis/kiosk/enrol`, display the returned code
   (formatted `XXXXX-XX`) large enough to read from arm's length, and poll
   `POST /api/mis/kiosk/enrol/claim` every few seconds until it returns `ACTIVE` (token issued),
   `EXPIRED` (show a retry button — request a new code), or `REVOKED`.
2. **Secure local token storage.** Once claimed, store the token in the Android Keystore /
   `EncryptedSharedPreferences`. It is bearer-authenticated (`Authorization: Bearer <token>`) and
   must never be logged, screenshotted, or shown in any UI.
3. **Roster sync.** Periodically (and on demand) call `POST /api/mis/kiosk/pull` and cache the
   result locally so punches work with no network.
4. **Punch screen.** Badge scan (camera/barcode) or manual code entry → match against the cached
   roster’s `badgeCode` → submit the punch. If offline, queue it locally (same envelope shape,
   §4.4) and flush the queue on reconnect, oldest first, one at a time. Never batch-merge queued
   punches into one call.
5. **Health ping.** Attach a small health object (`appVersion`, `batteryPercent`, `isCharging`,
   `queuedPunches`) to normal pull/punch calls — no separate endpoint exists for this; see
   `parseHealthReport` in `kiosk-device.ts` for the exact accepted shape and bounds.
6. **Offline queue UI.** Show the operator how many punches are queued and unsent (K12's
   intent) — this is a factory floor; a tablet loses wifi routinely and must never look "stuck"
   without explanation.

## 4. API contract

Base URL: see §5. All requests are `POST`, JSON body, and responses set `Cache-Control: no-store`.

### 4.1 `POST /api/mis/kiosk/enrol` — request pairing (no auth; tablet has nothing yet)
Request body: `{ "hardwareLabel"?: string }` (optional, e.g. "Samsung Tab A9 — Gate 1", max 80 chars).

Response `201`:
```json
{ "deviceId": "uuid", "code": "4K7P-92", "pollSecret": "mks_...", "expiresAt": "2026-...Z" }
```
Store `deviceId` and `pollSecret` locally — they're needed for the next call. The code is shown
to the person pairing the tablet; it expires in 10 minutes (`PAIRING_CODE_TTL_MS`).

### 4.2 `POST /api/mis/kiosk/enrol/claim` — collect the token (no auth; proves itself with `pollSecret`)
Request body: `{ "deviceId": "uuid", "pollSecret": "mks_..." }`

Response `200`, one of:
```json
{ "status": "PENDING", "expiresAt": "..." }
{ "status": "EXPIRED" }
{ "status": "REVOKED" }
{ "status": "ALREADY_CLAIMED" }
{ "status": "ACTIVE", "token": "mkd_...", "name": "Gate-01" }
```
Poll every 3–5s while `PENDING`. On `ACTIVE`, store `token` — this is the ONLY time the server
ever returns it. On `EXPIRED`, restart at §4.1.

### 4.3 `POST /api/mis/kiosk/pull` — get the employee roster (`Authorization: Bearer <token>`)
Request body: `{ "health"?: { appVersion, batteryPercent, isCharging, queuedPunches } }` (all optional).

Response `200`:
```json
{
  "device": { "id": "uuid", "name": "Gate-01" },
  "pulledAt": "2026-...Z",
  "employees": [
    { "id": "uuid", "name": "Amod Sah", "badgeCode": "EMP0061",
      "shift": { "id": "uuid", "name": "Day", "startTime": "08:00", "endTime": "17:00" } | null }
  ]
}
```
This is factory-wide (every active employee), not filtered — match by `badgeCode` on scan.

### 4.4 `POST /api/mis/kiosk/punch` — submit one punch (`Authorization: Bearer <token>`)
Request body (the queued-write envelope, `src/lib/mis/offline/idempotency.ts`):
```json
{
  "key": "client-generated-uuid",
  "kind": "attendance.punch_in",
  "payload": { "badgeCode": "EMP0061", "shiftId": "uuid-optional" },
  "clientRecordedAt": "2026-09-28T06:04:00.000Z",
  "deviceId": "uuid"
}
```
- `kind` is `"attendance.punch_in"` or `"attendance.punch_out"` — the app decides which (e.g. a
  toggle showing the person's current state from the last pull/punch), the server does not infer it.
- `key` MUST be a fresh UUID generated once per punch, client-side, and **reused on every retry of
  that same punch** — this is what makes offline replay safe. A new key = a new punch.
- `clientRecordedAt` is the tablet's own clock at the moment of the tap (D15) — never adjust it
  when queued/retried later; the server trusts the device's stated time, not its own receipt time.

Response `200`, one of:
```json
{ "outcome": "APPLIED", "result": { ... } }
{ "outcome": "DUPLICATE", "result": { ... } }
{ "outcome": "PARKED", "reason": "...", "detail": "human-readable, show this" }
{ "outcome": "REJECTED", "reason": "BADGE_UNKNOWN", "detail": "Badge not recognised. Scanned 06:47 · code BPP-8841." }
```
Response `503`: `{ "outcome": "RETRY", "detail": "..." }` — back off and retry later; keep the
punch queued.

### 4.5 Errors (all four routes)
```json
{ "error": "CODE_INVALID" | "NAME_TAKEN" | "TOO_MANY_PENDING" | "UNAUTHORIZED" | "NOT_FOUND", "message": "..." }
{ "error": "REVOKED", "wipe": true }   // tablet must wipe its local token + cached roster
{ "error": "SERVER_ERROR" }            // unexpected — retry with backoff, never show detail
```

## 5. Environment / configuration

The Android app itself needs exactly **one** configuration value — there is no client-side API
key or secret to bake in; the pairing flow (§4.1–4.2) is how a tablet gets its own credential.

| Key | Value | Notes |
|---|---|---|
| `API_BASE_URL` | `https://workspace-arjun.vercel.app` | Production. Build as a `BuildConfig` field so a debug build can point at a different URL (e.g. a preview deployment) without a code change. |

Do **not** put any of the following into the Android app — they belong to the backend only and
must never leave the server: `SUPABASE_SERVICE_ROLE_KEY`, `RUNTIME_DATABASE_URL`/`DATABASE_URL`/
`DIRECT_URL`, `CRON_SECRET`, `MIS_ENABLED_ACCOUNTS`. If whoever is building this app also needs to
run or redeploy the backend, `.env.example` in the repo root of `app/` lists every backend
variable with a description of where to get it.

## 6. Non-negotiables

- **No employee money/wage data reaches this app, ever** (matches the rest of this codebase's
  money-isolation rule, D6/D24) — the pull payload already only exposes `id`, `name`,
  `badgeCode`, `shift`; do not add fields to it without checking `kiosk-device.ts`'s own
  `PULL_EMPLOYEE_KEYS` allow-list comment first.
- **The device token is the only credential.** Never prompt for a person's login on this app.
- **A revoked tablet must wipe** its stored token and cached roster the moment it sees
  `{"error":"REVOKED","wipe":true}` on any call.
- **One punch = one idempotency key**, generated once, reused on every retry — this is the whole
  safety net against a flaky gate connection double-counting a tap.

## 7. Definition of done

- Pairing flow works end-to-end against production: request → code shown → an Admin approves it
  from the web portal's own Settings → Devices screen → tablet collects its token automatically.
- A punch made while offline is queued, visibly shown as queued, and flushes correctly on
  reconnect without duplicating.
- A revoked device correctly wipes and returns to the pairing screen.
- Tested against at least one real employee badge code from the current roster.
