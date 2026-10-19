#!/usr/bin/env python3
"""Maintain docs/qa/MIS_TESTER_TRACKER.xlsx (tester script + bug tracker).

  build                      regenerate Tests sheet from docs/qa/MIS_V2_TESTER_GUIDE.md (keeps tester results by ID)
  seed-bugs <report.md>      import "Bug #N" blocks from the tester report into Bugs (skips IDs already present)
  set ID [ID...] key=value   e.g. set R2-17 R2-34 status=Deferred fix="needs schema" release=2026-10-13
  merge <returned.xlsx>      pull tester Result/Notes (Tests) and new/changed Bugs rows from their copy
  summary                    counts per status / result
Statuses live in the Lists sheet; edit there to add one.
"""
import re, sys, shutil
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

ROOT = Path(__file__).resolve().parent.parent
GUIDE = ROOT / "docs/qa/MIS_V2_TESTER_GUIDE.md"
XLSX = ROOT / "docs/qa/MIS_TESTER_TRACKER.xlsx"
RESULTS = ["Not run", "Pass", "Fail", "Blocked"]
STATUSES = ["New Bug", "Bug Reproduced", "Not Reproducible", "Fixed - Ready to Retest", "Bug Resolved",
            "Enhancement Requested", "Enhancement Still Required", "Enhancement Done", "Deferred"]
SEV = ["Blocker", "Major", "Minor", "Cosmetic"]
TEST_COLS = ["ID", "Section", "Role", "Where / Steps", "Expected", "Result", "Tester notes", "Bug ID"]
BUG_COLS = ["Bug ID", "Type", "Status", "Severity", "Role / screen", "Title", "Steps", "Expected", "Actual",
            "Device", "Reported", "Fix notes", "Release", "Retest by tester", "Tester comment"]
TESTER_OWNED_TESTS = ["Result", "Tester notes", "Bug ID"]
TESTER_OWNED_BUGS = ["Retest by tester", "Tester comment"]
DEFERRED = {17, 34, 2, 25, 28, 48, 46, 40, 41, 45, 47, 49, 37, 38}


def parse_guide():
    rows, section, header = [], "", None
    for line in GUIDE.read_text().splitlines():
        if line.startswith("## "):
            section = line[3:].strip(); header = None; continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0] == "#":
            header = [c.lower() for c in cells]; continue
        if header is None or set(cells[0]) <= set("-: ") or not re.match(r"^\d+\.\d+$", cells[0]):
            continue
        d = dict(zip(header, cells))
        exp = next((d[k] for k in d if k.startswith("expected")), cells[-1])
        mid = [d[k] for k in d if k not in ("#", "role") and not k.startswith("expected")]
        rows.append([cells[0], section, d.get("role", ""), " — ".join(mid), exp])
    return rows


def style_header(ws, cols, widths):
    for i, (c, w) in enumerate(zip(cols, widths), 1):
        cell = ws.cell(1, i, c)
        cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F4E78")
        ws.column_dimensions[cell.column_letter].width = w
    ws.freeze_panes = "B2"; ws.auto_filter.ref = ws.dimensions


def load():
    return load_workbook(XLSX) if XLSX.exists() else None


def rows_by_id(ws, cols):
    idx = {c: i for i, c in enumerate(cols)}
    out = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] and str(r[0]) != cols[0]:  # skip stray repeated header rows
            out[str(r[0])] = {c: (r[i] if i < len(r) else None) for c, i in idx.items()}
    return out


def write(tests, bugs):
    wb = Workbook()
    ws = wb.active; ws.title = "Tests"
    style_header(ws, TEST_COLS, [7, 28, 14, 60, 60, 10, 40, 12])
    for r in tests:
        ws.append([r[c] for c in TEST_COLS])
    wb.create_sheet("Bugs"); wsb = wb["Bugs"]
    style_header(wsb, BUG_COLS, [9, 13, 24, 10, 28, 45, 60, 40, 60, 14, 12, 40, 12, 18, 40])
    for r in bugs:
        wsb.append([r.get(c) for c in BUG_COLS])
    wl = wb.create_sheet("Lists")
    for col, vals in enumerate([RESULTS, STATUSES, SEV, ["Bug", "Enhancement"], ["Pass", "Fail"]], 1):
        for i, v in enumerate(vals, 1):
            wl.cell(i, col, v)
    def dv(ws_, col, ref, n):
        v = DataValidation(type="list", formula1=f"=Lists!${ref}$1:${ref}${n}", allow_blank=True)
        ws_.add_data_validation(v); v.add(f"{col}2:{col}2000")
    dv(ws, "F", "A", len(RESULTS)); dv(wsb, "C", "B", len(STATUSES)); dv(wsb, "D", "C", len(SEV))
    dv(wsb, "B", "D", 2); dv(wsb, "N", "E", 2)
    for col, color in (("F", None),):
        ws.conditional_formatting.add("F2:F2000", CellIsRule(operator="equal", formula=['"Pass"'], fill=PatternFill("solid", bgColor="C6EFCE")))
        ws.conditional_formatting.add("F2:F2000", CellIsRule(operator="equal", formula=['"Fail"'], fill=PatternFill("solid", bgColor="FFC7CE")))
        ws.conditional_formatting.add("F2:F2000", CellIsRule(operator="equal", formula=['"Blocked"'], fill=PatternFill("solid", bgColor="FFEB9C")))
    for sheet in (ws, wsb):
        for row in sheet.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical="top")
    wsum = wb.create_sheet("Summary", 0)
    wsum["A1"] = "Test results"; wsum["A1"].font = Font(bold=True)
    for i, v in enumerate(RESULTS, 2):
        wsum.cell(i, 1, v); wsum.cell(i, 2, f'=COUNTIF(Tests!F:F,A{i})')
    wsum.cell(len(RESULTS) + 2, 1, "Total tests"); wsum.cell(len(RESULTS) + 2, 2, "=COUNTA(Tests!A:A)-1")
    base = len(RESULTS) + 4
    wsum.cell(base, 1, "Bug / enhancement status").font = Font(bold=True)
    for i, v in enumerate(STATUSES, base + 1):
        wsum.cell(i, 1, v); wsum.cell(i, 2, f'=COUNTIF(Bugs!C:C,A{i})')
    wsum.column_dimensions["A"].width = 30
    wb.move_sheet("Lists", offset=0)
    wb.save(XLSX)


