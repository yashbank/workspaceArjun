/**
 * MIS-82 — generates the two PWA icon files `public/manifest.json` has always
 * referenced but never had (`/assets/icon-192.png`, `/assets/icon-512.png`).
 *
 * No distinct "Factory MIS"/BPP logo asset exists anywhere in the repo (checked
 * `public/assets/bpp/references/` — design mockups for the unrelated file-manager
 * app, no logo mark). Rather than invent new branding, this reuses the manifest's
 * OWN already-decided identity fields (`theme_color`, `background_color`,
 * `short_name`) — a maskable-safe solid square with "BPP" centred. Run once;
 * not part of the build. Delete this script if a real logo ever replaces it.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, '..', 'public', 'manifest.json'), 'utf8'));
const { theme_color: bg, background_color: fg, short_name: label } = manifest;

function svgFor(size) {
  // Maskable safe zone: keep the glyph within the centre 80% so no OS mask clips it.
  const fontSize = Math.round(size * 0.34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
    fill="${fg}" letter-spacing="${Math.round(size * 0.01)}">${label}</text>
</svg>`;
}

const outDir = join(root, '..', 'public', 'assets');
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const out = join(outDir, `icon-${size}.png`);
  await sharp(Buffer.from(svgFor(size))).png().toFile(out);
  console.log('wrote', out);
}
