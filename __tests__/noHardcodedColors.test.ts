/**
 * Screens take colours from the theme (`useTheme().colors`, or `fixed` in
 * static styles), so light/dark and the brand palette stay in one place.
 *
 * Allowed outside `src/theme`: drawn artwork whose colours are part of the
 * picture (onboarding animations, the logo, wordmark and brand illustration,
 * Google's "G").
 */
export {};

declare const __dirname: string;
declare function require(id: string): any;
const fs: {
  readFileSync(p: string, enc: string): string;
  readdirSync(p: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
} = require('fs');
const path: { join(...parts: string[]): string; relative(from: string, to: string): string } = require('path');

const ROOT = path.join(__dirname, '..');

const ARTWORK = [
  'src/components/animations/',
  'src/components/ui/BrandIllustration.tsx',
  'src/components/ui/Wordmark.tsx',
  'src/components/ui/MedicalLogo.tsx',
  'src/components/ui/GoogleIcon.tsx',
];

const COLOR_LITERAL = /['"]#[0-9A-Fa-f]{3,8}['"]|rgba?\(\s*\d/;

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

describe('no hard-coded colours outside the theme', () => {
  const files = [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'App.tsx')]
    .map(file => path.relative(ROOT, file).split('\\').join('/'))
    .filter(file => !file.startsWith('src/theme/') && !file.endsWith('.d.ts') && file !== 'src/types/database.types.ts')
    .filter(file => !ARTWORK.some(allowed => file.startsWith(allowed)));

  it('scans the app source', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('%s', file => {
    const offending = fs
      .readFileSync(path.join(ROOT, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
      .filter(({ line }) => COLOR_LITERAL.test(line))
      .map(({ line, number }) => `${number}: ${line}`);
    expect(offending).toEqual([]);
  });
});
