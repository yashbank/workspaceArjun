/**
 * Employee code style — one factory setting (rule key `employee.code_style`) that decides how NEW
 * employee codes are generated and how typed / scanned input is normalised before matching.
 * It never rewrites a stored code: lookups try the exact text first, then the normalised forms.
 *
 *   EASY       EMP001          the original format (default)
 *   MEDIUM     EMP-0001        prefix, dash, 4 digits
 *   HARD       BP7K2Q          6 characters, no look-alike letters (0/O, 1/I/L)
 *   DIFFICULT  BP7K2QM4XR      10 characters, the last one is a check character
 *
 * Pure: no Prisma, no React.
 */

export const EMPLOYEE_CODE_STYLE_KEY = 'employee.code_style';
export const EMPLOYEE_CODE_STYLES = ['EASY', 'MEDIUM', 'HARD', 'DIFFICULT'] as const;
export type EmployeeCodeStyle = (typeof EMPLOYEE_CODE_STYLES)[number];
export const DEFAULT_EMPLOYEE_CODE_STYLE: EmployeeCodeStyle = 'EASY';

export const EMPLOYEE_CODE_STYLE_HELP =
  'Easy = EMP001 (current format). Medium = EMP-0001. Hard = 6 letters/digits such as BP7K2Q. ' +
  'Difficult = 10 letters/digits ending in a check character, such as BP7K2QM4XR. ' +
  'Changing this never edits existing codes; it only sets how new codes are made and how typed or scanned codes are matched.';

export function resolveEmployeeCodeStyle(raw: string | null | undefined): EmployeeCodeStyle {
  const v = (raw ?? '').trim().toUpperCase();
  return (EMPLOYEE_CODE_STYLES as readonly string[]).includes(v) ? (v as EmployeeCodeStyle) : DEFAULT_EMPLOYEE_CODE_STYLE;
}

// Crockford base32: no I, L, O, U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_LEN = 64;

function encode(value: bigint, length: number): string {
  let out = '';
  let v = value;
  for (let i = 0; i < length; i++) {
    out = ALPHABET[Number(v % BigInt(32))] + out;
    v /= BigInt(32);
  }
  return out;
}

/** Check character over the body: weighted sum mod 32 (catches any single-character typo). */
function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]) * (i + 1);
  return ALPHABET[sum % 32];
}

// Sequence -> scrambled but collision-free code (odd multiplier is invertible mod 2^n).
function scramble(seq: bigint, bits: bigint, mul: bigint, add: bigint): bigint {
  const mod = BigInt(1) << bits;
  return (seq * mul + add) % mod;
}

