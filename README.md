# Arjun — App

Secure internal business dashboard. This is the application code.

## Stack

- **Framework:** Next.js (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Database:** Supabase Postgres + Prisma ORM
- **Auth:** Supabase Auth (email/password, TOTP MFA, invites)
- **Object Storage:** Local filesystem (dev), MinIO / IDrive e2 (prod)
- **Hosting:** Vercel

## Prerequisites

- Node.js 22+
- pnpm 9+
- A Supabase project (free tier is fine)
- Docker is **NOT** required — local dev uses filesystem storage by default

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables
cp .env.example .env.local
# Fill in Supabase keys, DATABASE_URL, and DIRECT_URL — see "Auth Setup" below

# 3. Generate Prisma client
pnpm db:generate

# 4. Run database migrations
pnpm db:migrate --name init

# 5. Seed default workspace settings
pnpm db:seed

# 6. Start the dev server
pnpm dev

# Done! Uploads use local filesystem by default (no Docker needed).
# To use MinIO instead, set STORAGE_DRIVER=s3 in .env.local and:
# docker compose up -d minio createbucket
```

Open [http://localhost:3000](http://localhost:3000).

## Auth Setup

### 1. Configure Supabase Project

In your [Supabase dashboard](https://supabase.com/dashboard):

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to your public app URL (`http://localhost:3000` locally; production domain in prod).
3. Add these **Redirect URLs** (local + production equivalents):
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/invite/accept`
   - `https://YOUR_DOMAIN/auth/callback`
   - `https://YOUR_DOMAIN/invite/accept`
4. (Optional) Under **Auth Providers**, disable email confirmation for faster local testing — or leave it enabled and confirm users manually from the dashboard.

### 2. Add Keys to `.env.local`

From **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

From **Project Settings → Database**:

```
# Vercel / app runtime — session pooler (port 5432)
RUNTIME_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Prisma CLI — migrate / db pull / studio (same session URL locally)
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

| Variable | Port | Used by |
|----------|------|---------|
| `RUNTIME_DATABASE_URL` | 5432 | App runtime on Vercel (`src/server/db`) |
| `DIRECT_URL` | 5432 | Prisma CLI (`prisma.config.ts`) |
| `DATABASE_URL` | — | Fallback if `RUNTIME_DATABASE_URL` unset |

Set env vars on **Production** and **Preview** in Vercel. Do not use the transaction pooler (6543) for runtime — it breaks prepared statements.

### 3. Create First Admin Account

Set `ALLOW_BOOTSTRAP=true` in `.env.local`, then:

1. Start the dev server (`pnpm dev`).
2. Visit `http://localhost:3000/login`.
3. The login page detects no users exist and shows "Create admin account".
4. Enter your email and a password (min 8 chars). This creates a Supabase Auth user.
5. Sign in with those credentials. On first login, you are automatically assigned the **Owner** role.
6. Set `ALLOW_BOOTSTRAP=false` in `.env.local` (or remove the line) after setup.

### 4. Invite Additional Users (invite-only)

- **Disable public signup** in Supabase → Authentication → Providers (invite-only workspace).
- Owners and admins invite users from **Admin → Invite User** (max **15** active + pending seats).
- Supabase sends a **secure invite email** — the link opens `/auth/callback` then `/invite/accept` where the user sets their own password (no plaintext passwords).
- Owner can invite **admin** or **member**; admin can invite **member** only.
- Invited role is applied after password setup via `complete-invite`.
- Resend or **Cancel** pending invites from Admin (cancelled invites do not use seats).
- See [docs/email-templates.md](../docs/email-templates.md) for SMTP, templates, and troubleshooting.

## Auth Flow

```
Login page
  ↓ signInWithPassword()
Supabase Auth (cloud)
  ↓ session cookie set
Proxy (src/proxy.ts)
  ↓ refreshes session, guards protected routes
Dashboard layout (server)
  ↓ getCurrentUser() → ensureProfile()
  ↓ auto-creates UserProfile if first login
  ↓ first user ever → role=owner, subsequent → role=member
Dashboard page
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm typecheck` | TypeScript type check |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:push` | Push schema (no migration file) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:seed` | Seed workspace settings |
| `pnpm demo:seed` | Populate realistic demo data (folders, files, activity) |
| `pnpm demo:reset` | Wipe all data and re-seed fresh demo content |

## File Management

After login, navigate to **Files** from the sidebar. The file browser supports:

- **Folders:** Create, rename, soft-delete, nested navigation with breadcrumbs
- **Files:** Upload (through app server → storage), download, rename, soft-delete
- **Versioning:** Re-upload edited files as new versions, view full version history, download any version, restore older versions to current
- **Trash:** View deleted files/folders, restore, permanent delete (permanent delete = owner/admin only)
- **Folder Download:** Download an entire folder (with subfolders) as a ZIP archive
- **Drag & Drop:** Drop files or folders directly onto the file browser to upload
- **Folder Import:** Import an entire folder structure with `webkitdirectory` picker or by dropping a folder
- **Paste Upload:** Paste images/files from clipboard (Ctrl+V / Cmd+V)
- **Preview Panel:** Wide panel with keyboard navigation (←/→/Esc), large hero area, metadata, quick actions
- **Upload Queue:** Real-time per-file progress with retry for failed uploads
- **Grid/List View:** Toggle between dense list and visual grid view (persisted)
- **Search:** Global search (⌘K) for files and folders with debounced results
- **Sort & Filter:** Sort by name, date, size, or type (ascending/descending)
- **Favorites:** Star files for quick access (shown on dashboard)
- **Move:** Move files and folders between locations with a folder picker dialog
- **Duplicate Detection:** Same-name conflict check before upload with keep-both/overwrite/version options
- **Bulk Actions:** Multi-select files and bulk delete
- **Theme:** Light / Dark / System theme toggle with persistent preference
- **RBAC:** All actions are permission-checked (`files:*`, `folders:*`, `versions:*`)
- **Audit:** Every action is logged to the `audit_events` table

Upload works out of the box with local filesystem storage (`STORAGE_DRIVER=local`). For production, use S3-compatible storage (IDrive e2). If S3 mode is selected but env vars are missing, the API returns a clear `503` error.

## Project Structure

```
src/
├── app/
│   ├── (auth)/             # Public auth pages (login, forgot-password, reset-password, unauthorized)
│   ├── (dashboard)/        # Protected dashboard pages
│   │   ├── page.tsx        # Dashboard home (stats, recent files, quick actions)
│   │   ├── files/page.tsx  # File browser
│   │   ├── trash/page.tsx  # Trash (deleted items)
│   │   ├── admin/page.tsx  # Admin: user management (list, invite, roles, deactivate)
│   │   └── admin/settings/ # Settings: storage overview, upload limits, retention config
│   ├── api/
│   │   ├── folders/        # Folder CRUD + move + download-as-ZIP endpoints
│   │   ├── files/          # File CRUD + upload + download + versions + move + duplicate-check
│   │   ├── versions/       # Version download + restore endpoint
│   │   ├── admin/          # Admin: user management + workspace settings endpoints
│   │   ├── search/         # Global search endpoint
│   │   ├── favorites/      # Favorites CRUD endpoint
│   │   └── trash/          # Trash list, restore, permanent delete endpoints
│   ├── auth/callback/      # Supabase PKCE callback handler
│   ├── healthz/            # Health check endpoint
│   ├── layout.tsx          # Root layout (providers: theme, toasts)
│   ├── error.tsx           # Global error boundary
│   └── not-found.tsx       # 404 page
├── components/
│   ├── files/              # File browser UI
│   │   ├── file-browser.tsx    # Main orchestrator (drop, paste, queue, search, sort, bulk)
│   │   ├── file-table.tsx      # File list view with inline version expand
│   │   ├── file-grid.tsx       # File grid view with premium cards
│   │   ├── folder-grid.tsx     # Folder cards grid
│   │   ├── drop-zone.tsx       # Drag-and-drop overlay wrapper
│   │   ├── upload-queue.tsx    # Fixed upload progress panel
│   │   ├── preview-panel.tsx   # Wide side panel (keyboard nav, hero preview, metadata)
│   │   ├── search-bar.tsx      # Global search (⌘K) with results dropdown
│   │   ├── duplicate-dialog.tsx    # Duplicate/conflict resolution dialog
│   │   ├── move-dialog.tsx         # Move file to folder picker
│   │   ├── folder-import-dialog.tsx  # Confirmation dialog for folder uploads
│   │   ├── new-version-dialog.tsx    # Version re-upload dialog
│   │   ├── create-folder-dialog.tsx  # New folder modal
│   │   ├── rename-dialog.tsx         # Rename modal
│   │   ├── breadcrumbs.tsx           # Breadcrumb navigation
│   │   └── version-panel.tsx         # Inline version history
│   ├── trash/              # Trash browser UI (restore, permanent delete)
│   ├── providers/          # React context providers (theme)
│   ├── shell/              # Dashboard shell (sidebar, topbar with theme toggle)
│   └── ui/                 # shadcn/ui components + toast system
├── lib/
│   ├── supabase/           # Supabase client helpers (server, client, middleware)
│   ├── api.ts              # Typed fetch helper
│   ├── file-utils.ts       # Extension badges, icons, byte/date formatting
│   ├── use-upload.ts       # Upload hook (queue, retry, abort, size validation, duplicate check)
│   └── utils.ts            # cn() and shared utilities
├── proxy.ts                # Next.js 16 proxy (auth guard, session refresh)
└── server/                 # Backend modules
    ├── auth/               # Auth helpers (getCurrentUser, ensureProfile, requireUser)
    ├── rbac/               # Role-based access control
    ├── db/                 # Prisma client singleton
    ├── storage/            # Dual-driver storage (local filesystem or S3-compatible)
    ├── audit/              # Audit event logging
    ├── settings/           # Workspace settings read/write
    ├── files/              # File metadata CRUD + presigned upload/download + move
    ├── folders/            # Folder hierarchy CRUD + breadcrumbs
    ├── versions/           # File versioning (create, list, download older versions, restore)
    ├── admin/              # Admin module (user list, invite, role change, deactivate)
    ├── trash/              # Trash operations (list, restore, permanent delete)
    ├── search/             # Global search + duplicate detection
    └── favorites/          # Favorites/pin (per-user starred files/folders)
```

## Testing Notes

### Local Testing Steps

```bash
pnpm db:generate                      # Generate Prisma client (includes Favorite model)
pnpm db:migrate --name add-favorites  # Run migration for new schema
pnpm dev                              # Start dev server
# Open http://localhost:3000 → sign in
```

**Dashboard:**
- Verify stats cards show real counts (files, folders, storage, versions)
- Quick actions link to correct pages
- Recent files list shows the latest activity
- Activity panel shows recent audit events with time-ago
- Starred/pinned files appear in quick actions section

**Theme:**
- Click the sun/moon icon in the top bar → toggle between Light / Dark / System
- Theme persists across page refreshes (stored in localStorage)

**Files page — Grid/List:**
- Toggle between list and grid view using the grid/list icon button
- Grid mode shows visual cards with type-colored thumbnails
- List mode shows dense table with version expand
- View preference persists across sessions

**Search:**
- Click the search button (or press ⌘K / Ctrl+K)
- Type to search — results appear with debounce
- Click a result to navigate to that folder or preview the file
- Press Escape to dismiss

**Sort:**
- Click the sort dropdown next to the search button
- Sort by: Name A-Z, Name Z-A, Newest, Oldest, Largest, Smallest, Type

**Favorites:**
- Use the ⋮ menu → "Add star" to star a file
- Starred files show a gold star icon in the row
- Starred files appear on the dashboard

**Move:**
- Use the ⋮ menu → "Move to…"
- A folder browser dialog opens — navigate to target folder
- Click "Move here" to relocate the file

**Duplicate Detection:**
- Upload a file with the same name as an existing file in the current folder
- A conflict dialog appears with options: Keep both / Upload as new version / Replace / Cancel
- "Keep both" renames with a "(copy)" suffix
- "Upload as new version" adds as a version to the existing file

**Bulk Select:**
- In grid mode, click checkboxes on cards to select multiple files
- A bulk action bar appears with "Delete" option
- Click "Clear" to deselect all

**Upload:**
- Click "Upload" button or drag files from Finder/Explorer
- Paste an image from clipboard (Cmd+V / Ctrl+V)
- Upload queue panel appears at bottom-right with per-file progress

**Folder Import:**
- Click the folder import button → browser folder picker opens
- Or drag a folder from Finder onto the file area
- Confirmation dialog: "Import folder 'X' with N files?"
- Progress bar during upload

**Preview Panel:**
- Double-click a file row or use ⋮ menu → Preview
- Images: full inline preview
- PDF: embedded iframe viewer
- CDR/AI/EPS/PSD: premium placeholder with metadata + download
- Keyboard nav: ← previous, → next, Esc to close
- Star/unfavorite directly from preview panel

**Version Restore:**
- Expand a file row to see version history
- Non-current versions show a restore (↺) button next to download
- Click restore → confirm → that version becomes the "Current" version
- No history is deleted — the restored version simply becomes current
- The "Current" badge moves to the restored version

**Folder Move:**
- Right-click or use ⋮ menu on a folder → "Move to…"
- A folder browser dialog opens — navigate to target location
- Click "Move here" to relocate the folder
- Cycle prevention: you cannot move a folder into itself or its own descendants
- Duplicate name conflicts in the target location are caught and reported

**Folder Download as ZIP:**
- Right-click or use ⋮ menu on a folder → "Download ZIP"
- A ZIP file containing all files (including subfolders) is generated and downloaded
- Requires object storage to be running (MinIO or production storage)

**Admin (owner/admin only):**
- Click "Admin" in the sidebar
- Lists all users with role badges, status indicators, and join dates
- Click a user's role badge to change their role (dropdown)
- Click ⋮ → Deactivate/Reactivate to toggle user status
- Click "Invite User" to send an email invite with a role selection
- Safety: cannot demote the only owner, cannot deactivate yourself

**Settings (owner/admin only):**
- Click "Settings" in the sidebar
- Storage overview with progress bar (used vs quota)
- Stats: total files, folders, versions
- Configurable: max file size (MB), version retention count
- Click "Save Changes" to persist

**Trash:**
- Delete items from Files page
- Click "Trash" in sidebar
- Restore or permanently delete
- Only owner/admin can permanently delete

### Storage Modes

| Mode | Set by | Where files go | Docker needed? |
|------|--------|----------------|----------------|
| `local` | `STORAGE_DRIVER=local` | `.local-storage/` on disk | No |
| `s3` | `STORAGE_DRIVER=s3` | MinIO / IDrive e2 bucket | MinIO: yes |
| auto | *(omit STORAGE_DRIVER)* | `s3` if all vars set, else `local` | Depends |

For local dev without Docker, just set `STORAGE_DRIVER=local` (or leave it unset with no S3 vars).

### File Upload & Versioning Testing

With `STORAGE_DRIVER=local` (default), uploads work immediately — no Docker or external services needed. Files are saved to `.local-storage/` in the project root.

**Testing the version workflow:**

1. Upload a file (e.g. `design.cdr` or `proposal.pdf`)
2. Click the **>** expand arrow on the file row to see version history
3. Click the **⋮** menu → **Upload new version** to re-upload an edited copy with an optional note
4. Expand the row again — both v1 and v2 appear, with v2 marked "Current"
5. Click the download icon on any version to download that specific version

**Supported file types:** All types are accepted. CorelDRAW (`.cdr`), PDF, AI, PSD, EPS, images, Office docs, archives, etc. Extension-based badges and icons are shown.

**File size limit:** 500 MB per file (enforced client-side with clear error message).

### Browser Compatibility — Folder Import

| Feature | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| `webkitdirectory` file picker | ✅ | ✅ | ✅ |
| Drag & drop folder (directory entries) | ✅ | ❌ (treated as files) | ⚠️ (partial) |
| Paste files from clipboard | ✅ | ✅ | ✅ |

When a browser doesn't support `DataTransferItem.webkitGetAsEntry()`, dropped folders are treated as regular file drops. The app handles this gracefully — no errors, files are uploaded directly without folder structure.

### Production Storage (IDrive e2)

For production deployment, set these env vars in Vercel:

| Variable | Example | Where to find |
|---|---|---|
| `STORAGE_ENDPOINT` | `https://s3.us-west-1.idrivee2.com` | IDrive e2 dashboard → Endpoint |
| `STORAGE_REGION` | `us-west-1` | Region shown next to endpoint |
| `STORAGE_ACCESS_KEY` | `abc123...` | IDrive e2 → Access Keys |
| `STORAGE_SECRET_KEY` | `xyz789...` | IDrive e2 → Access Keys |
| `STORAGE_BUCKET` | `arjun-files` | Create a bucket in IDrive e2 dashboard |

The storage adapter uses `forcePathStyle: true` which works with both MinIO and IDrive e2 (both are S3-compatible). No code changes needed when switching between local and production storage.

### Preview Limitations

| Format | Preview | Notes |
|---|---|---|
| Images (PNG, JPG, GIF, WebP, SVG, BMP) | ✅ Full inline preview | Streamed through app server |
| PDF | ✅ Embedded viewer | Uses browser's native PDF renderer via iframe |
| CorelDRAW (.cdr) | ❌ Metadata only | No open-source renderer exists |
| Illustrator (.ai) | ❌ Metadata only | PostScript-based, no browser support |
| Photoshop (.psd) | ❌ Metadata only | Complex layered format |
| EPS | ❌ Metadata only | Requires specialized renderer |
| Other | ❌ Metadata only | Download to view |

For unsupported formats, the preview panel shows: file name, type badge, size, upload date, version count, and a download button.

### Known Limitations

- **Single workspace** — multi-tenant/multi-workspace is not supported
- **No external sharing** — files are internal-only, no share links
- **No CRM features** — planned for future phases
- **No deployment config** — production deployment (Vercel, domain, Cloudflare Access) not set up yet

## Demo Checklist

Use this checklist when demonstrating the product to a client or stakeholder.

**1. First Impression (Dashboard)**
- [ ] Show the dashboard greeting and stats overview
- [ ] Point out the quick actions, recent files, and activity sections
- [ ] If new workspace: show the onboarding banner

**2. File Management**
- [ ] Navigate to Files → create a folder → rename it
- [ ] Upload a file (drag & drop or button)
- [ ] Upload a second file with the same name → show duplicate conflict dialog
- [ ] Switch between grid and list views
- [ ] Use ⌘K / Ctrl+K search to find files
- [ ] Sort by name / date / size / type

**3. Versioning**
- [ ] Upload a new version of an existing file (⋮ → New version)
- [ ] Expand version history → show multiple versions
- [ ] Restore an older version → confirm "Current" badge moves
- [ ] Download a specific older version

**4. Preview**
- [ ] Preview an image file (double-click or ⋮ → Preview)
- [ ] Preview a PDF file
- [ ] Preview a CDR/AI/EPS file → show metadata fallback
- [ ] Navigate between files with ← / → arrow keys

**5. Folder Operations**
- [ ] Move a folder to a different location (⋮ → Move to…)
- [ ] Download a folder as ZIP (⋮ → Download ZIP)
- [ ] Delete a folder → check it appears in Trash

**6. Trash**
- [ ] Navigate to Trash
- [ ] Restore a deleted file → verify it reappears in Files
- [ ] Permanently delete a file (owner/admin only)

**7. Admin & Settings**
- [ ] Navigate to Admin → show user list
- [ ] Change a user's role
- [ ] Send an invite (or show the invite dialog)
- [ ] Navigate to Settings → show storage overview
- [ ] Change the file size limit → save

**8. Theme**
- [ ] Toggle light / dark / system theme
- [ ] Verify persistence after refresh

## Deployment

For production deployment, see the docs in `../docs/`:

| Document | Purpose |
|----------|---------|
| [`LAUNCH_CHECKLIST.md`](../docs/LAUNCH_CHECKLIST.md) | Step-by-step launch day checklist |
| [`PRODUCTION_ENV_CHECKLIST.md`](../docs/PRODUCTION_ENV_CHECKLIST.md) | Every env var, service, and config needed |
| [`CLIENT_DEMO_SCRIPT.md`](../docs/CLIENT_DEMO_SCRIPT.md) | 10–15 min guided demo walkthrough |

**Quick deployment summary:**

1. Create Supabase project, IDrive e2 bucket, and Vercel project
2. Set all env vars from `.env.production.example` in Vercel
3. Push to deploy — Vercel builds and serves automatically
4. Run `prisma migrate deploy` and `pnpm db:seed` against production DB
5. Create first admin via bootstrap, then disable `ALLOW_BOOTSTRAP`
6. (Optional) Add Cloudflare Access for zero-trust network gate

## Demo Data

To populate the workspace with realistic sample content for demos:

```bash
# Seed demo data (requires a logged-in owner account + ALLOW_BOOTSTRAP=true)
pnpm demo:seed

# Full reset: wipe everything and re-seed fresh demo data
pnpm demo:reset
```

The demo seed creates:
- 5 top-level folders with realistic subfolders (Client Designs, Invoices, etc.)
- 16 sample files (PDF, CDR, AI, PSD, EPS, PNG) with metadata
- Version history on select files
- Starred/favorite items
- Audit trail with realistic activity
- Storage usage tracking

## Environment Variables

See `.env.example` for local development and `.env.production.example` for Vercel deployment.

### Supabase database connection split

- **`RUNTIME_DATABASE_URL`** — Session pooler, port **5432**. **Required on Vercel** for the running app (`src/server/db`).
- **`DIRECT_URL`** — Same session URL for Prisma CLI (`pnpm db:migrate`, `pnpm prisma db pull`) via `prisma.config.ts`.
- **`DATABASE_URL`** — Optional fallback if `RUNTIME_DATABASE_URL` is not set.

Check `/healthz` after deploy: `checks.database` should be `"ok"` and `database.dbPort` should be `"5432"`.
