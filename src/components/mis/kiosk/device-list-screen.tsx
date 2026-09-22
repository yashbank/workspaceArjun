'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import {
  approveEnrolmentAction,
  renameDeviceAction,
  revokeDeviceAction,
} from '@/app/(mis)/mis/settings/devices/actions';
import { Button } from '@/components/mis/kit/button';
import { Card } from '@/components/mis/kit/card';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { BATTERY_WARN_PERCENT, describeAge, type KioskHealthLevel } from '@/lib/mis/kiosk-health';
import type { KioskDeviceRow } from '@/server/mis/kiosk-device';

const LEVEL_TONE: Record<KioskHealthLevel, BadgeTone> = { GREEN: 'good', AMBER: 'warning', RED: 'critical' };

type Panel =
  | { kind: 'pair' }
  | { kind: 'rename'; device: KioskDeviceRow }
  | { kind: 'retire'; device: KioskDeviceRow }
  | null;

/**
 * Settings → Devices: pair, rename and retire gate tablets (K10, D18) and see how
 * each one is doing (K12, D19).
 *
 * Every age is computed from `asOf`, the server's clock at render, never the
 * browser's — so the words on screen agree with the colour the server chose, and
 * a phone with a wrong clock cannot turn a stale tablet green.
 *
 * Nothing on this screen — nor anything a tablet pulls — is money.
 */
export function DeviceListScreen({ devices, asOf }: { devices: KioskDeviceRow[]; asOf: string }) {
  const now = new Date(asOf);
  const [panel, setPanel] = useState<Panel>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = devices.filter((d) => d.status === 'ACTIVE');
  const retired = devices.filter((d) => d.status === 'REVOKED');

  const open = (next: Panel) => {
    setPanel(next);
    setError(null);
    setPaired(null);
    setCode('');
    setReason('');
    setName(next && next.kind === 'rename' ? next.device.name : '');
  };
  const close = () => setPanel(null);

  const submit = () => {
    if (!panel) return;
    startTransition(async () => {
      setError(null);
      if (panel.kind === 'pair') {
        const result = await approveEnrolmentAction(code, name);
        if (!result.ok) return setError(result.detail);
        setPaired(result.name);
        setCode('');
        setName('');
        return;
      }
      const result =
        panel.kind === 'rename'
          ? await renameDeviceAction(panel.device.id, name)
          : await revokeDeviceAction(panel.device.id, reason);
      if (!result.ok) return setError(result.detail);
      close();
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gate tablets</h1>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {active.length} paired · {retired.length} retired
            </p>
          </div>
          <Button onClick={() => open({ kind: 'pair' })}>+ Pair a tablet</Button>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          A new tablet shows a code. Type it here and give the tablet a name — the tablet then
          collects its own access. It never holds anyone’s login, and it never receives wages,
          orders or customers.
        </p>
        <Link href="/mis/settings" className="mt-2 inline-flex min-h-11 w-fit items-center text-base text-slate-500 underline">
          Back to settings
        </Link>
      </div>

      {active.length === 0 && retired.length === 0 ? (
        <EmptyState
          title="No tablet is paired yet"
          body="Open the kiosk app on the tablet. It will show a pairing code like 4K7P-92."
        />
      ) : (
        <>
          {active.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-slate-900">{d.name}</div>
                  {d.hardwareLabel && <div className="truncate font-mono text-xs text-slate-500">{d.hardwareLabel}</div>}
                </div>
                <StatusBadge tone={LEVEL_TONE[d.syncLevel]}>
                  {d.lastSyncAt ? `Synced ${describeAge(d.lastSyncAt, now)} ago` : 'Never synced'}
                </StatusBadge>
              </div>

              <dl className="mt-3 divide-y divide-slate-100 text-sm">
                <Row label="Employee list">
                  <StatusBadge tone={LEVEL_TONE[d.cacheLevel]}>
                    {d.lastPullAt ? `${describeAge(d.lastPullAt, now)} old` : 'never pulled'}
                  </StatusBadge>
                </Row>
                <Row label="Queued punches">
                  {d.queuedPunches === null ? 'not reported' : d.queuedPunches === 0 ? 'nothing queued' : `${d.queuedPunches} — none lost`}
                </Row>
                <Row label="Battery">
                  {d.batteryPercent === null ? 'not reported' : `${d.batteryPercent}%${d.isCharging === null ? '' : d.isCharging ? ' · charging' : ' · not charging'}`}
                </Row>
                <Row label="App version">{d.appVersion ?? 'not reported'}</Row>
              </dl>

              {d.isCharging === false && d.batteryPercent !== null && d.batteryPercent < BATTERY_WARN_PERCENT && (
                <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <strong>Not charging.</strong> At {d.batteryPercent}% and no power, this tablet stops before the shift ends. Plug it in.
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => open({ kind: 'rename', device: d })}>
                  Rename
                </Button>
                <Button variant="ghost" onClick={() => open({ kind: 'retire', device: d })}>
                  Retire…
                </Button>
              </div>
            </Card>
          ))}

          {retired.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Retired</div>
              <div className="flex flex-col gap-2">
                {retired.map((d) => (
                  <Card key={d.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-700">{d.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {d.revokedReason ? d.revokedReason : 'No reason given'}
                        </div>
                      </div>
                      <StatusBadge>Retired</StatusBadge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <SlideOver
        open={panel !== null}
        onClose={close}
        title={panel?.kind === 'pair' ? 'Pair a tablet' : panel?.kind === 'rename' ? 'Rename tablet' : panel?.kind === 'retire' ? `Retire ${panel.device.name}` : ''}
      >
        <div className="flex flex-col gap-4 p-4">
          {panel?.kind === 'pair' && (
            <>
              {paired ? (
                <p role="status" className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-900">
                  {paired} is paired. The tablet will pick this up within a few seconds.
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  Enter the code shown on the tablet. It works once and expires ten minutes after the tablet asked for it.
                </p>
              )}
              <Input
                label="Code on the tablet"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="4K7P-92"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-widest"
              />
              <Input label="Name this tablet" value={name} onChange={(e) => setName(e.target.value)} placeholder="GATE-01" maxLength={40} />
            </>
          )}

          {panel?.kind === 'rename' && (
            <Input label="New name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          )}

          {panel?.kind === 'retire' && (
            <>
              <p className="text-sm text-slate-600">
                {panel.device.name} stops working the next time it contacts the server, and wipes its employee list. Punches it has
                already saved are <strong>still counted</strong> when it reconnects.
              </p>
              <Input label="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lost, replaced, broken…" maxLength={200} />
            </>
          )}

          {error && (
            <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {panel?.kind === 'retire' ? (
              <Button variant="danger" onClick={submit} loading={isPending}>
                Retire this tablet
              </Button>
            ) : (
              <Button
                onClick={submit}
                loading={isPending}
                disabled={panel?.kind === 'pair' ? !code.trim() || !name.trim() : !name.trim()}
              >
                {panel?.kind === 'pair' ? 'Pair tablet' : 'Save name'}
              </Button>
            )}
            <Button variant="ghost" onClick={close}>
              {paired ? 'Done' : 'Cancel'}
            </Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
