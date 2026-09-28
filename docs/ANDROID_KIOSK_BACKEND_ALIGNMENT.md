# Android Kiosk ↔ Backend Alignment Brief

**Audience:** a Claude Code session working in *this* repo (`workspace-arjun`), asked to make
the `/api/mis/kiosk/*` endpoints faster, more reliable, and a perfect match for the Android
kiosk client. This doc is the Android side's contract and behavior, written by the session that
built the Android app, so you don't have to reverse-engineer it from the APK.

**Goal:** zero-failure, fast, continuously-synced punches between the kiosk tablets and this
backend. Read this fully before changing any `/api/mis/kiosk/*` route.

---

## 1. Where the Android app lives

`mis-kiosk-android/` — a subfolder of *this same repo*, on branch `phase-a`. Kotlin + Jetpack
Compose. Source of truth for everything below is:
`mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/`

## 2. The four endpoints it calls, exact contract

All bodies are JSON, `Content-Type: application/json`. Bearer token (device token from
`/claim`) is sent as `Authorization: Bearer <token>` on `/pull` and `/punch` only.

### POST /api/mis/kiosk/enrol
No auth. Request: `{ hardwareLabel?: string }`.
Response: `{ deviceId, code, pollSecret, expiresAt }`.

### POST /api/mis/kiosk/enrol/claim
No auth (proves itself with `pollSecret`). Request: `{ deviceId, pollSecret }`.
Response: `{ status, expiresAt?, token?, name? }` — `status` drives a state machine on the
Android side (pending / claimed+token / expired / revoked, etc.).

### POST /api/mis/kiosk/pull — Bearer token
**Request body is the health report directly, NOT wrapped in `{"health": {...}}`.** This was a
real bug we hit and fixed on the Android side — `pullForDevice` reads
`parseHealthReport(body)` on the raw body, so:
```json
{ "appVersion": "1.0", "batteryPercent": 87, "isCharging": false, "queuedPunches": 0 }
```
Response:
```json
{
  "device": { "id": "...", "name": "..." },
  "pulledAt": "2026-...",
  "employees": [
    { "id": "...", "name": "...", "badgeCode": "EMP0061", "shift": { "id","name","startTime","endTime" } | null }
  ]
}
```
Android replaces its entire local employee cache with this list every call (delete-all +
insert-all in one transaction). **If this endpoint ever returns a partial/truncated list by
mistake, every employee missing from it becomes unrecognized on the tablet until the next
successful pull.**

### POST /api/mis/kiosk/punch — Bearer token
Request:
```json
{
  "key": "<fresh UUID per logical punch>",
  "kind": "attendance.punch_in" | "attendance.punch_out",
  "payload": { "badgeCode": "EMP0061", "shiftId": "..." | null },
  "clientRecordedAt": "<ISO8601, captured once, resent unchanged on retry>",
  "health": { "appVersion", "batteryPercent", "isCharging", "queuedPunches" }
}
```
Note `health` IS nested under `"health"` here — different from `/pull`. This is intentional,
matches `idempotency.ts`, don't "fix" it into consistency without checking both call sites.

Response (`outcome` is the field to branch on, not HTTP status):
```json
{ "outcome": "APPLIED" | "DUPLICATE" | "PARKED" | "REJECTED" | "RETRY",
  "reason": "...", "detail": "...",
  "result": { "punchId","employeeId","employeeName","direction","punchedAt","workDate","dayRebuilt","dayHeld" } }
```
- `APPLIED` / `DUPLICATE` → 200, `result` present, Android marks the punch done and removes it
  from its local queue.
- `PARKED` → 200, stays in a human-visible "needs attention" list on the tablet, **never
  auto-retried** with the same key.
- `REJECTED` → 200, same key is now **permanently poisoned** — Android will never resend it. A
  legitimate resubmission needs a brand-new `key`.
- `RETRY` → **HTTP 503**, same JSON shape. Android treats this identically to a raw network
  error: keep the same `key`/`kind`/`clientRecordedAt`, retry later. If you ever want to signal
  "try again soon" from the server, use 503 + `RETRY`, not a different HTTP code — the Android
  client's success-code allowlist is hardcoded to `{200, 503}` for this one route.

Any other outcome string, or a 200 with no `result`, is treated as `RETRY` on the Android side
(fails safe — never invented as `APPLIED`).

## 3. Idempotency rules the Android client actually follows

- One fresh UUID `key` per logical punch attempt (one badge scan/manual entry = one key).
- The **same** key is resent only when retrying that exact still-pending attempt (network
  error or `RETRY`/503) — never for a new scan, even of the same employee/direction.
