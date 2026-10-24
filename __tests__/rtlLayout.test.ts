/**
 * Right-to-left support: the app follows the device (an Urdu phone lays it
 * out RTL) and must never force a direction, styles say start/end instead of
 * left/right, and directional icons come from DirectionalIcons so they flip.
 */
export {};

declare const __dirname: string;
declare function require(id: string): any;
const fs: {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  existsSync(p: string): boolean;
} = require('fs');
const path: { join(...parts: string[]): string; relative(from: string, to: string): string } = require('path');

const ROOT = path.join(__dirname, '..');

const filesUnder = (dir: string, ext: RegExp): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'build' || entry.name === 'Pods' ? [] : filesUnder(full, ext);
    return ext.test(entry.name) ? [full] : [];
  });

const appFiles = [...filesUnder(path.join(ROOT, 'src'), /\.(ts|tsx)$/), path.join(ROOT, 'App.tsx'), path.join(ROOT, 'index.js')]
  .filter(file => !file.endsWith('database.types.ts'));
const rel = (file: string) => path.relative(ROOT, file).split('\\').join('/');
const linesMatching = (file: string, re: RegExp) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => !line.startsWith('*') && !line.startsWith('//') && re.test(line))
    .map(({ line, n }) => `${rel(file)}:${n}: ${line}`);

describe('direction is never forced', () => {
  it('has no forceRTL / allowRTL / swapLeftAndRightInRTL calls in JS', () => {
    const offending = appFiles.flatMap(file => linesMatching(file, /I18nManager\.(forceRTL|allowRTL|swapLeftAndRightInRTL)\s*\(/));
    expect(offending).toEqual([]);
  });

  it('has no native overrides either', () => {
    const native = [
      ...filesUnder(path.join(ROOT, 'android/app/src/main'), /\.(java|kt)$/),
      ...filesUnder(path.join(ROOT, 'ios/QueueLess'), /\.(m|mm|swift)$/),
    ];
    const offending = native.flatMap(file => linesMatching(file, /forceRTL|allowRTL|RCTI18nUtil|I18nUtil/));
    expect(offending).toEqual([]);
  });

  it('lets Android lay the app out RTL on an RTL device', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android:supportsRtl="true"');
  });
});

describe('styles use start/end', () => {
  const PHYSICAL = /\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*|border(Top|Bottom)(Left|Right)Radius)\s*:/;
  // `left:`/`right:` as style keys. hitSlop and MapLibre's positions take
  // left/right by API; TokenBoxes names its props left and right, and a plan's
  // token allowance has a `left` count.
  const NOT_STYLE_FILES = ['TokenBoxes.tsx', 'features/plans/modules.ts'];
  const POSITION = /(^|[{,\s])(left|right)\s*:\s*[-\w(.]/;
  const NOT_STYLE = /hitSlop|hitbox|attributionPosition|logoPosition/;

  it.each(appFiles.map(rel))('%s', file => {
    const full = path.join(ROOT, file);
    const physical = linesMatching(full, PHYSICAL);
    const positions = NOT_STYLE_FILES.some(name => file.endsWith(name))
      ? []
      : linesMatching(full, POSITION).filter(line => !NOT_STYLE.test(line));
    expect([...physical, ...positions]).toEqual([]);
  });
});

describe('directional icons flip', () => {
  const DIRECTIONAL = ['ArrowLeft', 'ArrowRight', 'ChevronLeft', 'ChevronRight', 'ChevronsRight', 'LogOut'];
  const LUCIDE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'lucide-react-native'/g;

  it('imports them from DirectionalIcons, not lucide-react-native', () => {
    const offending = appFiles
      .filter(file => !file.endsWith('DirectionalIcons.tsx'))
      .flatMap(file => {
        const src = fs.readFileSync(file, 'utf8');
        return [...src.matchAll(LUCIDE_IMPORT)]
          .flatMap(m => m[1].split(',').map(s => s.trim()))
          .filter(name => DIRECTIONAL.includes(name))
          .map(name => `${rel(file)}: ${name}`);
      });
    expect(offending).toEqual([]);
  });
});