def current():
    wb = load()
    if not wb:
        return {}, {}
    return rows_by_id(wb["Tests"], TEST_COLS), rows_by_id(wb["Bugs"], BUG_COLS)


def cmd_build():
    old_t, old_b = current()
    tests = []
    for id_, sec, role, steps, exp in parse_guide():
        o = old_t.get(id_, {})
        tests.append({"ID": id_, "Section": sec, "Role": role, "Where / Steps": steps, "Expected": exp,
                      "Result": o.get("Result") or "Not run", "Tester notes": o.get("Tester notes"), "Bug ID": o.get("Bug ID")})
    write(tests, list(old_b.values()))
    print(f"built {len(tests)} tests, kept {len(old_b)} bugs -> {XLSX}")


def cmd_seed(path):
    text = re.sub(r"\\(.)", r"\1", Path(path).read_text())
    old_t, old_b = current()
    blocks = re.split(r"(?m)^[#*\s]*Bug\s*#?\s*(\d+)[^\n]*$", text)
    added = 0
    for n, body in zip(blocks[1::2], blocks[2::2]):
        bid = f"R2-{int(n):02d}"
        if bid in old_b:
            continue
        g = lambda pat: (re.search(pat, body, re.S) or [None, ""])[1].strip()
        role = g(r"Role/screen:\s*(.+?)(?=\s*(?:\n|Issue Type:|What you did))")
        steps = g(r"What you did \(steps\):\s*(.+?)\s*What you expected")
        exp = g(r"What you expected:\s*(.+?)\s*What actually happened")
        act = g(r"What actually happened:\s*(.+?)\s*Severity")
        sev = g(r"Severity:\s*(\w+)")
        title = re.split(r"(?<=[.!?])\s", act, 1)[0][:140] or role
        status = "Deferred" if int(n) in DEFERRED else "Fixed - Ready to Retest"
        old_b[bid] = {"Bug ID": bid, "Type": "Bug", "Status": status, "Severity": sev, "Role / screen": role,
                      "Title": title, "Steps": steps, "Expected": exp, "Actual": act, "Device": "", "Reported": "round 2",
                      "Fix notes": "Deferred: needs schema/product input (docs/specs/00-README.md)" if status == "Deferred" else "Fixed in release 2026-10-13 (PR #81)",
                      "Release": "2026-10-13" if status != "Deferred" else ""}
        added += 1
    old_t_rows = list(old_t.values())
    write(old_t_rows, list(old_b.values())); print(f"seeded {added} bugs")


def cmd_set(args):
    ids = [a for a in args if "=" not in a]; kv = dict(a.split("=", 1) for a in args if "=" in a)
    keymap = {c.lower().replace(" ", "_"): c for c in BUG_COLS}
    t, b = current()
    for i in ids:
        if i not in b:
            print("unknown bug", i); continue
        for k, v in kv.items():
            b[i][keymap[k]] = v
    write(list(t.values()), list(b.values())); print("updated", ids)


def cmd_merge(path):
    mine_t, mine_b = current()
    wb = load_workbook(path)
    theirs_t = rows_by_id(wb["Tests"], TEST_COLS); theirs_b = rows_by_id(wb["Bugs"], BUG_COLS)
    nt = nb = 0
    for i, r in theirs_t.items():
        if i in mine_t:
            for c in TESTER_OWNED_TESTS:
                if r.get(c) and r[c] != mine_t[i].get(c):
                    mine_t[i][c] = r[c]; nt += 1
    for i, r in theirs_b.items():
        if i not in mine_b:
            mine_b[i] = r; nb += 1; continue
        for c in TESTER_OWNED_BUGS + ["Status"]:
            if r.get(c) and r[c] != mine_b[i].get(c):
                mine_b[i][c] = r[c]; nb += 1
    write(list(mine_t.values()), list(mine_b.values())); print(f"merged {nt} test cells, {nb} bug cells")


def cmd_summary():
    t, b = current()
    from collections import Counter
    print("tests:", dict(Counter(r["Result"] for r in t.values())))
    print("bugs :", dict(Counter(r["Status"] for r in b.values())))
    for i, r in b.items():
        if r["Status"] in ("New Bug", "Bug Reproduced", "Enhancement Still Required"):
            print(" open", i, r["Status"], "-", (r["Title"] or "")[:70])


if __name__ == "__main__":
    a = sys.argv[1:]
    {"build": cmd_build, "seed-bugs": lambda: cmd_seed(a[1]), "set": lambda: cmd_set(a[1:]),
     "merge": lambda: cmd_merge(a[1]), "summary": cmd_summary}.get(a[0] if a else "", lambda: print(__doc__))()
