Hi, round 7 is on the live site (release 2026-11-03, build 27e321e). All 12 rows R2-374 to R2-384 are set to "Fixed - Ready to Retest" in the Bugs tab, with notes in "Fix notes".

Please retest:
- Supplier Invoices (/mis/supplier-invoices), R2-374 to R2-377: type a reject reason on one invoice and check others stay empty; table has no inputs and does not scroll sideways; 4 KPI cards on top; Export CSV and Print Voucher work.
- BOM list (/mis/bom), R2-378 and R2-379: BOM # column, search by BOM number, older BOMs show a dash.
- Kiosk APK (build 27e321e), R2-380 to R2-384: needs a real tablet. Cases: change the lock screen PIN then open the app (should land on Pairing, not crash); scan QR continuously; airplane/doze mode while punching; punch OUT via manual code (button says "Confirm punch"); grant camera in Settings and return; shift with start = end.

Please mark Retest by tester Pass or Fail in the sheet. If all pass, may we go live with the APK and the whole platform?
