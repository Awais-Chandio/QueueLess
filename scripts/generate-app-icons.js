#!/usr/bin/env node
/* eslint-env node */
/**
 * Generates every launcher/app icon asset from one source of truth.
 *
 * Mark: "Check M" (icon-concepts/concept-3-check-m.svg) — the M's centre valley
 * is drawn as an asymmetric checkmark and tinted in the accent colour.
 * Colours come from src/theme/colors.ts; nothing here invents a palette.
 *
 * Run:  node scripts/generate-app-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- brand, verbatim from src/theme/colors.ts -------------------------------
const PRIMARY = '#0E7490'; // colors.primary
const PRIMARY_2 = '#0891B2'; // colors.gradients.primary[1]
const ACCENT_ON_DARK = '#5EEAD4'; // light accent, for contrast on the gradient

// --- mark geometry, authored on a 1024 canvas -------------------------------
const M_STROKE = 'M316 700V372L474 588L708 312V700';
const CHECK_STROKE = 'M316 372L474 588L708 312';
const STROKE_W = 76;

/**
 * Android only guarantees the inner 72dp of a 108dp adaptive layer is visible.
 * Scaling the mark by 72/108 on the foreground layer makes it appear at the
 * same visual size as on the legacy icon once a launcher has masked it.
 */
const ADAPTIVE_SCALE = 72 / 108;

const scaleAbout = (k) =>
  k === 1 ? '' : ` transform="translate(512 512) scale(${k}) translate(-512 -512)"`;

const gradientDef = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${PRIMARY}"/>
      <stop offset="1" stop-color="${PRIMARY_2}"/>
    </linearGradient>
  </defs>`;

function mark({ scale = 1, mono = false } = {}) {
  const base = mono ? '#FFFFFF' : '#FFFFFF';
  const check = mono ? '#FFFFFF' : ACCENT_ON_DARK;
  return `
  <g${scaleAbout(scale)}>
    <path d="${M_STROKE}" fill="none" stroke="${base}" stroke-width="${STROKE_W}"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${CHECK_STROKE}" fill="none" stroke="${check}" stroke-width="${STROKE_W}"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

/** Authored at 1024; `size` sets the raster dimensions so librsvg rasterizes
 *  natively at the target size instead of us resampling a larger bitmap. */
function svg(variant, size) {
  const open = `<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">`;
  switch (variant) {
    case 'full': // legacy square launcher icon + iOS (iOS applies its own mask)
      return `${open}${gradientDef}<rect width="1024" height="1024" fill="url(#g)"/>${mark()}</svg>`;
    case 'round': // pre-masked circular legacy icon
      return `${open}${gradientDef}<circle cx="512" cy="512" r="512" fill="url(#g)"/>${mark()}</svg>`;
    case 'background': // adaptive background layer, full bleed
      return `${open}${gradientDef}<rect width="1024" height="1024" fill="url(#g)"/></svg>`;
    case 'foreground': // adaptive foreground layer, transparent
      return `${open}${mark({ scale: ADAPTIVE_SCALE })}</svg>`;
    case 'monochrome': // themed icons: Android tints the alpha, so draw it solid
      return `${open}${mark({ scale: ADAPTIVE_SCALE, mono: true })}</svg>`;
    default:
      throw new Error('unknown variant ' + variant);
  }
}

// --- targets ---------------------------------------------------------------
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const targets = [];

for (const [d, m] of Object.entries(DENSITIES)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  // Legacy icons are 48dp; adaptive layers are the full 108dp canvas.
  targets.push({ file: `${dir}/ic_launcher.png`, variant: 'full', size: Math.round(48 * m), alpha: false });
  targets.push({ file: `${dir}/ic_launcher_round.png`, variant: 'round', size: Math.round(48 * m), alpha: true });
  targets.push({ file: `${dir}/ic_launcher_foreground.png`, variant: 'foreground', size: Math.round(108 * m), alpha: true });
  targets.push({ file: `${dir}/ic_launcher_monochrome.png`, variant: 'monochrome', size: Math.round(108 * m), alpha: true });
  targets.push({ file: `${dir}/ic_launcher_background.png`, variant: 'background', size: Math.round(108 * m), alpha: false });
}

// iOS. The App Store rejects icons containing an alpha channel, so all are flattened.
const IOS = 'ios/QueueLess/Images.xcassets/AppIcon.appiconset';
for (const [name, size] of [
  ['Icon-20@2x', 40], ['Icon-20@3x', 60],
  ['Icon-29@2x', 58], ['Icon-29@3x', 87],
  ['Icon-40@2x', 80], ['Icon-40@3x', 120],
  ['Icon-60@2x', 120], ['Icon-60@3x', 180],
  ['MediQ-AppIcon-1024', 1024],
]) {
  targets.push({ file: `${IOS}/${name}.png`, variant: 'full', size, alpha: false });
}

// Store listings + in-repo masters
targets.push({ file: 'src/assets/branding/play_store_512.png', variant: 'full', size: 512, alpha: false });
targets.push({ file: 'src/assets/branding/app_store_1024.png', variant: 'full', size: 1024, alpha: false });
targets.push({ file: 'src/assets/branding/mediq_icon_master.png', variant: 'full', size: 1024, alpha: false });
targets.push({ file: 'src/assets/branding/mediq_icon_monochrome_master.png', variant: 'monochrome', size: 1024, alpha: true });

(async () => {
  for (const t of targets) {
    const out = path.join(ROOT, t.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let img = sharp(Buffer.from(svg(t.variant, t.size)));
    if (!t.alpha) img = img.flatten({ background: PRIMARY }).removeAlpha();
    await img.png({ compressionLevel: 9 }).toFile(out);
  }

  // Vector masters, so the mark stays editable
  fs.writeFileSync(path.join(ROOT, 'src/assets/branding/mediq_icon_master.svg'), svg('full', 1024) + '\n');
  fs.writeFileSync(
    path.join(ROOT, 'src/assets/branding/mediq_icon_monochrome_master.svg'),
    svg('monochrome', 1024) + '\n',
  );

  // --- verify what actually landed on disk, rather than assuming ------------
  let bad = 0;
  for (const t of targets) {
    const meta = await sharp(path.join(ROOT, t.file)).metadata();
    const okSize = meta.width === t.size && meta.height === t.size;
    const okAlpha = t.alpha ? meta.channels === 4 : meta.channels === 3;
    if (!okSize || !okAlpha) {
      bad++;
      console.error(
        `FAIL ${t.file}: got ${meta.width}x${meta.height} ${meta.channels}ch,` +
          ` expected ${t.size}x${t.size} ${t.alpha ? 4 : 3}ch`,
      );
    }
  }
  console.log(`${targets.length} files written, ${targets.length - bad} verified, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
