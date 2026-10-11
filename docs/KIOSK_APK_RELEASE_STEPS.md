# Kiosk APK — release steps (keep in step with the web platform)

The Android app lives in this same repo (`mis-kiosk-android/`), so every `git push` to `main`
already carries the APK source. The web platform deploys itself (Vercel on `main`); the APK does
not — it is built and installed by hand. Do this whenever `mis-kiosk-android/` changed on `main`
(check: `git log --oneline -5 -- mis-kiosk-android`).

## 1. Build (Android Studio, on the machine that has the SDK)
1. Git → Fetch, checkout `main`, Pull.
2. Confirm `mis-kiosk-android/app/build.gradle.kts` → `API_BASE_URL` is `https://workspace-arjun.vercel.app` (production). A preview URL goes in a debug build only.
3. Build → Clean Project, then Build → Build Bundle(s)/APK(s) → Build APK(s).
   Output: `mis-kiosk-android/app/build/outputs/apk/debug/app-debug.apk` (or `release/` if a signing config is set up).

## 2. Install on the gate tablet(s)
- Emulator / USB: Run ▶ in Android Studio, or `adb install -r app-debug.apk`.
- Real tablets without USB: copy the APK (Drive / WhatsApp), open it on the tablet, allow "install unknown apps".
- The app keeps its pairing token and cached roster across an upgrade install (`-r`). A **fresh** install needs re-pairing: Settings → Gate tablets → enter the code shown on the tablet.

## 3. Verify after install (2 minutes)
1. Health screen (hold the top bar 3 s) → sync → roster count matches the web Employees list.
2. Scan a badge of an employee WITH a photo → confirm card shows the face; one WITHOUT → shows the initial.
3. Wifi off → scan again → photo still shows (cached) → wifi on → punch appears on the web Attendance.

## Compatibility rules (why nothing breaks)
- The server's pull payload is an allow-list (`PULL_EMPLOYEE_KEYS` in `src/server/mis/kiosk-device.ts`); the app ignores unknown keys (`ignoreUnknownKeys = true`), so an older APK keeps working against a newer server, and a newer APK tolerates an older server (photo simply absent).
- Room database version is bumped (now 3) with `fallbackToDestructiveMigration` — an upgrade drops the local cache and re-pulls on first sync; punches queued offline are in a separate table and are kept.
- Never change `mis-kiosk-android/app/src/main/java/.../data/network/dto/*` field names without changing the server contract in the same commit.
