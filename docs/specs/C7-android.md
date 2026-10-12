# C7 — Android kiosk fixes (tester #51-#61 + D8)

Branch `fix/c7-android`. Project: `mis-kiosk-android/` (Kotlin, Compose, Room). Read `docs/KIOSK_APK_HANDOVER.md` and `docs/KIOSK_ALIGNMENT_2026-10-12.md` (Round 3 section: Room migrations 3->4->5 and queue v1->v2 already exist — never use destructive migration for punch_state or the punch queue). Paths below are under `app/src/main/java/com/example/mis_kiosk/` (`K/`).

Build/verify: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"`; `cd mis-kiosk-android && ./gradlew :app:compileDebugKotlin --rerun-tasks :app:testDebugUnitTest --console=plain`; with an emulator (`adb devices`): `:app:assembleDebug`, `adb install -r`, smoke test. Never claim a build you did not see succeed.

## Commits (one commit per group; keep each small)
**A — #55 + #51 + #53**
- #51 `K/ui/health/DeviceHealthViewModel.kt` `retrySyncNow()` must call `RosterRepository.sync()` (then refresh the cache-age state) in addition to scheduling the punch flush; show success/failure.
- #55 one shared `wipeAll()` (credentials, employees, `active_shifts`, `punch_state`, `RosterPreferences`, operator + shift session) invoked from BOTH the sync REVOKED path (`RosterRepository`) and the punch path when the error carries `wipe == true` (`PunchRepository`, today returns RetryNeeded). Keep the offline punch queue rows (HANDOVER: a retired tablet's queued punches may still land) but stop scheduling the flush worker once credentials are gone.
- #53 `K/data/local/PunchStateDao.kt` count query gets `AND lastPunchedAtMillis >= :factoryDayStart`; compute the factory-day start (06:00 local) in ONE shared helper (reused by B); relabel to "IN at this gate today"; re-evaluate at the day boundary/minute tick.
**B — #52 (D8) + #59**
- `PunchRepository.nextKindFor`: keep the queued-kind check first; if the last local state is IN and the last punch is before the current factory-day start OR older than 14 h, default to IN and show a hint on the confirm card ("Last punch: IN yesterday 14:05 — assumed a missed OUT"). The confirm card ALWAYS shows a small "Change to OUT/IN" toggle (the other gate or HR may have changed state); the chosen direction is what is sent. Never block the person.
- #59 when a re-sync drops the selected shift, do not silently bounce to the picker mid-scan: keep the session, show a banner "Shift X is no longer active — choose another", and require re-pick on the next punch. Renaming (same id) must not disturb the session.
**C — #54**
- `EmployeeDao.observeAll` selects every column EXCEPT `photo` (projection class); add `photoById(id)` used only when the confirm card opens; cap photo bytes fetched/stored at ~200 KB in `RosterRepository`. No schema change => no Room version bump (verify the generated schema is unchanged).
**D — #58 #57 #61**
- #58 wrap `startLockTask()` in try/catch (SecurityException/IllegalArgumentException), log, continue.
- #57 `MainActivity`: initialise `paired` from `DeviceCredentialStore(this).activeDevice != null`.
- #61 `AndroidManifest.xml`: `allowBackup="false"` and fill `res/xml/data_extraction_rules.xml` + `backup_rules.xml` to exclude everything (credentials prefs and both Room DBs).
**E — #56 #60**
- #56 `K/ui/scan/QrScannerView.kt`: check `hasCamera(DEFAULT_BACK_CAMERA)`; fall back to the front camera; show a visible error text when neither binds; add a small flip-lens button.
- #60 `PunchScreen.kt` ManualEntryContent: `verticalScroll` + `imePadding` so the match card and Confirm stay reachable with the keyboard in landscape.

## Do not touch
Web code (`src/`), Room migrations already written, idempotency-key logic, operator/shift gates other than as stated. Add `docs/KIOSK_ALIGNMENT_2026-10-12.md` "Round 4" section listing what changed and what was only code-verified.

## Needs a real tablet (report as unverified, do not fake): #56 front/back combinations, #58 OEM lock-task policy, QR decode speed.
