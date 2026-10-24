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
import { hasUrdu, resolveStyle, resolveUrduStyle } from '../src/theme/applyGlobalFont';
import { fontFamilies, urduFontFamilies } from '../src/theme/typography';

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

describe('Urdu text', () => {
  it('detects Urdu in a string or an array of children, not in Latin text', () => {
    expect(hasUrdu('شفا کلینک')).toBe(true);
    expect(hasUrdu(['Dr. ', 'فاطمہ', 3])).toBe(true);
    expect(hasUrdu('Dr. Ayesha Khan')).toBe(false);
    expect(hasUrdu(42)).toBe(false);
    expect(hasUrdu(undefined)).toBe(false);
  });

  it('renders in Nastaliq, bold from 600 up', () => {
    expect(resolveUrduStyle({ fontSize: 16 }).fontFamily).toBe(urduFontFamilies.regular);
    expect(resolveUrduStyle({ fontWeight: '500' }).fontFamily).toBe(urduFontFamilies.regular);
    expect(resolveUrduStyle({ fontWeight: '600' }).fontFamily).toBe(urduFontFamilies.bold);
    expect(resolveUrduStyle({ fontWeight: 'bold' }).fontFamily).toBe(urduFontFamilies.bold);
    expect(resolveUrduStyle({ fontFamily: fontFamilies.extrabold }).fontFamily).toBe(urduFontFamilies.bold);
    expect(resolveUrduStyle({ fontWeight: '700' }).fontWeight).toBeUndefined();
  });

  it('gives every Urdu line at least 1.9x its font size and drops tracking', () => {
    const sheet = StyleSheet.create({ title: { fontSize: 23, lineHeight: 29, letterSpacing: -0.3, fontWeight: '700' } });
    expect(resolveUrduStyle(sheet.title)).toMatchObject({ fontSize: 23, lineHeight: 44, letterSpacing: 0 });
    expect(resolveUrduStyle({ fontSize: 10, lineHeight: 30 }).lineHeight).toBe(30);
    expect(resolveUrduStyle(undefined).lineHeight).toBe(27);
  });

  it('leaves a style that names a non-Inter family untouched', () => {
    expect(resolveUrduStyle({ fontFamily: 'Menlo' }).fontFamily).toBe('Menlo');
  });
});
