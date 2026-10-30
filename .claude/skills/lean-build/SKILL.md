---
name: lean-build
description: Build a small new behaviour (a setting, a column, a button, a server rule, a card) in the Bhaskar MIS with the least new code — reuse the existing component, server module and test fixture, keep the route→server→data layering, and ship with one test. Use for enhancement tickets, "add X" requests and the FE/BE half of a feature that fits in one session.
---

# lean-build

1. **Find the twin.** Something like it already exists: `grep -rn "<similar label or key>" src`.
   Copy its shape (server function with `requirePermission` + `logAuditEvent`, thin route or
   server action in `src/app/(mis)/mis/**/actions.ts`, screen in `src/components/mis/<area>/`).
2. **Where it goes**: pure logic `src/lib/mis/` (no Prisma/React) · DB + permissions + money
   `src/server/mis/` · pages `src/app/(mis)/` · UI `src/components/mis/` · kit components
   `src/components/mis/kit/` (Button, Input, Select, SlideOver, StatusBadge, Card). No new UI
   primitives, no new hex colours; 44px tap targets (`min-h-11`), 48px inputs (`min-h-12`),
   16px text (`text-base`).
3. **Permissions**: pick the existing action from `src/lib/mis/permissions.ts`; never add a role
   check in a component. Navigation entries live in `src/server/mis/navigation.ts` and are
   pinned by `navigation.test.ts` — add the id there with a ticket comment.
4. **Settings/rules**: a new business rule is a DB row (`MisBusinessRule`), validated in
   `business-rules.ts assertRuleValueValid`, read via `getRuleValue`; enumerated values get a
   `<select>` in `settings-screen.tsx` RuleRow and `desktop/rules-change-form.tsx`.
5. **Data**: additive schema only, through `mis-schema-gate`; list queries filter
   `deletedAt: null`; dates are factory dates (`src/lib/mis/factory-time.ts`).
6. **One test** at the layer that holds the logic (server test with the domain fixture, or a
   small render test with `@testing-library/react` — `fireEvent`, there is no user-event).
7. Gate with `verify-and-stop`.
