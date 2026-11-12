#!/usr/bin/env python3
"""Clean the client go-live workbook. Original file is never modified.

Run:  python3 scripts/golive/clean-client-data.py [path-to.xlsx]
Needs: openpyxl. (Do not run with `python3 -I`: it hides user-site packages.)
Writes data/golive/cleaned-{users,employees,shifts}.json and CLEANING_REPORT.md.
The pure normalisation rules are mirrored in src/lib/mis/golive-clean.ts (keep in sync).
"""
import datetime
import json, os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "/Users/yashbankar/Downloads/BPP-Client-Data-Template - R1.xlsx"
OUT = Path(__file__).resolve().parents[2] / "data" / "golive"
OUT.mkdir(parents=True, exist_ok=True)

ROLE_MAP = {  # normalised sheet role -> (display role, system role)
    "owner": ("Owner", "OWNER"),
    "admin": ("Admin", "ADMIN"),
    "production manager": ("Admin", "ADMIN"),
    "supervisor": ("Supervisor", "SUPERVISOR"),
    "supervisior": ("Supervisor", "SUPERVISOR"),
    "qc": ("QC", "QC"),
    "attendance operator": ("Attendance Operator", "ATTENDANCE_OPERATOR"),
    "super attendance": ("Super Attendance Operator", "SUPER_ATTENDANCE_OPERATOR"),
    "super attendance operator": ("Super Attendance Operator", "SUPER_ATTENDANCE_OPERATOR"),
    "store": ("Store Guy", "STORE_GUY"),
}
SHIFT_ALIASES = {"general": "General Shift", "day": "Day Shift", "housekeeping": "House Keeping"}
TYPOS = [(r"supervisior", "Supervisor"), (r"genral", "General")]


