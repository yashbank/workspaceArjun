# R3-AND: Android kiosk queue safety and factory day

Backlog: B65-B71. Branch `fix/r3-and`. **Wave 1** (it consumes only *optional* new server fields, so it is safe before R3-ATT deploys). Model: Sonnet. Schema (Postgres): **N**. Room migrations: queue DB v2→v3 and roster DB v5→v6, **non-destructive**. Estimate: ~120 agent-min.
Read `docs/KIOSK_APK_HANDOVER.md`, `docs/KIOSK_ALIGNMENT_2026-10-12.md` (Round 3/4) and `docs/specs/C7-android.md` (build/verify commands, never fake a build).

## Owned files (under `mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/` = `K/`)
- `K/data/repository/PunchRepository.kt`, `DeviceWipe.kt`, `NextKind.kt`, `RosterRepository.kt` (pull DTO consumption only)
- `K/data/time/FactoryDay.kt`, NEW `K/data/time/WorkDate.kt`
- `K/data/local/PunchQueueEntity.kt`, `PunchQueueDao.kt`, `PunchQueueDatabase.kt`, `PunchStateEntity.kt`, `PunchStateDao.kt`, `RosterDatabase.kt`, `RosterPreferences.kt`
- `K/data/network/dto/PunchDtos.kt` (+ pull DTO file if separate)
- `K/data/work/PunchFlushWorker.kt`, `PunchFlushScheduler.kt`
- `K/ui/punch/PunchScreen.kt`, `PunchUiState.kt`, `PunchViewModel.kt`, `K/ui/health/**`
- `mis-kiosk-android/app/schemas/**` (new, exported Room schemas), `mis-kiosk-android/app/build.gradle*` (schema location + `room-testing` dependency only)
- tests under `mis-kiosk-android/app/src/test/**` and `src/androidTest/**`
- `docs/KIOSK_ALIGNMENT_2026-10-12.md` (append a "Round 5 (R3)" section)

## Server contract you consume (R3-ATT adds it; treat every field as optional)
- Pull JSON: `factoryTimezone: String?` (IANA). Missing → keep today's behaviour (device zone).
- Punch result JSON: `workDate: String?` (`YYYY-MM-DD`), `note: String?` (`ALREADY_IN` | `NO_OPEN_IN`).
- Oversize body → HTTP 413 `{error:"PAYLOAD_TOO_LARGE"}`.

## Items and acceptance (unit tests unless stated; `:app:testDebugUnitTest` must pass)
1. **B65 drain before wipe.** In `DeviceWipe.wipeAll()`, **before** clearing credentials: if the queue has PENDING rows, call `PunchRepository.flushQueue()` once with the current token (the server accepts revoked-device punches), with a 20 s overall timeout. Then wipe. Rows still PENDING stay in the queue (as in C7). The revoked/unpaired screen shows "N punches could not be sent from this tablet. Re-pair to send them." Tests (fake API):
   - 3 PENDING, the API accepts → 0 left, then wiped.
   - The API fails → 3 left and the wipe still completes.
   - Order of calls: flush before credential clear.
2. **B66 no head-of-line blocking.**
   - Queue DB v2→v3 `Migration` adding `attempts INTEGER NOT NULL DEFAULT 0` and `lastError TEXT`. New status `STUCK` in `PunchQueueStatus`.
   - HTTP 401 → stop the flush, set `RosterPreferences.needsRepair = true`, and show the banner "This tablet must be paired again (HTTP 401)". 401 does not count toward attempts.
   - 400/404/413 → mark that row STUCK with `lastError`, continue to the next row.
   - 5xx/IO → `attempts += 1`. At `attempts >= 10` → STUCK. Otherwise stop this flush (RetryNeeded).
   - The Health screen lists STUCK rows (name, time, error) with a "Retry" button that resets attempts and sets PENDING.
   - Tests:
     - Queue [A→400, B→200] → A STUCK, B applied.
     - [A→500 ×10] → A STUCK after the 10th flush.
     - [A→401] → nothing STUCK, `needsRepair` true.
     - Migration test v2→v3 (`MigrationTestHelper`) keeps existing rows with `attempts=0`.
3. **B67** on APPLIED, `punchStateDao.record(...)` uses `Instant.parse(clientRecordedAt).toEpochMilli()`, not the flush time. Test: a punch recorded at 23:00 and flushed at 07:00 stores 23:00.
4. **B68 factory day.**
   - Roster DB v5→v6 `Migration` adding `PunchStateEntity.lastWorkDate TEXT` (nullable).
   - `FactoryDay` takes the zone from `RosterPreferences.factoryTimezone` (saved from the pull; default `ZoneId.systemDefault()` when absent).
   - NEW `WorkDate.kt`: a pure Kotlin port of the server's `workDateFor` (`src/lib/mis/attendance-day.ts`): given the punch instant, the factory zone and the active shift windows, return the work date. Copy the server's test vectors into a Kotlin test, citing the server test file and names in comments.
   - `NextKind`: if the last local state is IN **and** (`lastWorkDate` is known and < the current work date computed for *now* with the same shift) **or** (now − lastPunch > 14 h), default to IN with the existing "assumed missed OUT" hint. Otherwise OUT. The toggle stays (C7).
   - Store `workDate` from the punch result into `lastWorkDate` (fallback: the local `WorkDate` result).
   - Tests:
     - Night shift 22:00-06:00, IN at 22:10 IST, now 05:30 IST next day → OUT (not stale).
     - Day shift IN at 09:00 yesterday, now 09:00 → IN + hint.
     - Tablet zone UTC with `factoryTimezone=Asia/Kolkata` gives the same answers.
     - Migration test v5→v6 keeps `punch_state` rows.
5. **B69** `PunchFlushWorker.doWork()` returns `Result.retry()` when PENDING rows remain after the flush and the stop reason was RetryNeeded (not 401). The enqueue uses exponential backoff (30 s start). Test with `TestListenableWorkerBuilder`.
6. **B70** both DBs `exportSchema = true`, with the schema location in Gradle. Commit the generated JSON for queue v1-v3 and roster v3-v6 (generate the old versions by checking out the old entity definitions only if feasible; otherwise commit current-version schemas and note it). `MigrationTestHelper` tests for every hop you can reconstruct. Keep `fallbackToDestructiveMigration` only below v3 and add a comment: "Any roster version bump needs a Migration + test."
7. **B71** the confirm/result card shows `note` text: ALREADY_IN → "Already clocked IN (no change)". NO_OPEN_IN → "OUT recorded without an IN today". 413 → STUCK with "Punch too large" (via item 2). Compose UI test or ViewModel test.

## Build and verify
`./gradlew :app:compileDebugKotlin --rerun-tasks :app:testDebugUnitTest --console=plain`. With an emulator, also `:app:connectedDebugAndroidTest` for the migration tests and `assembleDebug` + install + one scan smoke. Report anything not run as **unverified**.

## Do not touch
Web code (`src/`), idempotency-key generation, operator/shift gates beyond item 4, existing migrations 3→4→5 and queue 1→2 (add new ones only), the encrypted credential store.

## Risk notes
Two Room migrations on tablets holding queued punches: a crash at launch loses the gate. Migration tests are mandatory, and must run before any APK leaves the machine. B65 adds a network call inside the wipe: it must never block the wipe beyond the 20 s timeout.
