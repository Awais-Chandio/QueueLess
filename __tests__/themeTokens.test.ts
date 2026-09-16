/**
 * Guards the design-system invariants that are easy to break silently.
 *
 * The brand-hue assertion is the important one: `scripts/generate-app-icons.js`
 * hardcodes the primary and gradient values it draws the launcher icon with,
 * copied from the theme. If someone retunes the palette without regenerating
 * the icons, the in-app brand and the home-screen icon drift apart and nothing
 * else in the build would catch it.
 */
// `@types/node` is deliberately not in tsconfig's `types` list, so that Node
// globals don't leak into app code and shadow React Native's timer typings.
// This test is the only place that touches the filesystem, so it declares the
// small surface it needs locally instead.
declare const __dirname: string;
declare function require(id: string): any;
const fs: { readFileSync(p: string, enc: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

import { clientColorsLight, clientColorsDark, type StatusPalette } from '../src/theme/colors';
import { fontFamilyForWeight, fontFamilies, typography, textRoles } from '../src/theme/typography';
import { sizing } from '../src/theme/sizing';
import { spacing } from '../src/theme/spacing';

const iconScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'generate-app-icons.js'),
  'utf8',
);

const constantInScript = (name: string): string => {
  const match = iconScript.match(new RegExp(`const ${name} = '(#[0-9A-Fa-f]{6})'`));
  if (!match) {
    throw new Error(`${name} not found in generate-app-icons.js`);
  }
  return match[1];
};

describe('brand hue stays in sync with the launcher icon', () => {
  it('uses the same primary the icon generator draws with', () => {
    expect(constantInScript('PRIMARY')).toBe(clientColorsLight.primary);
  });

  it('uses the same gradient end stop the icon generator draws with', () => {
    expect(constantInScript('PRIMARY_2')).toBe(clientColorsLight.gradients.primary[1]);
  });
});

describe('status palette', () => {
  const keys: (keyof StatusPalette)[] = [
    'pending', 'confirmed', 'called', 'in_progress', 'completed', 'cancelled',
    'checked_in', 'expired', 'no_show', 'skipped', 'doctor_on_break',
    'success', 'warning', 'error', 'info', 'default', 'all',
  ];

  it.each(keys)('defines %s in both themes', key => {
    for (const palette of [clientColorsLight.status, clientColorsDark.status]) {
      expect(palette[key]).toBeDefined();
      expect(palette[key].label.length).toBeGreaterThan(0);
      expect(palette[key].bg).toMatch(/^#|^rgba/);
      expect(palette[key].dot).toMatch(/^#/);
      expect(palette[key].fg).toMatch(/^#/);
    }
  });

  it('lifts destructive and positive hues for dark mode rather than reusing light', () => {
    expect(clientColorsDark.status.completed.dot).not.toBe(
      clientColorsLight.status.completed.dot,
    );
    expect(clientColorsDark.status.cancelled.dot).not.toBe(
      clientColorsLight.status.cancelled.dot,
    );
  });
});

describe('semantic tokens are defined for both themes', () => {
  it.each(['onPrimary', 'onError', 'surfaceSunken', 'surfaceRaised', 'divider', 'focus'] as const)(
    'defines %s',
    token => {
      expect(clientColorsLight[token]).toMatch(/^#|^rgba/);
      expect(clientColorsDark[token]).toMatch(/^#|^rgba/);
    },
  );

  it('does not tint elevation with the brand hue', () => {
    // A coloured shadow reads as a glow. Light mode uses neutral slate.
    expect(clientColorsLight.shadowColor).toBe('#0F172A');
  });

  it('avoids pure black as the dark background', () => {
    expect(clientColorsDark.background).not.toBe('#000000');
    expect(clientColorsDark.background).not.toBe('#000');
  });
});

describe('sizing', () => {
  it('keeps every control height at or above the 44pt touch target', () => {
    expect(sizing.control.sm).toBeGreaterThanOrEqual(sizing.minTouch);
    expect(sizing.control.md).toBeGreaterThanOrEqual(sizing.minTouch);
    expect(sizing.control.lg).toBeGreaterThanOrEqual(sizing.minTouch);
  });

  it('reserves the floating tab bar height plus its inset', () => {
    expect(sizing.tabBar.reserve).toBe(sizing.tabBar.height + sizing.tabBar.inset);
  });
});

describe('typography', () => {
  it('maps the normal weight to Inter Regular, not Medium', () => {
    expect(typography.weights.normal).toBe('400');
    expect(fontFamilyForWeight[typography.weights.normal]).toBe(fontFamilies.regular);
  });

  it('ships no Light or Thin face for clinical text', () => {
    expect(Object.values(fontFamilies)).not.toContain('Inter-Light');
    expect(Object.values(fontFamilies)).not.toContain('Inter-Thin');
  });

  it('gives every role a size and a weight', () => {
    for (const role of Object.values(textRoles)) {
      expect(typeof role.fontSize).toBe('number');
      expect(role.fontWeight).toBeDefined();
    }
  });

  it('orders the roles from display down to caption', () => {
    const sizes = [
      textRoles.display.fontSize,
      textRoles.heading.fontSize,
      textRoles.section.fontSize,
      textRoles.subtitle.fontSize,
      textRoles.body.fontSize,
      textRoles.label.fontSize,
      textRoles.caption.fontSize,
    ];
    const descending = [...sizes].sort((a, b) => b - a);
    expect(sizes).toEqual(descending);
  });
});

describe('spacing', () => {
  it('ascends monotonically across the 4pt scale', () => {
    const scale = [
      spacing.xs, spacing.sm, spacing.md, spacing.lg,
      spacing.xl, spacing.xxl, spacing.xxxl, spacing.huge, spacing.giant,
    ];
    for (let i = 1; i < scale.length; i++) {
      expect(scale[i]).toBeGreaterThan(scale[i - 1]);
    }
  });
});
