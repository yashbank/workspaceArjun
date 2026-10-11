# BPP Factory MIS — Feature Specification & Architecture Handover (v2.0)

> **Document Type:** Production Feature Spec & Engineering Handover  
> **Target Audience:** Engineering Team / AI Autonomous Agents / QA  
> **Project:** Bhaskar Paper Products (BPP) Factory MIS (`Workspace Arjun - Live Project/Arjun/app`)  
> **Base Commit / Branch:** `main` (`0f53b28`) / `phase-a`  
> **Compliance & Guardrails:** Zero regression on existing 4,432 test suite; strict Money Isolation (Owner-only); GiST exclusion constraints; additive-only schema migrations.

---

## 1. Architectural Principles & Boundary Invariants

1. **Path Isolation**: All MIS files MUST reside in designated `mis` path segments:
   - UI / App Router: `src/app/(mis)/mis/...`
   - Presentation: `src/components/mis/...`
   - Pure Domain Libs: `src/lib/mis/...` (zero Prisma/React imports)
   - DB / Mutations: `src/server/mis/...`
   - Schema: Additive changes in `prisma/schema.prisma` mapping to `mis_*` tables only.
2. **Parallel Identity & Permissions**:
   - Never modify legacy `UserRole` enum.
   - Use `MisRole` (`OWNER`, `ADMIN`, `SUPERVISOR`, `QC`, `ATTENDANCE_OPERATOR`, `SUPER_ATTENDANCE_OPERATOR`, `STORE_GUY`, `WORKER`).
   - Mutations check `requirePermission(action)`. Money fields are stripped via `withoutMoneyFields()`.
3. **Double-Booking & Availability**:
   - Machine allocations maintain GiST exclusion rules.
   - Worker and stock availability must be derived on the fly, never cached into denormalized states that drift.
4. **Zero Legacy Disruption**:
   - Existing file workspace routes `/(dashboard)` and auth `/(auth)` must remain completely untouched.

---

## 2. Comprehensive Requirements Breakdown (7 Core Epics)

### Epic 1: Enhanced GRN & 3-Way Match (PO ↔ GRN ↔ Supplier Invoice)
- **Problem Solved**: Focus ERP parity. Store guy previously recorded invoice details and discrepancies on paper or unstructured notes.
- **Data Model Additions (`MisGrn` & `MisGrnItem`)**:
  - `MisGrn`:
    - `supplierInvoiceNo` (`String?`)
    - `supplierInvoiceDate` (`DateTime?`)
    - `supplierInvoiceAmount` (`Decimal? @db.Decimal(12,2)`) — Owner-only visibility.
    - `lrNumber` (`String?`) — Lorry Receipt number.
    - `vehicleNumber` (`String?`) — Vehicle registration plate.
    - `transporterName` (`String?`)
    - `dcNumber` (`String?`) — Delivery Challan reference.
  - `MisGrnItem`:
    - `dcQuantity` (`Decimal @db.Decimal(12,2)`) — Quantity billed/shipped by vendor on Challan.
    - `receivedQty` (`Decimal @db.Decimal(12,2)`) — Quantity physically accepted.
    - `damageQuantity` (`Decimal @default(0) @db.Decimal(12,2)`) — Damaged units on delivery.
    - `shortQuantity` (`Decimal @default(0) @db.Decimal(12,2)`) — Missing units.
    - *Formula*: `shortQuantity = dcQuantity - (receivedQty + damageQuantity)`.
- **Dedicated 3-Way Match (`MisSupplierInvoice` model)**:
  - Header record tracking PO reference, GRN reference, Invoice No, Billed Amount, Received Amount, Status (`MATCHED`, `DISCREPANCY_QTY`, `DISCREPANCY_PRICE`, `PENDING_REVIEW`).
- **UI & UX**:
  - `mis/grn/new`: 1-Click pick from pending POs (Focus ERP Ctrl+L style). Auto-populates item descriptions and ordered quantity. Auto-calculates Shortage dynamically as user enters DC Qty, Received Qty, and Damage Qty.
  - `mis/supplier-invoices` (or dedicated 3-Way Match tab in PO/GRN): Reconciliation board highlighting variance in amber/red.

---

