'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { useT } from '@/components/mis/shell/locale-provider';
import { useOnline } from '@/components/mis/shell/use-online';
import { useQueueSnapshot } from '@/components/mis/shell/use-queue-snapshot';
import { formatFactoryTime } from '@/lib/mis/factory-time';
import { createTranslator } from '@/lib/mis/i18n';
import { getOfflineQueue, type QueuedItem } from '@/lib/mis/offline/queue';

import { fixUnknownBadge } from './punch-fix';
import { summarisePunchQueue } from './punch-queue';
import {
  clearPunchSyncLog,
  EMPTY_PUNCH_LOG,
  getPunchSyncLog,
  subscribePunchSyncLog,
} from './punch-sync-log';
import { submitKioskPunch } from './submit-punch';

type Shift = { id: string; name: string };
type AttendanceInfo = { id: string; clockIn: Date | null; clockOut: Date | null; status: string } | null;
type EmployeeRow = { id: string; name: string; employeeCode: string; role: string; attendance: AttendanceInfo };
type Direction = 'IN' | 'OUT';

interface KioskScreenProps {
  employees: EmployeeRow[];
  shifts: Shift[];
  date: string;
  /** The signed-in operator — recorded against every punch queued here (§B.10.2). */
  userId: string;
  /** The factory's zone (D22). Every time on this screen is read on the plant's clock, not the browser's. */
  timeZone: string;
  /** When the employee list was loaded — a cached copy of this page can be hours old (D16). */
  loadedAt: string;
}

/** Older than this and the list is called out as old, online or not (D16). */
const STALE_AFTER_MS = 5 * 60 * 1000;

const en = createTranslator('en');
const hi = createTranslator('hi');

/** The last direction we know for a person: what they did on this tablet, else what the register says. */
function lastDirection(emp: EmployeeRow, local: Record<string, { direction: Direction; at: string }>): { direction: Direction; at: Date } | null {
  const mine = local[emp.id];
  if (mine) return { direction: mine.direction, at: new Date(mine.at) };
  if (emp.attendance?.clockOut) return { direction: 'OUT', at: new Date(emp.attendance.clockOut) };
  if (emp.attendance?.clockIn) return { direction: 'IN', at: new Date(emp.attendance.clockIn) };
  return null;
}