/** The code for the seq-th employee (seq >= 1) in `style`. Deterministic; unique per seq. */
export function generateEmployeeCode(style: EmployeeCodeStyle, seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  switch (style) {
    case 'EASY':
      return `EMP${String(n).padStart(3, '0')}`;
    case 'MEDIUM':
      return `EMP-${String(n).padStart(4, '0')}`;
    case 'HARD':
      return encode(scramble(BigInt(n), BigInt(30), BigInt(2654435761), BigInt('0x1b873593')), 6);
    case 'DIFFICULT': {
      const body = encode(scramble(BigInt(n), BigInt(45), BigInt('0x9e3779b97f4a7c15'), BigInt('0x2545f4914f6cdd1d')), 9);
      return body + checkChar(body);
    }
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Strips scanner noise: control chars, "badge:" / "code=" prefixes, a URL wrapper, stray punctuation. */
function clean(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(CONTROL, '').trim();
  if (!text || text.length > 512) return '';
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = url.searchParams.get('code') ?? url.searchParams.get('badge') ?? decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return '';
    }
  } else {
    const prefixed = /^(?:badge|code|employee)\s*[:=]\s*(.+)$/i.exec(text);
    if (prefixed) text = prefixed[1];
  }
  return text.replace(/\s+/g, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toUpperCase();
}

/** Crockford folding: O->0, I/L->1. Only meaningful for the random-looking styles. */
const fold = (s: string) => s.replace(/[-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

/** Canonical form of typed/scanned input for `style`. Returns '' when there is nothing usable. */
export function normaliseEmployeeCode(style: EmployeeCodeStyle, input: string | null | undefined): string {
  const text = clean(input);
  if (!text || text.length > MAX_LEN) return '';
  if (style === 'EASY' || style === 'MEDIUM') {
    const m = /^(?:EMP)?[-_.]?(\d+)$/.exec(text);
    if (!m) return text;
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1) return text;
    return style === 'EASY' ? `EMP${m[1].length >= 3 ? m[1] : String(n).padStart(3, '0')}` : `EMP-${String(n).padStart(4, '0')}`;
  }
  return fold(text);
}

/** True when `code` is exactly the shape `style` generates. */
export function validateEmployeeCode(style: EmployeeCodeStyle, code: string | null | undefined): boolean {
  const c = (code ?? '').trim().toUpperCase();
  switch (style) {
    case 'EASY':
      return /^EMP\d{3,}$/.test(c);
    case 'MEDIUM':
      return /^EMP-\d{4,}$/.test(c);
    case 'HARD':
      return new RegExp(`^[${ALPHABET}]{6}$`).test(c);
    case 'DIFFICULT':
      return new RegExp(`^[${ALPHABET}]{10}$`).test(c) && checkChar(c.slice(0, 9)) === c[9];
  }
}

/**
 * Strings to try when looking a code up: the typed text as-is (upper-cased) first, then SAFE fallbacks.
 * A fallback exists only when the typed text is itself a complete, well-formed code in some style
 * (EASY/MEDIUM: the full EMP001 / EMP-0001 shape; HARD/DIFFICULT: valid after look-alike folding, DIFFICULT
 * with its check character). Digits-only or partial input ('1', 'EMP-1', 'EMP-01') never gains a fallback.
 * The fallback is that same code rendered in the other EASY/MEDIUM style, so an old EMP001 still resolves
 * after the setting moves. Callers must refuse when the candidates match more than one stored employee.
 * Deduplicated; never empty-string. `style` is accepted for call-site compatibility and does not widen matching.
 */
export function employeeCodeCandidates(input: string | null | undefined, _style?: EmployeeCodeStyle): string[] {
  void _style;
  const exact = clean(input);
  if (!exact || exact.length > MAX_LEN) return [];
  const out = [exact];
  const add = (c: string) => { if (c && !out.includes(c)) out.push(c); };
  const num = /^EMP-?(\d+)$/.exec(exact);
  if (num && (validateEmployeeCode('EASY', exact) || validateEmployeeCode('MEDIUM', exact))) {
    const n = Number(num[1]);
    if (Number.isSafeInteger(n) && n >= 1) {
      add(normaliseEmployeeCode('EASY', exact));
      add(normaliseEmployeeCode('MEDIUM', exact));
    }
  } else {
    for (const s of ['HARD', 'DIFFICULT'] as const) {
      const f = normaliseEmployeeCode(s, input);
      if (validateEmployeeCode(s, f)) add(f);
    }
  }
  return out;
}

/**
 * Pick the one employee a code refers to: exact (case-insensitive) match wins; otherwise the safe
 * fallbacks, and only when they all point at ONE distinct employee. Zero or several -> null.
 */
export function pickEmployeeByCode<T extends { employeeCode: string }>(input: string | null | undefined, employees: readonly T[], key: (e: T) => string = (e) => e.employeeCode): T | null {
  const [exact, ...fallbacks] = employeeCodeCandidates(input);
  if (!exact) return null;
  const norm = (e: T) => key(e).trim().toUpperCase();
  const direct = employees.filter((e) => norm(e) === exact);
  if (direct.length) return direct.length === 1 ? direct[0] : null;
  const hits = [...new Set(employees.filter((e) => fallbacks.includes(norm(e))))];
  return hits.length === 1 ? hits[0] : null;
}