### Epic 2: Order-Wise Stock Allocation & Capped Material Issuance
- **Problem Solved**: Materials procured against specific customer orders were being arbitrarily drawn for other floor jobs without ceiling tracking.
- **Workflow & Rules**:
  1. When PO is created with `purpose: FOR_ORDER` (linked to `orderId` or `bomRef`), any confirmed GRN against that PO allocates stock to that specific order pool (`allocatedOrderId` on `MisInventoryLedger` / `MisOrderStockAllocation`).
  2. The Supervisor screen displays **Allocated Stock**, **Already Issued**, and **Remaining Available Balance** for that specific order.
  3. **Strict Capping Rule**:
     $$\text{Issued To Date} + \text{Requested Qty} \le \text{Allocated Qty}$$
     Neither Supervisor can request, nor Store Guy can issue, more than the remaining order balance. Attempts to over-issue must throw a typed error: `OrderStockQuotaExceededError`.
- **Data Model Addition (`MisOrderStockAllocation`)**:
  - `id`, `orderId`, `itemId`, `allocatedQty`, `issuedQty`, `createdAt`, `updatedAt`.
  - Atomically updated upon GRN confirmation and Material Issue Note sign-off.

---

### Epic 3: Categorized Material Issue Notes
- **Problem Solved**: Uncontrolled material withdrawals without distinguishing direct production inputs from floor maintenance consumables.
- **Item Categorization**:
  - `MisItemCategory`:
    - `RAW_MATERIAL` (e.g., Paper board, Kraft paper, Duplex board)
    - `CONSUMABLE` (e.g., Printing ink, Lamination gum Pavikol CPW, Varnish)
    - `EQUIPMENT` (e.g., Die plates, Doctor blades, Blanket punch)
    - `OTHERS` (e.g., Machine grease, Cleaning wax, Shopfloor tools)
- **Enforcement Logic**:
  - **Against Order Requirement**: Only `RAW_MATERIAL` and `CONSUMABLE` can be issued against a specific `orderId`.
  - **General Floor Issue**: Items of category `EQUIPMENT` and `OTHERS` are issued as general department overhead (requires `departmentId`, `orderId` is null).
- **Issue Workflow**:
  1. Supervisor raises Material Request: selects running Order (for RM/Consumable) or Department (for Equip/Others), picks item, enters `requestedQty`.
  2. Store receives real-time pending alert.
  3. Store Guy opens request: can enter `actualIssuedQty` where $0 < \text{actualIssuedQty} \le \text{requestedQty}$.
  4. Upon Store confirmation, stock decrements from `MisInventoryLedger` and increments `MisOrderStockAllocation.issuedQty`.

---

### Epic 4: Post-GRN Admin/Owner Alerts & Discrepancies
- **Trigger**: Atomic event upon `confirmGrn()`.
- **Payload**:
  - PO Reference, GRN Reference, Supplier Name.
  - Ordered Qty vs Received Qty.
  - Shortage / Damage flags if `shortQuantity > 0` or `damageQuantity > 0`.
  - Price variance if `supplierInvoiceAmount != (poItem.ratePerUnit * poItem.quantity)`.
- **Target Roles**: `OWNER` (full financials included) and `ADMIN` (quantities and variance percentage, rupee values redacted).
- **Delivery Channels**:
  - Internal MIS In-App Notification / Notification Bar.
  - Audit trail entry with severity `WARNING` if discrepancy exists.

---

### Epic 5: QC Checklist Templates (Preloaded & Custom Builder)
- **Problem Solved**: Digitization of physical clipboards with hourly checks (09:15 to 18:00) across departments.
- **Data Models**:
  - `MisChecklistTemplate`: `id`, `name`, `processId` (FK `MisProcess`), `departmentId`, `isPreloaded` (Boolean), `isActive` (Boolean), `createdById`.
  - `MisChecklistTemplateItem`: `id`, `templateId`, `parameterName`, `standardTolerance`, `sortOrder`, `inputKind` (`BOOLEAN_PASS_FAIL`, `STATUS_BADGE`, `NUMERIC_VALUE`).
  - `MisChecklistEntry`: `id`, `templateId`, `orderId` (FK `MisOrder`), `machineId`, `shiftId`, `date`, `checkedById`, `qcSignature`, `comments`.
  - `MisChecklistEntryCell`: `id`, `entryId`, `itemId`, `hourSlot` (`09:15`, `10:00`, `11:00`, `12:00`, `13:00`, `14:00`, `15:00`, `16:00`, `17:00`, `18:00`), `status` (`PASS`, `FAIL`, `MAKE_READY`, `PLATE_ERR`, `NA`), `numericValue`, `remarks`.
