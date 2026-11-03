# R2 Round 7 bugs (sheet rows 415-426, build 18b6cbf). Tester suggestion = "Fix notes" column. Tester line refs: re-verify at HEAD.

## Web: supplier invoices (`src/components/mis/supplier-invoices/supplier-invoices-screen.tsx`)
- R2-374 Blocker Bug: rejectReason, payDate, payRef state shared at screen root (L85,106-108); typing in row 1 changes every row. Expected: per-row isolated state. Suggest: move status actions into a Shadcn Dialog/Popover keyed by invoiceId.
- R2-375 Major Bug: 4 inputs + buttons inside `<td>` (L119-135) blow table past 1500px. Expected: compact table; status badge + "Update Status" button opening the Dialog.
- R2-376 Medium Enh: add 4-card KPI strip above filter chips: Total Invoices, Matched, Discrepancies Requiring Action, Approved for Payment. Reuse paging.counts; match /mis/bom pattern.
- R2-377 Medium Enh: add "Print Voucher" (window.print or printable route) + CSV download on supplier invoices screen. (Money = OWNER/ACCOUNTS rules still apply; no amounts to roles that lack them.)

## Web: BOM list (`src/server/mis/bom.ts` ~L192,211-222; `src/components/mis/bom/bom-list-screen.tsx` ~L50)
- R2-378 Major Bug: bomNumber never selected/rendered in /mis/bom. Expected: "BOM #" column (e.g. BOM-202610-00042) and search matches bomNumber. Suggest: select bomNumber in listBomOverviewPage, add to BomOverviewRow, search OR clause, column.
- R2-379 Medium Edge: legacy BOMs with null bomNumber must render "—" (`r.bomNumber ?? '—'`), no crash; unit test.

## Android kiosk (`mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/...`)
- R2-380 Blocker: data/security/DeviceCredentialStore.kt L31-42 EncryptedSharedPreferences.create has no try/catch; Keystore invalidation => permanent crash loop. Fix: catch GeneralSecurityException/IOException, deleteSharedPreferences(PREFS_FILE_NAME), recreate clean; app then lands on Pairing.
- R2-381a Blocker: ui/scan/QrScannerView.kt L108-121 imageProxy.close() only in addOnCompleteListener; sync exception from scanner.process leaks ImageProxy, freezes camera. Fix: try/catch around scanner.process(image) -> log + imageProxy.close().
- R2-381b Major: data/network/KioskApi.kt L109-122 post() catches only IOException; SecurityException/IllegalStateException crash workers. Fix: catch Exception -> ApiResult.NetworkError; rethrow CancellationException.
- R2-382 Major Enh: ui/punch/PunchScreen.kt L898 hardcoded "Confirm & punch in" even when clocking OUT. Fix: neutral "Confirm punch".
- R2-383 Medium: PunchScreen.kt L103-107 hasCameraPermission not refreshed on resume. Fix: DisposableEffect lifecycle observer ON_RESUME re-checks ContextCompat.checkSelfPermission.
- R2-384 Medium: data/time/WorkDate.kt L64 start==end shift matches all 1440 minutes. Fix: if (start == end) return false (guard).
