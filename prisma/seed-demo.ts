/**
 * Demo seed script — populates the workspace with realistic sample data
 * for screenshots, walkthroughs, and client demos.
 *
 * Usage:   pnpm demo:seed
 * Reset:   pnpm demo:reset  (clears all data, re-seeds settings, then seeds demo data)
 *
 * Safe: only runs locally (checks for ALLOW_BOOTSTRAP=true as a guard).
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.ALLOW_BOOTSTRAP !== 'true') {
  console.error('Demo seed is only allowed when ALLOW_BOOTSTRAP=true (local dev only).');
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';
const isRemote =
  !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter });

const DEMO_FOLDERS = [
  { name: 'Client Designs', children: ['Brand Kit', 'Packaging', 'Social Media'] },
  { name: 'Invoices', children: ['2024', '2025'] },
  { name: 'Contracts & Legal', children: [] },
  { name: 'Marketing Assets', children: ['Brochures', 'Banners'] },
  { name: 'Internal', children: ['Meeting Notes', 'SOPs'] },
];

const DEMO_FILES: Array<{
  name: string;
  folder: string;
  mimeType: string;
  sizeBytes: number;
}> = [
  { name: 'Brand Guidelines v3.pdf', folder: 'Brand Kit', mimeType: 'application/pdf', sizeBytes: 4_200_000 },
  { name: 'Logo Final.cdr', folder: 'Brand Kit', mimeType: 'application/octet-stream', sizeBytes: 18_500_000 },
  { name: 'Logo Variant A.ai', folder: 'Brand Kit', mimeType: 'application/postscript', sizeBytes: 12_300_000 },
  { name: 'Product Box Design.cdr', folder: 'Packaging', mimeType: 'application/octet-stream', sizeBytes: 24_700_000 },
  { name: 'Label Template.pdf', folder: 'Packaging', mimeType: 'application/pdf', sizeBytes: 1_800_000 },
  { name: 'Instagram Post — Diwali.psd', folder: 'Social Media', mimeType: 'image/vnd.adobe.photoshop', sizeBytes: 35_000_000 },
  { name: 'Facebook Cover.png', folder: 'Social Media', mimeType: 'image/png', sizeBytes: 890_000 },
  { name: 'Invoice #1024.pdf', folder: '2024', mimeType: 'application/pdf', sizeBytes: 420_000 },
  { name: 'Invoice #1025.pdf', folder: '2024', mimeType: 'application/pdf', sizeBytes: 385_000 },
  { name: 'Invoice #2001.pdf', folder: '2025', mimeType: 'application/pdf', sizeBytes: 510_000 },
  { name: 'Service Agreement.pdf', folder: 'Contracts & Legal', mimeType: 'application/pdf', sizeBytes: 1_200_000 },
  { name: 'NDA — Vendor.pdf', folder: 'Contracts & Legal', mimeType: 'application/pdf', sizeBytes: 780_000 },
  { name: 'Product Brochure v2.pdf', folder: 'Brochures', mimeType: 'application/pdf', sizeBytes: 6_500_000 },
  { name: 'Event Banner.eps', folder: 'Banners', mimeType: 'application/postscript', sizeBytes: 9_200_000 },
  { name: 'SOP — File Naming.pdf', folder: 'SOPs', mimeType: 'application/pdf', sizeBytes: 320_000 },
  { name: 'Meeting Notes — April.pdf', folder: 'Meeting Notes', mimeType: 'application/pdf', sizeBytes: 150_000 },
];

async function main() {
  const owner = await prisma.userProfile.findFirst({ where: { role: 'owner' } });
  if (!owner) {
    console.error('No owner profile found. Log in first to create the admin account.');
    process.exit(1);
  }

  console.log(`Seeding demo data for user: ${owner.email}`);

  const folderMap = new Map<string, string>();

  for (const def of DEMO_FOLDERS) {
    const parent = await prisma.folder.create({
      data: { name: def.name, ownerId: owner.id },
    });
    folderMap.set(def.name, parent.id);

    for (const childName of def.children) {
      const child = await prisma.folder.create({
        data: { name: childName, parentId: parent.id, ownerId: owner.id },
      });
      folderMap.set(childName, child.id);
    }
  }
  console.log(`Created ${folderMap.size} folders.`);

  let totalBytes = 0;
  const fileIds: string[] = [];

  for (const fileDef of DEMO_FILES) {
    const folderId = folderMap.get(fileDef.folder);
    if (!folderId) {
      console.warn(`Folder "${fileDef.folder}" not found, skipping ${fileDef.name}`);
      continue;
    }

    const file = await prisma.file.create({
      data: {
        name: fileDef.name,
        mimeType: fileDef.mimeType,
        folderId,
        ownerId: owner.id,
      },
    });

    const version = await prisma.fileVersion.create({
      data: {
        fileId: file.id,
        versionNo: 1,
        sizeBytes: BigInt(fileDef.sizeBytes),
        storageKey: `files/${file.id}/v1/${fileDef.name}`,
        uploadedBy: owner.id,
      },
    });

    await prisma.file.update({
      where: { id: file.id },
      data: { currentVersionId: version.id },
    });

    totalBytes += fileDef.sizeBytes;
    fileIds.push(file.id);
  }
  console.log(`Created ${fileIds.length} files.`);

  // Add a second version to a couple of files for demo
  const multiVersionFiles = fileIds.slice(0, 3);
  for (const fileId of multiVersionFiles) {
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) continue;

    const v2 = await prisma.fileVersion.create({
      data: {
        fileId,
        versionNo: 2,
        sizeBytes: BigInt(Math.floor(Math.random() * 5_000_000) + 1_000_000),
        storageKey: `files/${fileId}/v2/${file.name}`,
        uploadedBy: owner.id,
        note: 'Updated after client review',
      },
    });

    await prisma.file.update({
      where: { id: fileId },
      data: { currentVersionId: v2.id },
    });
    totalBytes += Number(v2.sizeBytes);
  }
  console.log('Added version history to sample files.');

  // Star a few files
  const starredFiles = fileIds.slice(0, 4);
  for (const targetId of starredFiles) {
    await prisma.favorite.create({
      data: { userId: owner.id, targetType: 'file', targetId },
    });
  }
  console.log(`Starred ${starredFiles.length} files.`);

  // Update storage usage
  await prisma.storageUsage.updateMany({
    data: { totalBytes: BigInt(totalBytes), fileCount: fileIds.length },
  });

  // Create audit trail
  const actions: Array<{ action: string; targetType: string; meta: Record<string, unknown> }> = [
    { action: 'login.success', targetType: 'user', meta: {} },
    { action: 'folder.create', targetType: 'folder', meta: { name: 'Client Designs' } },
    { action: 'file.upload', targetType: 'file', meta: { name: 'Brand Guidelines v3.pdf' } },
    { action: 'file.upload', targetType: 'file', meta: { name: 'Logo Final.cdr' } },
    { action: 'version.upload', targetType: 'file', meta: { name: 'Logo Final.cdr', versionNo: 2 } },
    { action: 'file.upload', targetType: 'file', meta: { name: 'Product Box Design.cdr' } },
    { action: 'folder.create', targetType: 'folder', meta: { name: 'Invoices' } },
    { action: 'file.download', targetType: 'file', meta: { name: 'Brand Guidelines v3.pdf' } },
    { action: 'settings.change', targetType: 'workspace', meta: { fields: ['file_size_cap_bytes'] } },
  ];

  const now = Date.now();
  for (let i = 0; i < actions.length; i++) {
    await prisma.auditEvent.create({
      data: {
        actorId: owner.id,
        role: owner.role,
        action: actions[i].action,
        targetType: actions[i].targetType,
        meta: actions[i].meta as Prisma.InputJsonValue,
        createdAt: new Date(now - (actions.length - i) * 3_600_000),
      },
    });
  }
  console.log(`Created ${actions.length} audit events.`);

  await seedMis(owner.id);

  console.log('\nDemo seed complete! Open http://localhost:3000 to see the populated workspace.');
}

// ─── MIS DEMO DATA ───────────────────────────────────────────────────────────
async function seedMis(ownerId: string) {
  // Departments
  const depts = await Promise.all([
    prisma.misDepartment.upsert({ where: { code: 'PROD' }, update: {}, create: { code: 'PROD', name: 'Production', nameHi: 'उत्पादन', sortOrder: 1 } }),
    prisma.misDepartment.upsert({ where: { code: 'STORE' }, update: {}, create: { code: 'STORE', name: 'Store', nameHi: 'स्टोर', sortOrder: 2 } }),
    prisma.misDepartment.upsert({ where: { code: 'QC' }, update: {}, create: { code: 'QC', name: 'Quality Control', nameHi: 'गुणवत्ता नियंत्रण', sortOrder: 3 } }),
    prisma.misDepartment.upsert({ where: { code: 'MGMT' }, update: {}, create: { code: 'MGMT', name: 'Management', sortOrder: 4 } }),
  ]);
  console.log(`Created ${depts.length} MIS departments`);

  // Machines
  const machines = await Promise.all([
    prisma.misMachine.upsert({ where: { code: 'M-01' }, update: {}, create: { code: 'M-01', name: 'Offset Press A', departmentId: depts[0].id, machineType: 'OFFSET', capacityPerDay: 500 } }),
    prisma.misMachine.upsert({ where: { code: 'M-02' }, update: {}, create: { code: 'M-02', name: 'Flexo Press B', departmentId: depts[0].id, machineType: 'FLEXO', capacityPerDay: 800 } }),
    prisma.misMachine.upsert({ where: { code: 'M-03' }, update: {}, create: { code: 'M-03', name: 'Die Cutter', departmentId: depts[0].id, machineType: 'DIE_CUT', capacityPerDay: 1200 } }),
  ]);
  console.log(`Created ${machines.length} MIS machines`);

  // Employees
  const employees = await Promise.all([
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-001' }, update: {}, create: { employeeCode: 'EMP-001', name: 'Arjun Bhaskar', role: 'OWNER', departmentId: depts[3].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-002' }, update: {}, create: { employeeCode: 'EMP-002', name: 'Rajan Sharma', role: 'ADMIN', departmentId: depts[0].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-003' }, update: {}, create: { employeeCode: 'EMP-003', name: 'Mohan Tiwari', role: 'STORE_GUY', departmentId: depts[1].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-004' }, update: {}, create: { employeeCode: 'EMP-004', name: 'Priya Gupta', role: 'QC', departmentId: depts[2].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-005' }, update: {}, create: { employeeCode: 'EMP-005', name: 'Suresh Kumar', role: 'WORKER', departmentId: depts[0].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-006' }, update: {}, create: { employeeCode: 'EMP-006', name: 'Deepak Yadav', role: 'WORKER', departmentId: depts[0].id } }),
    prisma.misEmployee.upsert({ where: { employeeCode: 'EMP-007' }, update: {}, create: { employeeCode: 'EMP-007', name: 'Kavita Singh', role: 'SUPERVISOR', departmentId: depts[0].id } }),
  ]);
  console.log(`Created ${employees.length} MIS employees`);

  // Items
  const items = await Promise.all([
    prisma.misItem.upsert({ where: { code: 'ITM-001' }, update: {}, create: { code: 'ITM-001', name: 'Art Paper 90 GSM', category: 'RAW_MATERIAL', gsm: '90', unit: 'KG', pricePerUnit: 85, reorderLevel: 500 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-002' }, update: {}, create: { code: 'ITM-002', name: 'Art Paper 120 GSM', category: 'RAW_MATERIAL', gsm: '120', unit: 'KG', pricePerUnit: 110, reorderLevel: 300 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-003' }, update: {}, create: { code: 'ITM-003', name: 'Kraft Paper Board', category: 'RAW_MATERIAL', unit: 'KG', pricePerUnit: 65, reorderLevel: 1000 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-004' }, update: {}, create: { code: 'ITM-004', name: 'BOPP Film Clear', category: 'CONSUMABLE', unit: 'KG', pricePerUnit: 180, reorderLevel: 200 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-005' }, update: {}, create: { code: 'ITM-005', name: 'Flexo Ink Black', category: 'CONSUMABLE', unit: 'KG', pricePerUnit: 320, reorderLevel: 50 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-006' }, update: {}, create: { code: 'ITM-006', name: 'Flexo Ink Cyan', category: 'CONSUMABLE', unit: 'KG', pricePerUnit: 380, reorderLevel: 50 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-007' }, update: {}, create: { code: 'ITM-007', name: 'Corrugation Glue', category: 'CONSUMABLE', unit: 'KG', pricePerUnit: 45, reorderLevel: 200 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-008' }, update: {}, create: { code: 'ITM-008', name: 'Packaging Tape 48mm', category: 'CONSUMABLE', unit: 'PIECE', pricePerUnit: 35, reorderLevel: 500 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-009' }, update: {}, create: { code: 'ITM-009', name: 'Printed Box — Model A', category: 'OTHER', unit: 'PIECE', pricePerUnit: 12, reorderLevel: 2000 } }),
    prisma.misItem.upsert({ where: { code: 'ITM-010' }, update: {}, create: { code: 'ITM-010', name: 'Die Board 4mm', category: 'EQUIPMENT', unit: 'PIECE', pricePerUnit: 1200, reorderLevel: 5 } }),
  ]);
  console.log(`Created ${items.length} MIS items`);

  // Inventory ledger opening balances + store transactions
  const txns: Array<{ code: string; itemIdx: number; qty: number; balance: number }> = [
    { code: 'STN-001', itemIdx: 0, qty: 1200, balance: 1200 },
    { code: 'STN-002', itemIdx: 1, qty: 600, balance: 600 },
    { code: 'STN-003', itemIdx: 2, qty: 2500, balance: 2500 },
    { code: 'STN-004', itemIdx: 3, qty: 350, balance: 350 },
    { code: 'STN-005', itemIdx: 4, qty: 120, balance: 120 },
    { code: 'STN-006', itemIdx: 5, qty: 80, balance: 80 },
    { code: 'STN-007', itemIdx: 6, qty: 450, balance: 450 },
    { code: 'STN-008', itemIdx: 7, qty: 1500, balance: 1500 },
    { code: 'STN-009', itemIdx: 8, qty: 8000, balance: 8000 },
    { code: 'STN-010', itemIdx: 9, qty: 12, balance: 12 },
  ];

  for (const t of txns) {
    const item = items[t.itemIdx];
    await prisma.misInventoryLedger.create({
      data: {
        itemId: item.id,
        changeQty: t.qty,
        balanceQty: t.balance,
        source: 'OPENING_BALANCE',
        notes: 'Demo opening stock',
      },
    });
    await prisma.misStoreTransaction.upsert({
      where: { txnNumber: t.code },
      update: {},
      create: {
        txnNumber: t.code,
        itemId: item.id,
        type: 'IN',
        quantity: t.qty,
        balanceQty: t.balance,
        referenceNo: 'OPENING',
        reason: 'Demo opening stock',
        createdById: ownerId,
      },
    });
  }
  console.log('Created MIS inventory opening balances');

  // Customer + Supplier
  const customer = await prisma.misCustomer.upsert({
    where: { code: 'CUST-001' },
    update: {},
    create: { code: 'CUST-001', name: 'Hindustan Unilever Ltd', phone: '9876543210', city: 'Mumbai', gstNo: '27AAACH1011A1ZK' },
  });
  const supplier = await prisma.misSupplier.upsert({
    where: { code: 'SUP-001' },
    update: {},
    create: { code: 'SUP-001', name: 'Star Paper Mills', phone: '9123456789', city: 'Ahmedabad', gstNo: '24AAACS6588M1ZP', paymentTermsDays: 30 },
  });
  console.log('Created MIS customer & supplier');

  // Purchase Order
  const po = await prisma.misPurchaseOrder.upsert({
    where: { poNumber: 'PO-2025-001' },
    update: {},
    create: {
      poNumber: 'PO-2025-001',
      supplierId: supplier.id,
      status: 'RECEIVED',
      notes: 'Demo purchase order for Art Paper',
    },
  });
  const poItem = await prisma.misPoItem.create({
    data: {
      poId: po.id,
      itemId: items[0].id,
      description: 'Art Paper 90 GSM',
      quantity: 2000,
      ratePerUnit: 85,
      receivedQuantity: 2000,
    },
  });

  // GRN
  const grn = await prisma.misGrn.upsert({
    where: { grnNumber: 'GRN-2025-001' },
    update: {},
    create: {
      grnNumber: 'GRN-2025-001',
      poId: po.id,
      status: 'ACCEPTED',
      receivedAt: new Date(),
      notes: 'Received in good condition',
    },
  });
  await prisma.misGrnItem.create({
    data: {
      grnId: grn.id,
      poItemId: poItem.id,
      receivedQty: 2000,
      type: 'GENERAL',
      batchNo: 'BATCH-2025-01',
    },
  });
  console.log('Created MIS PO + GRN');

  // Processes
  const processes = await Promise.all([
    prisma.misProcess.upsert({ where: { code: 'PROC-PRINT' }, update: {}, create: { code: 'PROC-PRINT', name: 'Printing', nameHi: 'प्रिंटिंग', departmentId: depts[0].id, standardTimeMinutes: 60, sortOrder: 1 } }),
    prisma.misProcess.upsert({ where: { code: 'PROC-DIE' }, update: {}, create: { code: 'PROC-DIE', name: 'Die Cutting', departmentId: depts[0].id, standardTimeMinutes: 45, sortOrder: 2 } }),
    prisma.misProcess.upsert({ where: { code: 'PROC-FOLD' }, update: {}, create: { code: 'PROC-FOLD', name: 'Folding & Gluing', departmentId: depts[0].id, standardTimeMinutes: 30, sortOrder: 3 } }),
    prisma.misProcess.upsert({ where: { code: 'PROC-QC' }, update: {}, create: { code: 'PROC-QC', name: 'Quality Inspection', departmentId: depts[2].id, standardTimeMinutes: 20, sortOrder: 4 } }),
  ]);

  // Production Order + BOM
  const order = await prisma.misOrder.upsert({
    where: { orderNumber: 'ORD-2025-001' },
    update: {},
    create: {
      orderNumber: 'ORD-2025-001',
      customerId: customer.id,
      status: 'IN_PROGRESS',
      description: 'HUL Soap Box — 10,000 pcs',
      deliveryDate: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });

  const bom = await prisma.misBom.create({
    data: {
      orderId: order.id,
      bomNumber: 'BOM-2025-001',
      description: 'BOM for HUL Soap Box',
      status: 'APPROVED',
    },
  });

  // BOM stages
  const stages = await Promise.all(
    processes.map((proc, i) =>
      prisma.misBomStage.create({
        data: {
          bomId: bom.id,
          processId: proc.id,
          stageNo: i + 1,
          plannedQty: 10000,
          completedQty: i < 2 ? 10000 : 0,
          status: i < 2 ? 'DONE' : 'PENDING',
        },
      })
    )
  );

  // BOM materials
  await Promise.all([
    prisma.misBomMaterial.create({ data: { bomId: bom.id, itemId: items[1].id, requiredQty: 500, issuedQty: 500, unit: 'KG' } }),
    prisma.misBomMaterial.create({ data: { bomId: bom.id, itemId: items[4].id, requiredQty: 20, issuedQty: 15, unit: 'KG' } }),
    prisma.misBomMaterial.create({ data: { bomId: bom.id, itemId: items[6].id, requiredQty: 80, issuedQty: 80, unit: 'KG' } }),
  ]);
  console.log('Created MIS Order + BOM with stages & materials');

  // Business rules defaults
  const rules = [
    { key: 'over_issue_threshold_pct', value: '10', label: 'Over-issue threshold %' },
    { key: 'reorder_alert_enabled', value: 'true', label: 'Reorder alerts enabled' },
    { key: 'attendance_grace_minutes', value: '15', label: 'Attendance grace minutes' },
    { key: 'shift_start_time', value: '08:00', label: 'Default shift start' },
    { key: 'shift_end_time', value: '17:00', label: 'Default shift end' },
  ];
  for (const r of rules) {
    await prisma.misBusinessRule.upsert({
      where: { key: r.key },
      update: {},
      create: { key: r.key, value: r.value, label: r.label },
    });
  }
  console.log('Created MIS business rules');

  // Sample attendance (last 3 days for all workers)
  const workers = employees.filter(e => ['WORKER', 'SUPERVISOR', 'STORE_GUY', 'QC'].includes(e.role));
  for (let d = 0; d < 3; d++) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);
    for (const emp of workers) {
      const existing = await prisma.misAttendance.findFirst({ where: { employeeId: emp.id, date } });
      if (!existing) {
        await prisma.misAttendance.create({
          data: {
            employeeId: emp.id,
            date,
            status: Math.random() > 0.15 ? 'PRESENT' : 'ABSENT',
            inTime: new Date(date.getTime() + 8 * 3600_000),
            outTime: new Date(date.getTime() + 17 * 3600_000),
          },
        });
      }
    }
  }
  console.log('Created MIS attendance records');
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
