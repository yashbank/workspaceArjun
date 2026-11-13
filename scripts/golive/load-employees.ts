/**
 * Phase 5 go-live: load cleaned shifts, departments and kiosk employees. DRY RUN by default.
 *
 *   pnpm golive:load                                  # dry run
 *   CONFIRM_WIPE=1 pnpm golive:load -- --execute      # real run, one transaction
 *
 * Input: data/golive/cleaned-{shifts,employees}.json (from `pnpm golive:clean`). Idempotent.
 *  - shifts: matched by case-insensitive name; created if missing. A time CHANGE to an existing shift is reported and
 *    refused unless ALLOW_SHIFT_TIME_CHANGE=1 (it re-times every employee on that shift).
 *  - departments: matched by case-insensitive name; created if missing (code = upper snake of name).
 *  - employees: new rows (role WORKER, active) are created; existing rows get name, department, defaultShift only -
 *    role, isActive and deletedAt are never changed. Existing employees referenced by MisProductionLog /
 *    MisWorkerAllocation / MisJobPhase.inCharge, or linked to a user, are SKIPPED (listed). A code that already
 *    belongs to a DIFFERENT person refuses --execute outright. Designation has no column: not loaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './_gate';
import { departmentCode, matchKey, normaliseText, resolveShiftName } from '../../src/lib/mis/golive-clean';

type CShift = { name: string; startTime: string; endTime: string };
type CEmp = { employeeCode: string; name: string; designation: string | null; department: string | null; shift: string | null };
const dir = path.join(__dirname, '..', '..', 'data', 'golive');
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

async function main() {
  const { prisma, execute } = openDb();
  const shifts = read<CShift[]>('cleaned-shifts.json');
  const emps = read<CEmp[]>('cleaned-employees.json');
  const codes = emps.map((e) => normaliseText(e.employeeCode).toUpperCase());
  if (new Set(codes).size !== codes.length) throw new Error('duplicate employee codes in cleaned file');
  for (const s of shifts) if (s.startTime === s.endTime) throw new Error(`shift ${s.name}: start == end`);

  const dbShifts = await prisma.misShift.findMany();
  const dbDepts = await prisma.misDepartment.findMany();
  const dbEmps = await prisma.misEmployee.findMany();
  const [alloc, prodLog, phase] = await Promise.all([
    prisma.misWorkerAllocation.findMany({ select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.misProductionLog.findMany({ where: { employeeId: { not: null } }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.misJobPhase.findMany({ where: { inChargeEmployeeId: { not: null } }, select: { inChargeEmployeeId: true }, distinct: ['inChargeEmployeeId'] }),
  ]);
  const referenced = new Set<string>([...alloc.map((a) => a.employeeId), ...prodLog.map((a) => a.employeeId!), ...phase.map((a) => a.inChargeEmployeeId!)]);
  const isProtected = (e: { id: string; userProfileId: string | null }) => referenced.has(e.id) || !!e.userProfileId;
  const shiftByKey = new Map(dbShifts.map((s) => [matchKey(s.name), s]));
  const deptByKey = new Map(dbDepts.map((d) => [matchKey(d.name), d]));
  const empByCode = new Map(dbEmps.map((e) => [e.employeeCode, e]));
  const deptCodes = new Set(dbDepts.map((d) => d.code));

  const shiftsNew = shifts.filter((s) => !shiftByKey.has(matchKey(s.name)));
  const shiftsChanged = shifts.filter((s) => { const d = shiftByKey.get(matchKey(s.name)); return d && (d.startTime !== s.startTime || d.endTime !== s.endTime); });
  const deptNames = [...new Map(emps.filter((e) => e.department).map((e) => [matchKey(e.department), normaliseText(e.department)])).entries()];
  const deptsNew = deptNames.filter(([k]) => !deptByKey.has(k));
  const empsNew = emps.filter((e) => !empByCode.has(normaliseText(e.employeeCode).toUpperCase()));
  const unresolved = emps.filter((e) => e.shift && !resolveShiftName(e.shift, shifts.map((s) => s.name)));
  const existingOf = (e: CEmp) => empByCode.get(normaliseText(e.employeeCode).toUpperCase());
  const skippedProtected = emps.filter((e) => { const x = existingOf(e); return x && isProtected(x); });
  const toUpdate = emps.filter((e) => { const x = existingOf(e); return x && !isProtected(x); });

  console.log(execute ? 'WILL apply:' : 'WOULD apply:');
  console.log(`  shifts   create ${shiftsNew.length} (${shiftsNew.map((s) => s.name).join(', ') || '-'}), update times ${shiftsChanged.length} (${shiftsChanged.map((s) => `${s.name} ${shiftByKey.get(matchKey(s.name))!.startTime}-${shiftByKey.get(matchKey(s.name))!.endTime} -> ${s.startTime}-${s.endTime}`).join('; ') || '-'}), unchanged ${shifts.length - shiftsNew.length - shiftsChanged.length}`);
  console.log(`  departments create ${deptsNew.length} (${deptsNew.map(([, n]) => n).join(', ') || '-'}), existing ${deptNames.length - deptsNew.length}`);
  console.log(`  employees create ${empsNew.length}, update ${toUpdate.length}, SKIPPED protected (production-referenced or user-linked) ${skippedProtected.length}, total in file ${emps.length}`);
  const collisions = emps.filter((e) => { const x = empByCode.get(normaliseText(e.employeeCode).toUpperCase()); return x && matchKey(x.name) !== matchKey(e.name); });
  for (const e of skippedProtected) { const x = existingOf(e)!; console.log(`    skip ${x.employeeCode} ${x.name}: ${[x.userProfileId && 'user-linked', referenced.has(x.id) && 'production-referenced'].filter(Boolean).join(', ')}`); }
  console.log(`  CODE COLLISIONS (existing code, different person; update would rename history): ${collisions.length}`);
  for (const e of collisions) console.log(`    ${e.employeeCode}: DB '${empByCode.get(normaliseText(e.employeeCode).toUpperCase())!.name}' -> file '${e.name}'`);
  if (shiftsChanged.length) console.log(`  SHIFT TIME CHANGE: ${shiftsChanged.map((s) => `${s.name} ${shiftByKey.get(matchKey(s.name))!.startTime}-${shiftByKey.get(matchKey(s.name))!.endTime} -> ${s.startTime}-${s.endTime}`).join('; ')} (needs ALLOW_SHIFT_TIME_CHANGE=1 to execute)`);
  console.log(`  employees with unresolved shift: ${unresolved.length}`);
  console.log(`  existing DB employees NOT in file (untouched): ${dbEmps.filter((e) => !codes.includes(e.employeeCode)).length}`);

  if (!execute) {
    console.log('\nDRY RUN only. Nothing changed.');
    await prisma.$disconnect();
    return;
  }

  if (collisions.length) {
    console.error(`REFUSING: ${collisions.length} employee code(s) already belong to a different person. Resolve (e.g. run the wipe first); there is no override.`);
    process.exit(1);
  }
  if (shiftsChanged.length && process.env.ALLOW_SHIFT_TIME_CHANGE !== '1') {
    console.error('REFUSING: shift time change(s) above would re-time existing employees. Set ALLOW_SHIFT_TIME_CHANGE=1 to apply them.');
    process.exit(1);
  }
  await prisma.$transaction(
    async (tx) => {
      const sMap = new Map(dbShifts.map((s) => [matchKey(s.name), s.id]));
      for (const s of shifts) {
        const k = matchKey(s.name);
        const ex = shiftByKey.get(k);
        if (ex) {
          if (ex.startTime !== s.startTime || ex.endTime !== s.endTime) await tx.misShift.update({ where: { id: ex.id }, data: { startTime: s.startTime, endTime: s.endTime } });
        } else {
          sMap.set(k, (await tx.misShift.create({ data: { name: s.name, startTime: s.startTime, endTime: s.endTime } })).id);
        }
      }
      const dMap = new Map(dbDepts.map((d) => [matchKey(d.name), d.id]));
      let sort = dbDepts.length;
      for (const [k, name] of deptsNew) {
        let code = departmentCode(name);
        for (let i = 2; deptCodes.has(code); i++) code = `${departmentCode(name)}_${i}`;
        deptCodes.add(code);
        dMap.set(k, (await tx.misDepartment.create({ data: { code, name, sortOrder: ++sort } })).id);
      }
      const now = new Date();
      for (const e of emps) {
        const code = normaliseText(e.employeeCode).toUpperCase();
        const shiftName = resolveShiftName(e.shift, shifts.map((s) => s.name));
        const defaultShiftId = shiftName ? sMap.get(matchKey(shiftName)) ?? null : null;
        const departmentId = e.department ? dMap.get(matchKey(e.department)) ?? null : null;
        const ex = empByCode.get(code);
        const common = { name: normaliseText(e.name), departmentId, defaultShiftId, updatedAt: now };
        if (ex) {
          if (!isProtected(ex)) await tx.misEmployee.update({ where: { id: ex.id }, data: common }); // role / isActive / deletedAt untouched
        } else await tx.misEmployee.create({ data: { ...common, isActive: true, employeeCode: code, role: 'WORKER' } });
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  console.log('Load complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