- **Preloaded Seed Templates**:
  1. **Printing Checklist**: Shade Matching with Shade Card, Unwanted Marks/Blanket Punch, Front Lay & Side Lay, Scumming, Registration Out, Set-Off/Powdering.
  2. **Lamination Checklist**: Type of Lamination (Gloss/Matt), Bubbles, Wrinkles, Powder/White Patches, Scratches on Film.
  3. **Lamif Flute Lamination**: Gripper and Side Lay, Moisture, Bubbles, Fiber Tear Test, Sheets Sticking to Each Other.
  4. **Die Cutting Checklist**: Box Dimensions (±0.5mm), Cracking, Burrs/Rough Edges, Clean and Easy Stripping, Punching Out & Embossing Out.
- **Capabilities**:
  - **QC Floor Screen**: Fast touch-screen grid (Pass [✓], Fail [✗], Make-Ready [🔧], Plate Err). Fails alert the on-shift Supervisor.
  - **Template Builder**: Owner and Admin can add, edit parameters, and reorder checks from `/mis/settings/qc-templates`.
  - **Print Layout**: `/mis/print/qc-checklist/[id]` rendering clean A4 paper clone for client audit packs.

---

### Epic 6: Owner Audit Trail & Financial Transparency Verification
- **Verification Mandate**: Verify and reinforce existing `MisAuditLog` coverage across all mutating mutations.
- **Audit Coverage**:
  - PO Creation / Modification / Cancel.
  - GRN Creation / Quantity adjustments / Confirmation.
  - Order Pricing / BOM changes / Material rates.
  - Material Issue Note adjustments.
- **Owner Audit Screen (`/mis/reports/audit-logs`)**:
  - Complete history of actor, entity, action (`CREATE`, `UPDATE`, `DELETE`), timestamp, and JSON diff (`before` vs `after`).
  - Strict Rule: Non-owners accessing the audit log receive sanitized objects with financial amounts redacted.

---

### Epic 7: Employee Photo Registration & Kiosk Face Verification
- **Problem Solved**: Gate attendance kiosk QR badge scanning needs visual verification to prevent proxy punch-ins.
- **Storage & Infrastructure**:
  - Add `photoUrl` (`String?`) to `MisEmployee`.
  - Photos stored securely on S3-compatible IDrive e2 bucket under `/employees/photos/{employeeCode}.webp`.
  - Registration UI (`/mis/employees/new` & edit slide-over): Integrated image upload with client-side thumbnail crop (256x256 WebP).
- **Kiosk API Sync (`/api/mis/kiosk/sync` & `/api/mis/kiosk/punch`)**:
  - Include `photoUrl` in employee payload cached by the Android tablet.
  - Kiosk Verification: When worker scans QR code badge, the tablet screen flashes large photo of employee with Name and Designation for 3 seconds for attendance operator visual confirmation.

---

## 3. Database Schema Blueprint (Prisma Additions)

