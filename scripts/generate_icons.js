const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const brandingPath = path.join(ROOT, 'src/assets/branding');
const androidResPath = path.join(ROOT, 'android/app/src/main/res');
const iosAppIconPath = path.join(ROOT, 'ios/QueueLess/Images.xcassets/AppIcon.appiconset');

const MASTER_COLOR = path.join(brandingPath, 'queueless_icon_master.png');
const MASTER_MONO = path.join(brandingPath, 'queueless_icon_monochrome_master.png');
const MASTER_SVG = path.join(brandingPath, 'queueless_icon_master.svg');
const MASTER_MONO_SVG = path.join(brandingPath, 'queueless_icon_monochrome_master.svg');

const iconSvg = ({ monochrome = false } = {}) => {
  const bg = monochrome ? 'transparent' : 'url(#bg)';
  const pin = monochrome ? '#000000' : '#FFFFFF';
  const accent = monochrome ? '#000000' : '#93C5FD';
  const soft = monochrome ? 'transparent' : 'rgba(255,255,255,0.11)';

  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="130" y1="92" x2="894" y2="932" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0A3D91"/>
      <stop offset="0.52" stop-color="#1565FF"/>
      <stop offset="1" stop-color="#3B82F6"/>
    </linearGradient>
    <linearGradient id="pinFill" x1="288" y1="188" x2="738" y2="782" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.03"/>
    </linearGradient>
    <filter id="shadow" x="120" y="110" width="784" height="820" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="34" stdDeviation="32" flood-color="#07152D" flood-opacity="0.42"/>
    </filter>
  </defs>
  ${monochrome ? '' : `<rect width="1024" height="1024" fill="${bg}"/>`}
  ${monochrome ? '' : '<rect x="52" y="52" width="920" height="920" rx="204" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>'}
  <g transform="translate(82 76) scale(0.84)">
  <path d="M154 280H328M696 280H870M154 744H348M676 744H870" stroke="${soft}" stroke-width="18" stroke-linecap="round"/>
  <g filter="${monochrome ? 'none' : 'url(#shadow)'}">
    <path d="M512 138C672 138 800 268 800 428C800 620 512 848 512 848C512 848 224 620 224 428C224 268 352 138 512 138Z" fill="${monochrome ? 'none' : 'url(#pinFill)'}" stroke="${pin}" stroke-width="62" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M678 664C734 718 786 778 856 818" stroke="${pin}" stroke-width="62" stroke-linecap="round"/>
    <circle cx="512" cy="426" r="164" stroke="${pin}" stroke-width="38" opacity="${monochrome ? '1' : '0.42'}"/>
    <path d="M512 312V540M398 426H626" stroke="${accent}" stroke-width="58" stroke-linecap="round"/>
    <path d="M318 608H408L448 526L512 716L574 452L624 608H706" stroke="${accent}" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="318" cy="608" r="26" fill="${accent}"/>
    <circle cx="706" cy="608" r="26" fill="${accent}"/>
    <path d="M390 744H512H634" stroke="${pin}" stroke-width="42" stroke-linecap="round" opacity="${monochrome ? '1' : '0.62'}"/>
  </g>
  </g>
</svg>`;
};

async function renderSvg(svg, size, dest, options = {}) {
  const pipeline = sharp(Buffer.from(svg)).resize(size, size, { fit: 'contain' });
  if (options.removeAlpha) {
    pipeline.flatten({ background: '#0A3D91' }).removeAlpha();
  }
  await pipeline.png().toFile(dest);
  console.log(`Generated ${size}x${size}: ${dest}`);
}

async function resizePng(size, src, dest, options = {}) {
  const pipeline = sharp(src).resize(size, size);
  if (options.removeAlpha) {
    pipeline.flatten({ background: '#0A3D91' }).removeAlpha();
  }
  await pipeline.png().toFile(dest);
  console.log(`Generated ${size}x${size}: ${dest}`);
}

async function main() {
  fs.mkdirSync(brandingPath, { recursive: true });
  fs.mkdirSync(iosAppIconPath, { recursive: true });

  const colorSvg = iconSvg();
  const monoSvg = iconSvg({ monochrome: true });
  fs.writeFileSync(MASTER_SVG, colorSvg.trim());
  fs.writeFileSync(MASTER_MONO_SVG, monoSvg.trim());

  await renderSvg(colorSvg, 1024, MASTER_COLOR, { removeAlpha: true });
  await renderSvg(monoSvg, 1024, MASTER_MONO);

  await resizePng(512, MASTER_COLOR, path.join(brandingPath, 'play_store_512.png'), { removeAlpha: true });
  await resizePng(1024, MASTER_COLOR, path.join(brandingPath, 'app_store_1024.png'), { removeAlpha: true });

  const iosIcons = [
    { file: 'Icon-20@2x.png', size: 40 },
    { file: 'Icon-20@3x.png', size: 60 },
    { file: 'Icon-29@2x.png', size: 58 },
    { file: 'Icon-29@3x.png', size: 87 },
    { file: 'Icon-40@2x.png', size: 80 },
    { file: 'Icon-40@3x.png', size: 120 },
    { file: 'Icon-60@2x.png', size: 120 },
    { file: 'Icon-60@3x.png', size: 180 },
    { file: 'QueueLess-AppIcon-1024.png', size: 1024 },
  ];

  for (const icon of iosIcons) {
    await resizePng(icon.size, MASTER_COLOR, path.join(iosAppIconPath, icon.file), { removeAlpha: true });
  }

  const androidMipmaps = [
    { folder: 'mipmap-mdpi', stdSize: 48, fgSize: 108 },
    { folder: 'mipmap-hdpi', stdSize: 72, fgSize: 162 },
    { folder: 'mipmap-xhdpi', stdSize: 96, fgSize: 216 },
    { folder: 'mipmap-xxhdpi', stdSize: 144, fgSize: 324 },
    { folder: 'mipmap-xxxhdpi', stdSize: 192, fgSize: 432 },
  ];

  for (const mipmap of androidMipmaps) {
    const folderPath = path.join(androidResPath, mipmap.folder);
    fs.mkdirSync(folderPath, { recursive: true });

    await resizePng(mipmap.stdSize, MASTER_COLOR, path.join(folderPath, 'ic_launcher.png'), { removeAlpha: true });
    await resizePng(mipmap.stdSize, MASTER_COLOR, path.join(folderPath, 'ic_launcher_round.png'), { removeAlpha: true });
    await resizePng(mipmap.fgSize, MASTER_COLOR, path.join(folderPath, 'ic_launcher_foreground.png'), { removeAlpha: true });
    await resizePng(mipmap.fgSize, MASTER_MONO, path.join(folderPath, 'ic_launcher_monochrome.png'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
