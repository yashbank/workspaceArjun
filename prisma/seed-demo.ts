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

  console.log('\nDemo seed complete! Open http://localhost:3000 to see the populated workspace.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
