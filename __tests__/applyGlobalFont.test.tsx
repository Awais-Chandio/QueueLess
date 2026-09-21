/**
 * The redesign relies on screens never setting fontFamily themselves, so these
 * assertions guard the weight -> Inter-face mapping that puts Inter everywhere.
 *
 * These exercise resolveStyle directly rather than rendering a <Text>, because
 * react-test-renderer cannot render RN 0.84's Text at all (a plain, unpatched
 * <Text> also serialises to null under this jest setup).
 */
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import { resolveStyle } from '../src/theme/applyGlobalFont';
import { fontFamilies } from '../src/theme/typography';

const resolved = (style: any): TextStyle =>
  StyleSheet.flatten(resolveStyle(style) as any) as TextStyle;

describe('resolveStyle', () => {
  it.each([
    ['400', fontFamilies.regular],
    ['normal', fontFamilies.regular],
    ['500', fontFamilies.medium],
    ['600', fontFamilies.semibold],
    ['700', fontFamilies.bold],
    ['bold', fontFamilies.bold],
    ['800', fontFamilies.extrabold],
    ['900', fontFamilies.extrabold],
  ])('maps fontWeight %s to %s', (weight, expected) => {
    const style = resolved({ fontWeight: weight });
    expect(style.fontFamily).toBe(expected);
    // Left in place, both platforms stack a synthetic bold on an already-bold face.
    expect(style.fontWeight).toBeUndefined();
  });

  it('falls back to Regular when no weight is given', () => {
    expect(resolved({ fontSize: 16 }).fontFamily).toBe(fontFamilies.regular);
  });

  it('preserves every other declaration', () => {
    expect(resolved({ fontSize: 22, color: '#0E7490', fontWeight: '700' })).toMatchObject({
      fontSize: 22,
      color: '#0E7490',
      fontFamily: fontFamilies.bold,
    });
  });

  it('resolves registered StyleSheet styles', () => {
    const sheet = StyleSheet.create({ title: { fontWeight: '600', fontSize: 18 } });
    const style = resolved(sheet.title);
    expect(style.fontFamily).toBe(fontFamilies.semibold);
    expect(style.fontSize).toBe(18);
  });

  it('honours the last entry of a style array, as RN would', () => {
    const sheet = StyleSheet.create({ title: { fontWeight: '600' } });
    expect(resolved([sheet.title, { fontWeight: '800' }]).fontFamily).toBe(
      fontFamilies.extrabold,
    );
  });

  it('leaves a style that names its own family untouched', () => {
    expect(resolved({ fontFamily: 'Menlo', fontWeight: '700' }).fontFamily).toBe('Menlo');
  });

  it('passes null and undefined straight through', () => {
    expect(resolveStyle(null)).toBeNull();
    expect(resolveStyle(undefined)).toBeUndefined();
  });

  it('returns a cached result for the same registered style', () => {
    const sheet = StyleSheet.create({ a: { fontWeight: '700' } });
    expect(resolveStyle(sheet.a)).toBe(resolveStyle(sheet.a));
  });
});