- Once a key comes back `REJECTED`, it is retired forever; Android does not touch it again.
- `clientRecordedAt` is captured once at the moment of the original attempt and resent
  unchanged on every retry of that key — **the server should treat this as the true punch
  time**, not `now()` at receipt time, especially for a punch that was queued offline for a
  while before it finally reaches you.

## 4. Direction (IN/OUT) — client-side only, no server "current status"

`/pull` has no "is this person currently in" field. Android tracks last direction itself in a
local table and toggles. **If the server's own APPLIED/DUPLICATE logic ever disagrees with what
the client believes the last direction was** (e.g. two devices punch the same person, or a
manual web-portal edit changes someone's status), there's no reconciliation call today — the
tablet's next `/pull` doesn't correct this. Worth considering exposing `lastDirection` per
employee on `/pull` here if this bites in practice.

## 5. Offline queue & retry timing (Android side, already built)

- Every punch is written to a local Room queue *before* the first network attempt.
- Queue drains oldest-first, strictly one at a time; a `RETRY`/network error stops the whole
  drain (assumes a transient outage affects everything queued, not just one entry).
- Triggers: app foreground start, a network-regained callback, WorkManager fallback (survives
  process death), **and now a 60-second foreground timer** (new — see §7).
- Live-attempt HTTP timeout: **12 seconds** (connect + read). This was tuned empirically against
  this deployment — see §6, don't copy the "8s" number from other kiosk implementations without
  re-measuring against production.
- A `RetryPrompt` left on screen auto-replays every 30 seconds.

## 6. ⚠️ Measured backend latency — cold starts are a real problem

While testing live against `https://workspace-arjun.vercel.app` today, `/punch` calls measured:
**5.5s, 7.7s, 8.1s, 8.2s, 4.3s** round-trip. These look like Vercel serverless cold starts, not
network latency (emulator network was otherwise fine). An 8-second client timeout — which is
what some other kiosk implementations use — would have **failed roughly half of these real
calls**, forcing them needlessly into the offline queue.

**This is the single highest-value thing to fix for "make it faster and zero-failure":**
- Check whether `/api/mis/kiosk/punch` and `/pull` are on a route/runtime that suffers cold
  starts (serverless function scale-to-zero) and whether keeping them warm, or moving them to
  an always-on runtime, is viable.
- If cold starts are unavoidable, the Android timeout can't safely go below ~12s without
  backend changes — lowering it further will just push more real successes into "queued,
  will retry," which defeats "continuously syncing."
- A genuinely fast (<1s) `/punch` response is what would let the Android timeout — and the
  perceived speed at the turnstile — actually come down.

## 7. What changed on the Android side just now (context for why you're being asked to help)

- Roster re-pull every 60s while the app is foreground (kiosk tablets are foreground for a
  whole shift) — previously only pulled at launch + manual refresh.
- Queue-flush nudge on that same 60s timer, so a punch stuck behind a non-network failure
  (e.g. a transient 5xx that isn't a clean `RETRY`) doesn't wait for a network-state change to
  get another attempt.
- Timeout raised 15s → (briefly 8s, found too aggressive by live testing) → **12s**.
- 30s on-screen auto-replay for a stuck retry prompt.

None of this required backend changes — it's all client-side pacing. **The backend-side lever
that would help most is §6: cold-start latency.**

## 8. ⚠️ Open question for you to verify: QR badge payload

The Android scanner (CameraX + ML Kit, QR-only) takes whatever raw string the camera decodes
and looks it up as an exact match against the local `badgeCode` cache, falling back to an
uppercase match. It expects **the QR to encode the plain `badgeCode` string** — e.g. `EMP0061`
— nothing else (not JSON, not a URL, not the employee's UUID).

The user testing this just reported QR scans aren't matching. **Before assuming it's a camera
bug, check what this website actually encodes into an employee's badge QR** — search this repo
for wherever a QR code is rendered for an employee (badge print page, employee detail view,
etc.) and confirm the encoded payload is the literal `badgeCode` column value, not
`employee.id`, not a JSON blob, not a deep link. If it's anything other than the raw
`badgeCode` string, that fully explains "can't scan" and is a one-line fix on whichever side is
wrong — align it to `badgeCode`, since that's also the same value the manual-entry fallback and
`/punch`'s `payload.badgeCode` field already use everywhere else.

## 9. What "done" looks like

- `/punch` typically responds in well under 2s (not 5-8s), so the Android timeout can safely
  come down and punches feel instant at the tablet.
- Employee QR badges encode plain `badgeCode`, scan-to-match on the first try.
- No `RETRY`/503 under normal load — only under genuine outages.
- Roster changes (new hire, shift edit) show up on an already-running tablet within ~60s with
  no restart.
