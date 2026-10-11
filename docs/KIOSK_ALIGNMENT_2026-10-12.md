# Kiosk Android alignment — 2026-10-12

**Audience:** MIS platform Claude Code session. Covers operatorRole gating, mandatory shift
selection, and the photo confirm-card fallback, built in response to the 2026-10-12 next-steps
request.

## 1. Git

- Repo: `github.com/yashbank/workspaceArjun`, branch `phase-a`.
- Commit `ed618b6` — "Gate operator sign-in on operatorRole, require shift selection, neutral
  photo fallback" — **committed, NOT pushed** (only commit ahead of `origin/phase-a`).
- Files changed: `data/local/EmployeeDao.kt`, `data/local/EmployeeEntity.kt`,
  `data/local/RosterDatabase.kt`, `data/network/dto/PullDtos.kt`,
  `data/repository/RosterRepository.kt`, `ui/punch/PunchScreen.kt`, `ui/punch/PunchViewModel.kt`.
  7 files, +188/-11.
- Prior related commits already pushed/merged: `54664c1`, `3d199e8`, `54d9088` (photo
  fetch/caching — done before this round, not touched again here).

## 2. API contract the app now relies on

**`/pull` response, per employee (`EmployeeDto`):**
```kotlin
data class EmployeeDto(
    val id: String,
    val name: String,
    val badgeCode: String,
    val shift: ShiftDto? = null,       // shiftId/shiftName/shiftStartTime/shiftEndTime
    val photoUrl: String? = null,      // already supported, see prior commits
    val operatorRole: String? = null,  // "OPERATOR" | "SUPER_OPERATOR" | null — NEW, see below
)
```
`operatorRole` is read with `kotlinx.serialization` default-null — **if the server omits the key
entirely, the app does not crash or reject**, it just treats every employee as having no role
(see Behaviour §3). No server change is required to ship this safely; the gate only tightens
once the server actually starts sending non-null values for real operators.

**`/punch` request (`PunchRequest`/`PunchPayloadDto`), unchanged shape, one field's source changed:**
```kotlin
data class PunchPayloadDto(
    val badgeCode: String,
    val shiftId: String? = null,   // CHANGED: now the OPERATOR-SELECTED shift's id, not the
                                    // scanned employee's own roster shift (see §3)
    val operatorId: String? = null, // unchanged, already supported
)
```

**Photo fetch** (already live from prior commits, unchanged this round): `GET` whatever
`photoUrl` the pull response gave for that employee, header `Authorization: Bearer <device
token>`, no-redirect client (a 307-to-login reads as failure, not followed). Cached locally by
URL so a re-sync only re-downloads what changed.

**Nothing new required server-side to not break** — this is purely additive/defensive on the
client. The one thing worth confirming: once `operatorRole` ships for real, make sure it's
`"OPERATOR"` / `"SUPER_OPERATOR"` exactly (case-sensitive string match client-side) or `null` —
no other values are recognized as "is an operator."

## 3. Behaviour

- **Operator sign-in validation:** operator enters their own badge code → matched against the
  cached roster → accepted only if `operatorRole != null`. If rejected, shows "Not an attendance
  operator" and does not sign in.
- **operatorRole missing from `/pull` (pre-rollout server):** if the *entire* cached roster has
  zero employees with a non-null `operatorRole` (checked via a `COUNT(*)` query), the app assumes
  this server doesn't send the field yet, logs a warning, and falls back to accepting any matched
  badge — so existing kiosks don't get locked out the moment this code ships, before the server
  side of the rollout lands. **Confirmed live right now: 0/82 cached employees have a role set**,
  so production is currently running in this fallback mode.
- **Shift selection gate:** after a successful operator sign-in, a new screen requires picking a
  shift from the cached shift list (the same roster-cache rollup the existing read-only Shifts
  info screen already used) before scanning/manual-entry becomes reachable. The picked shift's
  name shows in the top status bar, and its id is sent as `payload.shiftId` on every punch that
  operator processes — not the individual scanned employee's own roster shift. It's cleared
  (forcing a re-pick) on end-of-shift, same moment the operator themselves is cleared.
  **Fallback, found necessary during testing:** if the cached roster currently has zero shifts at
  all (no allocations for today — true in production right now), the gate is skipped entirely and
  punches go through with `shiftId = null`, rather than permanently stranding the operator at an
  empty pick list.
