/**
 * Phase 24G · Part 4 (store & purchasing) — guard tests for the gaps logged in
 * docs/qa/ui-gaps/24G-part4.md.
 *
 * G4-01: on /mis/store/transactions at 390px, the Item column's two-line block
 * had no width of its own. As a *secondary* DataTable column it lands inside
 * the mobile card's `justify-between` row (CardRow), which gives it no width —
 * so on every one of the 31 filtered rows it pushed past the 390px edge
 * (measured as `clippedRight` in the phase's browser walk, even though the
 * page itself never grew a horizontal scrollbar). The fix mirrors the
 * Reference/Reason column right next to it: a capped width plus `truncate`.
 *
 * G4-02: several store/inventory toolbar links and buttons ("Dashboard",
 * "↓ CSV", "↓ Excel Template", "↑ Import CSV", "View all", "Deactivate",
 * the suppliers breadcrumb) were hand-rolled instead of using the kit
 * `Button`, and drew at ~38px or ~20px tall — under the 44px tap-target rule.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('G4-01 — store transactions Item column does not clip past the mobile edge', () => {
  const src = read('src/components/mis/store/store-transactions-screen.tsx');

  it('caps the Item column render to a fixed width, like the Reference column beside it', () => {
    const itemColumn = src.slice(src.indexOf("key: 'item'"), src.indexOf("key: 'type'"));
    expect(itemColumn).toMatch(/max-w-\[\d+px\]/);
    expect(itemColumn).toMatch(/truncate/);
  });
});

describe('G4-02 — store/inventory toolbar controls meet the 44px tap target', () => {
  const targets: Array<{ file: string; needle: string; label: string }> = [
    { file: 'src/components/mis/store/store-item-screen.tsx', needle: 'Dashboard\n          </Link>', label: 'Dashboard link' },
    { file: 'src/components/mis/store/store-item-screen.tsx', needle: 'Deactivate\n                </button>', label: 'Deactivate button' },
    { file: 'src/components/mis/store/store-dashboard-screen.tsx', needle: 'All Items\n          </Link>', label: 'All Items link' },
    { file: 'src/components/mis/store/store-dashboard-screen.tsx', needle: 'Full Log\n          </Link>', label: 'Full Log link' },
    { file: 'src/components/mis/store/store-dashboard-screen.tsx', needle: 'Stock Report\n          </Link>', label: 'Stock Report link' },
    { file: 'src/components/mis/store/store-dashboard-screen.tsx', needle: 'View all\n          </Link>', label: 'View all link' },
    { file: 'src/components/mis/store/store-stock-screen.tsx', needle: '↓ CSV\n        </button>', label: 'Stock CSV button' },
    { file: 'src/components/mis/store/store-ledger-screen.tsx', needle: '↓ CSV\n        </button>', label: 'Ledger CSV button' },
    { file: 'src/components/mis/store/store-transactions-screen.tsx', needle: '↓ CSV\n          </button>', label: 'Transactions CSV button' },
    { file: 'src/components/mis/inventory/inventory-screen.tsx', needle: '↓ CSV\n          </button>', label: 'Inventory CSV button' },
    { file: 'src/components/mis/inventory/inventory-screen.tsx', needle: '↓ Excel Template\n              </a>', label: 'Excel Template link' },
    { file: 'src/components/mis/inventory/inventory-screen.tsx', needle: '↑ Import CSV\n              </button>', label: 'Import CSV button' },
    { file: 'src/components/mis/suppliers/supplier-detail-screen.tsx', needle: 'Suppliers\n        </Link>', label: 'Suppliers breadcrumb' },
  ];

  it.each(targets.map((t) => [`${t.file} — ${t.label}`, t] as const))('%s is at least 44px tall', (_name, target) => {
    const src = read(target.file);
    const idx = src.indexOf(target.needle);
    expect(idx, `could not find "${target.label}" in ${target.file} — did the markup move?`).toBeGreaterThan(-1);
    // The nearest `className="..."` before this text belongs to the tag that
    // renders it (walking tag boundaries breaks on the `=>` inside an
    // `onClick` arrow function, which also contains a `>`).
    const classAttr = src.lastIndexOf('className="', idx);
    expect(classAttr, `no className= before "${target.label}" in ${target.file}`).toBeGreaterThan(-1);
    const valueStart = classAttr + 'className="'.length;
    const valueEnd = src.indexOf('"', valueStart);
    const classBlock = src.slice(valueStart, valueEnd);
    expect(classBlock).toMatch(/min-h-11/);
  });
});
