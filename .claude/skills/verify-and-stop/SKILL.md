---
name: verify-and-stop
description: The done-gate for any MIS change — run typecheck, lint, the full Vitest suite and the production build (plus Android unit tests and assembleRelease when kiosk code changed), prove each one from its output, log the result, push, and stop with an honest report. Use before every commit on a fix or chore branch, at the end of every batch in a QA round, and whenever asked "is it done?".
---

# verify-and-stop

Run from the repo root. Each step must be green from ITS OWN output; never infer.

```bash
pnpm db:generate                       # only if prisma/schema.prisma changed or typecheck shows stale-client errors
pnpm typecheck                         # silent = green
pnpm lint                              # 0 errors (pre-existing warnings are listed; do not fix unrelated files)
pnpm test                              # Test Files N passed | 1 skipped; Tests M passed — never below the last log line
pnpm build                             # "✓ Generating static pages"
```
Android (only when `mis-kiosk-android/` changed):
```bash
cd mis-kiosk-android && JAVA_HOME=$HOME/android-tools/jdk/Contents/Home ANDROID_HOME=$HOME/android-tools/sdk \
  ./gradlew --no-daemon -q :app:testDebugUnitTest :app:assembleRelease
cp app/build/outputs/apk/release/app-release-unsigned.apk ../release/   # release/*.apk is gitignored
rm -rf app/build build                                                   # keep one build output on disk
```
Browser (UI tickets): `pnpm test:e2e` against `E2E_BASE_URL` in `.env.e2e`, or the Playwright
MCP server (`.mcp.json`) for a quick 390px / 1280px look at the changed screen.

## Then
1. Disk: `rm -rf .next` after the build if space is tight (`df -h ~`).
2. Log one line per ticket (`ID | STATE | sha | note`) in the round log (`docs/qa/round<N>/MAX_LOG.md`)
   or `CHANGELOG.md`; name contract tests you changed and migrations a human must run.
3. Commit (`R2-<n>: <one line>` or `MIS-<n>: ...`), `git fetch && git rebase origin/<base>`,
   re-run the gate if the rebase touched code, push.
4. Report ≤10 lines: what passed (with counts), what was NOT verified, migrations to run, APK path.
   Never claim a pass you did not see. Then stop.