```prisma
// ==========================================
// 1. EXTENSIONS TO EXISTING MODELS
// ==========================================

// Add to model MisEmployee:
// photoUrl          String?          @map("photo_url")

// Add to model MisItem:
// category          MisItemCategory  @default(RAW_MATERIAL)

enum MisItemCategory {
  RAW_MATERIAL
  CONSUMABLE
  EQUIPMENT
  OTHERS
}

// Add to model MisGrn:
// supplierInvoiceNo     String?   @map("supplier_invoice_no")
// supplierInvoiceDate   DateTime? @map("supplier_invoice_date")
// supplierInvoiceAmount Decimal?  @map("supplier_invoice_amount") @db.Decimal(12,2)
// lrNumber              String?   @map("lr_number")
// vehicleNumber         String?   @map("vehicle_number")
// transporterName       String?   @map("transporter_name")
// dcNumber              String?   @map("dc_number")

// Add to model MisGrnItem:
// dcQuantity      Decimal  @default(0) @map("dc_quantity") @db.Decimal(12,2)
// damageQuantity  Decimal  @default(0) @map("damage_quantity") @db.Decimal(12,2)
// shortQuantity   Decimal  @default(0) @map("short_quantity") @db.Decimal(12,2)

// ==========================================
// 2. NEW MODELS
// ==========================================

model MisOrderStockAllocation {
  id               String   @id @default(uuid()) @db.Uuid
  orderId          String   @map("order_id") @db.Uuid
  itemId           String   @map("item_id") @db.Uuid
  allocatedQty     Decimal  @default(0) @map("allocated_qty") @db.Decimal(12,2)
  issuedQty        Decimal  @default(0) @map("issued_qty") @db.Decimal(12,2)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  order            MisOrder @relation(fields: [orderId], references: [id])
  item             MisItem  @relation(fields: [itemId], references: [id])

  @@unique([orderId, itemId])
  @@map("mis_order_stock_allocations")
}

model MisSupplierInvoice {
  id               String                 @id @default(uuid()) @db.Uuid
  invoiceNo        String                 @map("invoice_no")
  invoiceDate      DateTime               @map("invoice_date")
  supplierId       String                 @map("supplier_id") @db.Uuid
  poId             String?                @map("po_id") @db.Uuid
  grnId            String?                @map("grn_id") @db.Uuid
  billedAmount     Decimal                @map("billed_amount") @db.Decimal(12,2)
  status           MisSupplierMatchStatus @default(PENDING_REVIEW)
  notes            String?
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")

  supplier         MisSupplier            @relation(fields: [supplierId], references: [id])
  po               MisPurchaseOrder?      @relation(fields: [poId], references: [id])
  grn              MisGrn?                @relation(fields: [grnId], references: [id])

  @@unique([supplierId, invoiceNo])
  @@map("mis_supplier_invoices")
}

enum MisSupplierMatchStatus {
  MATCHED
  DISCREPANCY_QTY
  DISCREPANCY_PRICE
  PENDING_REVIEW
}

model MisMaterialIssueNote {
  id               String                   @id @default(uuid()) @db.Uuid
  issueNoteNo      String                   @unique @map("issue_note_no")
  orderId          String?                  @map("order_id") @db.Uuid
  departmentId     String?                  @map("department_id") @db.Uuid
  itemId           String                   @map("item_id") @db.Uuid
  requestedQty     Decimal                  @map("requested_qty") @db.Decimal(12,2)
  issuedQty        Decimal?                 @map("issued_qty") @db.Decimal(12,2)
  requestedById    String                   @map("requested_by_id") @db.Uuid
  issuedById       String?                  @map("issued_by_id") @db.Uuid
  status           MisMaterialIssueStatus   @default(REQUESTED)
  notes            String?
  createdAt        DateTime                 @default(now()) @map("created_at")
  updatedAt        DateTime                 @updatedAt @map("updated_at")

  order            MisOrder?                @relation(fields: [orderId], references: [id])
  department       MisDepartment?           @relation(fields: [departmentId], references: [id])
  item             MisItem                  @relation(fields: [itemId], references: [id])

  @@map("mis_material_issue_notes")
}

enum MisMaterialIssueStatus {
  REQUESTED
  PARTIALLY_ISSUED
  ISSUED
  REJECTED
}

model MisChecklistTemplate {
  id           String                     @id @default(uuid()) @db.Uuid
  name         String
  processId    String?                    @map("process_id") @db.Uuid
  departmentId String?                    @map("department_id") @db.Uuid
  isPreloaded  Boolean                    @default(false) @map("is_preloaded")
  isActive     Boolean                    @default(true) @map("is_active")
  createdAt    DateTime                   @default(now()) @map("created_at")
  updatedAt    DateTime                   @updatedAt @map("updated_at")

  process      MisProcess?                @relation(fields: [processId], references: [id])
  department   MisDepartment?             @relation(fields: [departmentId], references: [id])
  items        MisChecklistTemplateItem[]
  entries      MisChecklistEntry[]

  @@map("mis_checklist_templates")
}

model MisChecklistTemplateItem {
  id           String                   @id @default(uuid()) @db.Uuid
  templateId   String                   @map("template_id") @db.Uuid
  checkName    String                   @map("check_name")
  sortOrder    Int                      @default(0) @map("sort_order")
  template     MisChecklistTemplate     @relation(fields: [templateId], references: [id], onDelete: Cascade)
  cells        MisChecklistEntryCell[]

  @@map("mis_checklist_template_items")
}

model MisChecklistEntry {
  id           String                   @id @default(uuid()) @db.Uuid
  templateId   String                   @map("template_id") @db.Uuid
  orderId      String?                  @map("order_id") @db.Uuid
  machineId    String?                  @map("machine_id") @db.Uuid
  shiftId      String?                  @map("shift_id") @db.Uuid
  date         DateTime                 @map("date")
  checkedById  String?                  @map("checked_by_id") @db.Uuid
  comments     String?
  createdAt    DateTime                 @default(now()) @map("created_at")
  updatedAt    DateTime                 @updatedAt @map("updated_at")

  template     MisChecklistTemplate     @relation(fields: [templateId], references: [id])
  order        MisOrder?                @relation(fields: [orderId], references: [id])
  machine      MisMachine?              @relation(fields: [machineId], references: [id])
  shift        MisShift?                @relation(fields: [shiftId], references: [id])
  cells        MisChecklistEntryCell[]

  @@map("mis_checklist_entries")
}

model MisChecklistEntryCell {
  id           String                   @id @default(uuid()) @db.Uuid
  entryId      String                   @map("entry_id") @db.Uuid
  itemId       String                   @map("item_id") @db.Uuid
  hourSlot     String                   @map("hour_slot") // e.g. "09:15", "10:00"
  status       String                   @default("PASS") // PASS, FAIL, MAKE_READY, PLATE_ERR, NA
  remarks      String?

  entry        MisChecklistEntry        @relation(fields: [entryId], references: [id], onDelete: Cascade)
  item         MisChecklistTemplateItem @relation(fields: [itemId], references: [id])

  @@unique([entryId, itemId, hourSlot])
  @@map("mis_checklist_entry_cells")
}
```

