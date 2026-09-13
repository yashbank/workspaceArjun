# Building a master screen

Nine master screens are built from one component. If you are writing new
component code for a master, stop — you are probably duplicating something.

## The three props that matter

`columns` — what the list shows. `fields` — what the slide-over edits.
`onSave` — where the form goes. Everything else has a sensible default.

```tsx
const columns: Column<Department>[] = [
  { key: 'name',   header: t('masters.department.name'), render: (r) => r.name },
  { key: 'nameHi', header: t('common.nameHi'),           render: (r) => r.nameHi ?? '—', hideOnMobile: true },
];

const fields: MasterField[] = [
  { key: 'name',   label: t('masters.department.name'), type: 'text', required: true },
  { key: 'nameHi', label: t('common.nameHi'),           type: 'text' },
];

<MasterTable
  title={t('masters.department.title')}
  columns={columns}
  fields={fields}
  rows={rows}
  canWrite={canWrite}          // from checkPermission('masters.write')
  onSearch={(q) => startTransition(() => search(q))}
  onSave={saveDepartment}
  onDelete={deleteDepartment}
  onRestore={restoreDepartment}
/>
```

That is a complete master screen. No bespoke markup.

## Rules that are not negotiable

**Labels are already translated when they reach the component.** `header` and
`label` take strings, and you produce them with `t()`. The component holds no
English, and neither should your config.

**Search is the server's job.** `onSearch` fires debounced; you re-query and
pass new `rows` back down. Never filter the array in the browser — a 500-row
group must not be shipped to a phone to find four rows.

**Delete is soft, always.** `onDelete` sets `deletedAt`; the row reappears
behind *Show deleted* with a Restore button. There is no hard delete in
`master-option.ts` and there should not be one in yours: a job card printed
last year still has to resolve its GSM value next year. An option in use is
deactivated, not removed.

**`+ Add option` must not cost the user their form.** Pass `onAddOption` on a
`select` field; it persists the option and returns the new value, which the
field selects immediately. Anything that navigates away to add a value and
loses a half-filled job card is wrong.

**Write permission is a prop, not a decision.** Resolve it on the server with
`checkPermission('masters.write')` and pass `canWrite`. The component only
stops *drawing* the buttons — your server module must still open with
`requirePermission()`, because hiding a button has never stopped anyone posting
to the endpoint behind it.

**Do not add a prop for one screen.** If a master needs something unusual,
compose around `<MasterTable>`. The one existing concession is `leading`, for a
status dot, because that is layout rather than behaviour.

## The server side

Every module in `server/mis/` opens with `requirePermission()` and closes with
`logAuditEvent()`. `master-option.ts` is the worked example — copy its shape.

For anything that is just a dropdown (GSM, SIZE, SUBSTRATE, COATING, COLOUR,
UNIT, ITEM_TYPE) you do not need a new table or a new module at all: add the
group to `lib/mis/master-groups.ts` and use `listOptions(group)`. An eighth
group is a constant and a row, not a migration.

## Mobile

360px is the design width. `<DataTable>` becomes a card list below `md`; it
never scrolls sideways. Test there first — a layout that works at 360 works
everywhere, and the reverse is not true.