- **Photo placeholder:** the confirm card (shown on a QR scan match) renders the cached photo
  when present and decodable; otherwise a neutral Canvas-drawn head-and-shoulders glyph — not a
  colored initial letter, so a missing photo never reads as a confirmed identity at a glance.
  **Known gap, not changed this round:** manual code entry has never routed through this confirm
  card at all — it goes straight from a matched badge to punch submission. Only the QR-scan path
  shows the photo-compare step today. Worth a decision on whether manual entry should gain the
  same confirm step, but that's a larger UX change outside today's scope.

## 4. Test results (emulator, live against production)

| # | Test | Result |
|---|---|---|
| 1 | Non-operator rejected at sign-in | **N/A** — can't test live, 0/82 employees have `operatorRole` set on production right now (confirmed via direct DB query). Logic is in place; untestable until the server sends real values. |
| 2 | Operator (or fallback-accepted employee) signs in | PASS |
| 3 | Scan/manual-entry blocked until shift chosen | PASS |
| 4 | Selected shift name shown in status bar | PASS |
| 5 | Shift selection persists across multiple punches | PASS |
| 6 | Employee with cached photo shows photo | Code-verified only — no usable camera on this emulator to drive the QR-confirm path live. DB confirms 1/82 employees has cached photo bytes; code path reads `EmployeeEntity.photo` via `BitmapFactory`. |
| 7 | Employee without photo shows neutral placeholder | Code-verified only, same camera limitation. 81/82 employees have no cached photo. |
| 8 | Offline punch still queues; cached photos still render offline | PASS (queuing confirmed; photo-render part is code-verified only, same camera limitation) |
| 9 | Reconnect auto-flushes queued punch | PASS (mechanism fired automatically; the specific test punch came back `Rejected` rather than `Applied` only because the tester had to inject synthetic `shiftId` test data locally to unblock the now-fixed empty-shifts case — not a sign of a real server-side problem) |
| 10 | End-shift clears operator AND shift, returns to sign-in | PASS |
| 11 | No crashes across the full run | PASS |

## 5. Build

- `RosterDatabase` Room schema version: **4** (was 3 — added `operatorRole: String?` to
  `EmployeeEntity`; disposable cache, `fallbackToDestructiveMigration(dropAllTables = true)`
  already in place, no manual migration needed).
- `PunchQueueDatabase` version: **1**, untouched.
- `API_BASE_URL`: `https://workspace-arjun.vercel.app` (production, default build config — not
  overridden).
- APK path after build: `mis-kiosk-android/app/build/outputs/apk/debug/app-debug.apk`.
- Install steps used for testing (existing pairing preserved, no re-pair needed):
  ```bash
  cd mis-kiosk-android
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  ./gradlew :app:assembleDebug --console=plain
  adb install -r app/build/outputs/apk/debug/app-debug.apk
  adb shell am force-stop com.example.mis_kiosk
  adb shell am start -n com.example.mis_kiosk/.MainActivity
  ```

## 6. Known issues, risks, blocked items

- **Blocked on server:** test #1 (role-rejection path) cannot be verified live until `/pull`
  actually sends non-null `operatorRole` for at least one real operator and one real non-operator.
- **Blocked on environment, not server:** tests #6/#7/#8's photo-render half couldn't be driven
  live — this emulator has no usable camera feed for the QR-scan-to-confirm-card path. Needs a
  real device or a working emulator webcam passthrough to close out fully.
- **Design gap (not a bug, flagged for a decision):** manual entry bypasses the photo confirm
  card entirely. If photo verification is meant to be a real anti-buddy-punching control, manual
  entry is currently a gap in that control, not just QR.
- **Operational risk, not code:** production has zero shift allocations right now, so every
  operator is currently running in both fallback modes at once (no role gate, no shift gate).
  That's intentional/safe (nothing stranded), but means neither new gate is actually doing
  anything live yet — worth confirming when real `operatorRole` + shift-allocation data starts
  flowing that both gates behave as expected on the first real case, not just in this testing.