def clean(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def fix_typos(s):
    for pat, rep in TYPOS:
        s = re.sub(pat, lambda m: rep if m.group(0)[0].isupper() else rep.lower() if m.start() else rep, s, flags=re.I)
    return s


def hhmm(v):
    if isinstance(v, (datetime.time, datetime.datetime)):
        return f"{v.hour:02d}:{v.minute:02d}"
    m = re.match(r"^(\d{1,2}):(\d{2})", clean(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def key(s):
    return re.sub(r"\s+", "", s).lower()


def mins(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


wb = openpyxl.load_workbook(SRC, data_only=True)
issues, notes = [], []

# ---- shifts
shifts = []
rows = list(wb["1 Shifts"].iter_rows(min_row=3, values_only=True))  # row 2 = example
notes.append(f"Shifts sheet: dropped example row 2 ({[c for c in next(wb['1 Shifts'].iter_rows(min_row=2, max_row=2, values_only=True))]}).")
for r in rows:
    name = clean(r[0])
    if not name:
        continue
    st, en = hhmm(r[1]), hhmm(r[2])
    if not st or not en:
        issues.append(f"Shift '{name}' has unreadable times {r[1]!r}/{r[2]!r}; skipped.")
        continue
    if st == en:
        issues.append(f"Shift '{name}' start == end ({st}); skipped (zero-length window matches nothing).")
        continue
    shifts.append({"name": name, "startTime": st, "endTime": en, "crossesMidnight": mins(en) < mins(st)})
shift_by_key = {key(s["name"]): s["name"] for s in shifts}

# ---- users
users = []
for r in wb["2 Software Users"].iter_rows(min_row=3, values_only=True):
    name = clean(r[0])
    if not name:
        continue
    raw = clean(r[1])
    rk = raw.lower()
    if rk not in ROLE_MAP:
        issues.append(f"User '{name}': unknown role '{raw}'; left unmapped (systemRole null).")
        disp, sysrole = raw, None
    else:
        disp, sysrole = ROLE_MAP[rk]
    users.append({"fullName": name, "sheetRole": raw, "role": disp, "systemRole": sysrole,
                  "mobile": clean(r[2]) or None, "email": clean(r[3]) or None})

# ---- employees
emps, used_shift_names, shift_fixes = [], Counter(), Counter()
dept_variants = defaultdict(Counter)
raw_emps = []
for r in wb["3 Kiosk Employees"].iter_rows(min_row=3, values_only=True):  # row 2 = example
    code = clean(r[0]).upper()
    if not code:
        continue
    raw_emps.append(
        (code, clean(r[1]), fix_typos(clean(r[2])), clean(r[3]), clean(r[4]))  # r[4] = 'Depatment' column
    )
for code, name, desig, shift_raw, dept in raw_emps:
    dept_variants[key(dept)][dept] += 1

dept_canon = {k: c.most_common(1)[0][0] for k, c in dept_variants.items()}
for code, name, desig, shift_raw, dept in raw_emps:
    sk = key(shift_raw)
    target = shift_by_key.get(sk) or (shift_by_key.get(key(SHIFT_ALIASES[sk])) and SHIFT_ALIASES[sk] if sk in SHIFT_ALIASES else None)
    if target is None:
        issues.append(f"{code} {name}: shift '{shift_raw}' not in shift sheet; shift left empty.")
        target = None
    elif target != shift_raw:
        shift_fixes[f"{shift_raw!r} -> {target!r}"] += 1
    if target:
        used_shift_names[target] += 1
    emps.append({"employeeCode": code, "name": name, "designation": desig or None,
                 "department": dept_canon[key(dept)] or None, "shift": target})

# ---- verification
codes = [e["employeeCode"] for e in emps]
dups = [c for c, n in Counter(codes).items() if n > 1]
checks = [
    ("shifts", len(shifts), 5), ("users", len(users), 27), ("employees", len(emps), 149),
]
names_l = Counter(e["name"].lower() for e in emps)
dup_names = sorted(n for n, c in names_l.items() if c > 1)
user_emp = {e["name"].lower(): e for e in emps}
users_with_emp = [u["fullName"] for u in users if u["fullName"].lower() in user_emp]
users_no_emp = [u["fullName"] for u in users if u["fullName"].lower() not in user_emp]
seq = [int(c[3:]) for c in codes if re.fullmatch(r"EMP\d+", c)]
gaps = sorted(set(range(1, max(seq) + 1)) - set(seq)) if seq else []
bad_code = [c for c in codes if not re.fullmatch(r"EMP\d{3}", c)]
depts = Counter(e["department"] for e in emps)

# Codes EMP001..EMP009 already belong to other people in the live DB (production logs point at them).
# Shift every client code up by CODE_OFFSET (default 100: EMP001 -> EMP101) so none collides.
CODE_OFFSET = int(os.environ.get("CODE_OFFSET", "100"))
if CODE_OFFSET:
    for e in emps:
        e["sheetCode"] = e["employeeCode"]
        e["employeeCode"] = "EMP%03d" % (int(e["employeeCode"][3:]) + CODE_OFFSET)
    (OUT / "code-mapping.csv").write_text("sheet_code,new_code,name\n" + "".join(f'{e["sheetCode"]},{e["employeeCode"]},{e["name"]}\n' for e in emps))
(OUT / "cleaned-shifts.json").write_text(json.dumps(shifts, indent=2, ensure_ascii=False) + "\n")
(OUT / "cleaned-users.json").write_text(json.dumps(users, indent=2, ensure_ascii=False) + "\n")
(OUT / "cleaned-employees.json").write_text(json.dumps(emps, indent=2, ensure_ascii=False) + "\n")

L = ["# Go-live client data cleaning report", "",
     f"Source: `{SRC}` (read-only, never modified). Generated by `scripts/golive/clean-client-data.py`.", "",
     "## Counts", "", "| Item | Found | Expected | OK |", "|---|---|---|---|"]
for n, got, exp in checks:
    L.append(f"| {n} | {got} | {exp} | {'yes' if got == exp else 'NO'} |")
L += [f"| distinct shifts used by employees | {len(used_shift_names)} | 5 | {'yes' if len(used_shift_names) == 5 else 'NO'} |",
      f"| duplicate employee codes | {len(dups)} | 0 | {'yes' if not dups else 'NO: ' + ', '.join(dups)} |", "",
      "Row 2 of each of sheets 1, 2, 3 is a template example and was dropped. The duplicate EMP001 in the raw sheet was the example row (`EMP001 Example Name`); real EMP001 is Girdharilal Dhard.", ""]
L += ["## Shifts (from sheet 1)", "", "| Name | Start | End | Crosses midnight |", "|---|---|---|---|"]
L += [f"| {s['name']} | {s['startTime']} | {s['endTime']} | {'yes' if s['crossesMidnight'] else 'no'} |" for s in shifts]
L += ["", "Night Shift 20:00-05:00 crosses midnight; punches 00:00-05:00 belong to the day it started (covered by vitest in `attendance-day.test.ts`/`shift-window.test.ts`).", "",
      "Employees per shift:", ""] + [f"- {n}: {c}" for n, c in used_shift_names.most_common()]
L += ["", "### Shift-name fixes applied to employees", ""] + ([f"- {k}: {c} employees" for k, c in shift_fixes.most_common()] or ["- none"])
L += ["", "'House keeping' maps to the sheet's existing 'House Keeping' shift (09:00-17:30). No shift was invented.", "",
      "## Users", "", "Role mapping: Production Manager->Admin, supervisior/Supervisior->Supervisor, 'super Attendance'->Super Attendance Operator, Store->Store Guy (STORE_GUY), QC/Owner/Admin as is.", "",
      "| Role | Count |", "|---|---|"]
for rname, c in Counter(u["role"] for u in users).most_common():
    L.append(f"| {rname} | {c} |")
L += ["", f"Users that match a kiosk employee by name ({len(users_with_emp)}): " + ", ".join(users_with_emp), "",
      f"Users with NO kiosk employee row ({len(users_no_emp)}): " + (", ".join(users_no_emp) or "none"), "",
      "Mobile/email are blank for all users; the loader for users must handle null login contact.", "",
      "## Employees", "", f"Codes are EMP001..EMP{max(seq):03d}; gaps: {gaps or 'none'}; malformed: {bad_code or 'none'}.",
      f"Names appearing more than once (different people, kept): {', '.join(dup_names) or 'none'}.", "",
      "Designation typo fixes: 'supervisior'->'Supervisor', 'Genral'->'General'. Names/designations/departments trimmed and internal spaces collapsed. Header 'Depatment' read as Department.", "",
      "### Departments (after trim/case normalisation)", ""] + [f"- {d}: {c}" for d, c in depts.most_common()]
L += ["", "Departments NOT merged (not clearly identical; client to confirm):", "",
      "- 'Packaging' vs 'Packaging Production' vs 'Packing' (Packing may be a spelling of Packaging)",
      "- 'Notebook production' vs 'Notebook QC' vs 'Packaging QC' (distinct)", "",
      "'Pinned Line ' (trailing space) was merged into 'Pinned Line'.", "",
      "## Loader mapping (see scripts/golive/load-employees.ts)", "",
      "- employeeCode -> MisEmployee.employeeCode (upsert key). name -> name.",
      "- department -> MisDepartment matched by case-insensitive name; created if missing (code = upper-snake of name).",
      "- shift -> MisShift matched by case-insensitive name -> MisEmployee.defaultShiftId (shifts created if missing).",
      "- role = WORKER, isActive = true, updated_at set. Existing employees linked to a user keep their role and userProfileId.",
      "- **Designation has no column on MisEmployee** (no `designation` in prisma/schema.prisma). It is kept in cleaned-employees.json but is NOT loaded. Adding it needs a schema change + migration: decision for the orchestrator.", "",
      "## Issues", ""] + ([f"- {i}" for i in issues] or ["- none"]) + [""] + [f"- {n}" for n in notes] + [""]
(OUT / "CLEANING_REPORT.md").write_text("\n".join(L))
print(f"shifts={len(shifts)} users={len(users)} employees={len(emps)} dups={dups} shifts_used={len(used_shift_names)} issues={len(issues)}")
for i in issues:
    print("ISSUE:", i)