---

## 4. Permissions Matrix Additions (`src/lib/mis/permissions.ts`)

| Action Key | Description | OWNER | ADMIN | STORE_GUY | SUPERVISOR | QC |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `grn.read` / `grn.write` | Goods Receipt Note entry & confirm | ✅ | ✅ | ✅ | 👁️ (read) | ❌ |
| `supplier_invoice.read` | View 3-Way Match & Invoice list | ✅ | ✅ | ✅ | ❌ | ❌ |
| `supplier_invoice.write` | Reconcile / Flag Discrepancies | ✅ | ✅ | ❌ | ❌ | ❌ |
| `material_issue.request` | Raise material demand against order | ✅ | ✅ | ❌ | ✅ | ❌ |
| `material_issue.issue` | Approve & adjust issue qty ≤ requested | ✅ | ✅ | ✅ | ❌ | ❌ |
| `qc_template.manage` | Create, edit, toggle checklist templates | ✅ | ✅ | ❌ | ❌ | ❌ |
| `qc_checklist.fill` | Fill hourly grid on floor | ✅ | ❌ | ❌ | ❌ | ✅ |
| `qc_checklist.read` | View & print completed QC sheets | ✅ | ✅ | ❌ | 👁️ | ✅ |

---

## 5. Implementation Sequence & Regression Protection

1. **Phase 1: Database & Seeders**
   - Apply additive migration with Prisma.
   - Run seed script for 4 QC Checklist Templates (`Printing`, `Lamination`, `Lamif Flute`, `Die Cutting`).
2. **Phase 2: Domain Logic & Server Services (`src/server/mis/`)**
   - Extend `grn.ts`: Add DC/Damage/Short calculation and `MisSupplierInvoice` generation.
   - Create `material-issue.ts`: Request validation, order quota checking, atomic inventory ledger debit.
   - Create `qc-template.ts`: Template CRUD, hourly cell batch upsert.
   - Verify all money columns respect `withoutMoneyFields` redaction for non-owner callers.
3. **Phase 3: Presentation & User Screens**
   - Enhance GRN form (`src/components/mis/store/receive-screen.tsx`).
   - Create Material Issue Request modal for Supervisors.
   - Create Material Issue Approval inbox for Store Guys.
   - Build QC Template Manager & Interactive Hourly Grid.
   - Add employee photo upload in profile form and expose in kiosk sync API.
4. **Phase 4: Verification Gate**
   - Run `pnpm run lint` & `pnpm exec tsc --noEmit`.
   - Run Vitest unit & integration test suites (verify all 4,432 existing tests pass + new suites added).