export function KioskScreen({ employees, shifts, date, userId, timeZone, loadedAt }: KioskScreenProps) {
  const t = useT();
  const online = useOnline();
  const snapshot = useQueueSnapshot();
  const sentLog = useSyncExternalStore(subscribePunchSyncLog, getPunchSyncLog, () => EMPTY_PUNCH_LOG);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const [selectedShift, setSelectedShift] = useState(shifts[0]?.id ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'held' | 'error'; text: string } | null>(null);
  const [local, setLocal] = useState<Record<string, { direction: Direction; at: string }>>({});
  const [fixing, setFixing] = useState<QueuedItem | null>(null);
  const [fixSearch, setFixSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  // Time is read AFTER mount: rendering it during SSR would differ from the client's first paint.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The first reading is deferred a tick, not set in the effect body, so it is a callback like the rest.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const clock = now === null ? '' : formatFactoryTime(new Date(now), timeZone);
  const stale = now !== null && now - new Date(loadedAt).getTime() > STALE_AFTER_MS;
  const summary = useMemo(() => {
    const base = summarisePunchQueue(snapshot?.items ?? [], sentLog, timeZone, now ?? 0);
    // Before the first clock reading there is no "now" to count down from — say nothing rather than a nonsense number.
    return now === null ? { ...base, retryInSeconds: null } : base;
  }, [snapshot, sentLog, timeZone, now]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q));
  }, [employees, search]);

  const fixMatches = useMemo(() => {
    const q = fixSearch.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)).slice(0, 8);
  }, [employees, fixSearch]);

  const timeOf = (iso: string) => formatFactoryTime(new Date(iso), timeZone);
  const dirWord = (d: Direction) => (d === 'IN' ? t('kiosk.in') : t('kiosk.out'));

  const last = selected ? lastDirection(selected, local) : null;
  const canClockIn = !!selected && last?.direction !== 'IN';
  const canClockOut = !!selected && last?.direction === 'IN';

  function punch(direction: Direction) {
    if (!selected) return;
    const person = selected;
    // K7 ("already punched") is enforced by what is OFFERED, not by a check here: a person who is in is
    // shown Clock out only, and the button is disabled while a punch is in flight, so a second tap on
    // the same person cannot become a second punch.
    startTransition(async () => {
      const out = await submitKioskPunch({
        direction,
        badgeCode: person.employeeCode,
        // The shift only helps a clock-in file under the right day (D22); a clock-out pairs with its in.
        shiftId: direction === 'IN' ? selectedShift || undefined : undefined,
        userId,
        label: `${person.name} · ${direction === 'IN' ? 'in' : 'out'}`,
      });

      if (out.kind === 'NOT_SAVED') {
        // Nowhere to keep it: keep the person selected and say so loudly.
        setMessage({ tone: 'error', text: `${person.name} · ${t('kiosk.notSaved')}` });
        return;
      }
      if (out.kind === 'BLOCKED') {
        setMessage({ tone: 'error', text: `${person.name} · ${out.detail}` });
        return;
      }
      setLocal((prev) => ({ ...prev, [person.id]: { direction, at: out.punchedAt } }));
      setMessage(
        out.kind === 'APPLIED'
          ? { tone: 'ok', text: `${person.name} · ${dirWord(direction)} ${timeOf(out.punchedAt)}` }
          : { tone: 'held', text: `${person.name} · ${dirWord(direction)} ${timeOf(out.punchedAt)} — ${t('sync.savedOnDevice')}` },
      );
      setSelected(null);
    });
  }

  async function chooseForFix(person: EmployeeRow) {
    if (!fixing) return;
    const result = await fixUnknownBadge(fixing, { employeeCode: person.employeeCode, name: person.name }, getOfflineQueue());
    setFixing(null);
    setFixSearch('');
    setMessage(
      result.ok
        ? { tone: 'ok', text: `${t('kiosk.fixDone')} ${person.name}` }
        : { tone: 'error', text: result.detail },
    );
  }

  const heldCount = summary.waiting + summary.failed.length;
  const offlineOrOld = !online || stale;
  const counts = {
    total: employees.length,
    inNow: employees.filter((e) => lastDirection(e, local)?.direction === 'IN').length,
    done: employees.filter((e) => lastDirection(e, local)?.direction === 'OUT').length,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
      {/* Offline is a banner, never a block: the scan target stays exactly where it was (K2). */}
      {!online && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="font-semibold">
            {t('kiosk.noSignal')} · {heldCount} {heldCount === 1 ? t('kiosk.heldOne') : t('kiosk.heldMany')}
          </p>
          <div className="mt-2 rounded-lg bg-amber-100 px-3 py-2">
            <p className="font-semibold">{en('kiosk.carryOn')}</p>
            <p className="text-sm">{en('kiosk.carryOnBody')}</p>
            <p className="mt-1 text-sm" lang="hi">{hi('kiosk.carryOnBody')}</p>
          </div>
        </div>
      )}
      {online && summary.waiting > 0 && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-900">
          {t('kiosk.backOnline')}
        </p>
      )}
      {offlineOrOld && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {online ? t('sync.staleLists') : t('sync.offlineLists')}{' '}
          <span className="font-mono">{timeOf(loadedAt)}</span>
        </p>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('kiosk.title')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('kiosk.subtitle')} — {date}</p>
        </div>
        <div className="font-mono text-3xl font-bold text-slate-800" aria-label="Factory time">{clock}</div>
      </div>

      {message && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            message.tone === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : message.tone === 'held'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.text}
          <button className="ml-3 text-xs underline" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* THE QUEUE (K2, right): what was sent, what is stuck, what is still waiting. */}
      {summary.visible && (
        <section aria-label={t('sync.queueTitle')} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-slate-900">{summary.sent}</span>
            <span className="text-lg text-slate-400">/ {summary.total}</span>
            <span className="text-sm text-slate-500">{t('kiosk.sent')}</span>
            <div className="ml-2 h-2 flex-1 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-green-500"
                style={{ width: `${summary.total ? Math.round((summary.sent / summary.total) * 100) : 0}%` }}
              />
            </div>
          </div>

          <ul className="mt-3 divide-y divide-slate-100">
            {sentLog.map((s) => (
              <li key={s.punchId} className="flex items-center gap-2 py-2 text-sm">
                <span aria-hidden="true" className="text-green-600">✓</span>
                <span className="flex-1 text-slate-900">{s.employeeName} · {dirWord(s.direction)}</span>
                {/* The ORIGINAL punch time: 06:04 stays 06:04 however late it synced (D15). */}
                <span className="font-mono text-slate-500">{timeOf(s.punchedAt)}</span>
              </li>
            ))}
            {summary.failed.map((f) => {
              const item = snapshot?.items.find((i) => i.key === f.key);
              return (
                <li key={f.key} className="rounded-lg bg-red-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-red-700">{t(f.titleKey)}</p>
                      <p className="font-mono text-xs text-slate-600">{dirWord(f.direction)} · {f.scanned}</p>
                      {f.hintKey && <p className="mt-0.5 text-xs text-slate-700">{t(f.hintKey)}</p>}
                    </div>
                    {f.canFix && item && (
                      <Button variant="secondary" onClick={() => setFixing(item)}>
                        {t('kiosk.fix')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {summary.waiting > 0 && (
              <li className="flex items-center gap-2 py-2 text-sm text-slate-600">
                <span aria-hidden="true">⏱</span>
                <span>
                  {summary.waiting} {t('kiosk.moreWaiting')}
                  {summary.retryInSeconds !== null && ` · ${t('kiosk.retryingIn')} ${summary.retryInSeconds}s`}
                </span>
              </li>
            )}
          </ul>

          <Button variant="secondary" block className="mt-3" onClick={() => clearPunchSyncLog()}>
            {t('kiosk.backToScanning')}
          </Button>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Employees */}
        <div className="flex h-[520px] flex-col rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4">
            <input
              className="min-h-12 w-full rounded-lg border border-gray-200 px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No employees found</div>}
            {filtered.map((emp) => {
              const l = lastDirection(emp, local);
              return (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelected(emp);
                    setMessage(null);
                  }}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    selected?.id === emp.id ? 'border-l-4 border-blue-500 bg-blue-50' : ''
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-500">{emp.employeeCode} · {emp.role.replace(/_/g, ' ')}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      l?.direction === 'IN' ? 'bg-blue-100 text-blue-800' : l?.direction === 'OUT' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {l ? `${dirWord(l.direction)} ${formatFactoryTime(l.at, timeZone)}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
            {filtered.length} / {employees.length}
          </div>
        </div>

        {/* Action panel */}
        <div className="flex flex-col rounded-xl border border-gray-200 bg-white">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
              Select an employee from the list to clock in or out
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="border-b border-gray-100 p-6">
                <div className="text-lg font-semibold text-gray-900">{selected.name}</div>
                <div className="text-sm text-gray-500">{selected.employeeCode} · {selected.role.replace(/_/g, ' ')}</div>
                {last && (
                  <div className="mt-1 text-sm text-gray-700">
                    {dirWord(last.direction)} {formatFactoryTime(last.at, timeZone)}
                  </div>
                )}
              </div>

              {canClockIn && shifts.length > 0 && (
                <div className="border-b border-gray-100 px-6 py-4">
                  <label htmlFor="kiosk-shift" className="mb-2 block text-xs font-medium text-gray-600">Shift</label>
                  <select
                    id="kiosk-shift"
                    className="min-h-12 w-full rounded-lg border border-gray-200 px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value)}
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-auto space-y-3 px-6 py-5">
                {canClockIn && (
                  <Button block onClick={() => punch('IN')} loading={isPending} className="min-h-16 bg-green-600 text-lg font-semibold hover:bg-green-700">
                    ✓ {t('kiosk.clockIn')}
                  </Button>
                )}
                {canClockOut && (
                  <Button block onClick={() => punch('OUT')} loading={isPending} className="min-h-16 bg-orange-500 text-lg font-semibold hover:bg-orange-600">
                    → {t('kiosk.clockOut')}
                  </Button>
                )}
                <Button variant="ghost" block onClick={() => { setSelected(null); setMessage(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: counts.total, color: 'text-gray-700' },
          { label: dirWord('IN'), value: counts.inNow, color: 'text-blue-600' },
          { label: dirWord('OUT'), value: counts.done, color: 'text-green-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="mt-0.5 text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Fix (K2): say who an unrecognised badge really was. A correction is recorded; the held punch is never edited. */}
      <SlideOver open={fixing !== null} onClose={() => { setFixing(null); setFixSearch(''); }} title={t('kiosk.fixTitle')}>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-slate-600">{t('kiosk.fixBody')}</p>
          <input
            className="min-h-12 w-full rounded-lg border border-gray-200 px-3 text-base"
            placeholder="Search by name or code…"
            value={fixSearch}
            onChange={(e) => setFixSearch(e.target.value)}
            autoFocus
          />
          <ul className="divide-y divide-slate-100">
            {fixMatches.map((e) => (
              <li key={e.id}>
                <button className="flex min-h-14 w-full items-center gap-3 px-2 text-left hover:bg-slate-50" onClick={() => chooseForFix(e)}>
                  <span className="flex-1 font-medium text-slate-900">{e.name}</span>
                  <span className="font-mono text-xs text-slate-500">{e.employeeCode}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SlideOver>
    </div>
  );
}
