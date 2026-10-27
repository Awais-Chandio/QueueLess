import React from 'react';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import { URDU_LINE_HEIGHT, fontFamilies, fontFamilyForWeight, urduFontFamilies } from './typography';

/**
 * Makes Inter the app-wide default without editing a single screen.
 *
 * React Native 0.84 / React 19 removed the `Text.render` and `defaultProps`
 * hooks that older global-font shims relied on, and the automatic JSX runtime
 * bypasses `React.createElement`. What still works is the module boundary:
 * `react-native`'s index exports `Text`/`TextInput` as configurable getters,
 * and Babel compiles `<Text>` to a lazy `_reactNative.Text` lookup performed at
 * render time. Swapping the getter before the first render therefore reaches
 * every call site, including ones inside third-party packages.
 *
 * Call this once from index.js, before `App` is imported.
 */

export type StyleProp = TextStyle | number | null | undefined | ReadonlyArray<StyleProp>;

// Resolved styles are cached so we flatten each distinct style only once.
// Registered StyleSheet styles arrive as numbers; inline objects/arrays are
// keyed weakly so they are collected with the component that created them.
const numericCache = new Map<number, TextStyle>();
const objectCache = new WeakMap<object, TextStyle>();

export function resolveStyle(style: StyleProp): StyleProp {
  if (style == null) {
    return style;
  }

  const cached =
    typeof style === 'number'
      ? numericCache.get(style)
      : typeof style === 'object'
      ? objectCache.get(style as object)
      : undefined;
  if (cached !== undefined) {
    return cached;
  }

  const flat = (StyleSheet.flatten(style as never) ?? {}) as TextStyle;

  // A style that names its own family is left exactly as the author wrote it.
  if (flat.fontFamily) {
    return style;
  }

  const weightKey = flat.fontWeight == null ? '400' : String(flat.fontWeight);
  const resolved: TextStyle = {
    ...flat,
    fontFamily: fontFamilyForWeight[weightKey] ?? fontFamilies.regular,
  };
  // Inter ships one file per weight. Leaving fontWeight set on top of an
  // already-bold face makes both platforms synthesize a second, heavier bold.
  delete resolved.fontWeight;

  if (typeof style === 'number') {
    numericCache.set(style, resolved);
  } else if (typeof style === 'object') {
    objectCache.set(style as object, resolved);
  }
  return resolved;
}

const baseStyle: TextStyle = { fontFamily: fontFamilies.regular };

// Arabic, Arabic Supplement, Extended-A and the presentation forms: the
// blocks Urdu is written in.
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** True when the text a <Text> renders directly (not nested <Text>) has Urdu in it. */
export function hasUrdu(content: unknown): boolean {
  if (typeof content === 'string') {
    return ARABIC_SCRIPT.test(content);
  }
  return Array.isArray(content) && content.some(hasUrdu);
}

const BOLD_FAMILIES: string[] = [fontFamilies.semibold, fontFamilies.bold, fontFamilies.extrabold];
// RN's default when a style sets no fontSize.
const DEFAULT_FONT_SIZE = 14;

/**
 * Same contract as `resolveStyle`, for Urdu: Nastaliq (bold from 600 up),
 * a line tall enough for its ascenders and descenders, and no tracking,
 * which would break the joins between letters. Not cached: Urdu strings
 * are rare in the app and their styles are mostly inline.
 */
export function resolveUrduStyle(style: StyleProp): TextStyle {
  const flat = (StyleSheet.flatten(style as never) ?? {}) as TextStyle;
  if (flat.fontFamily && !flat.fontFamily.startsWith('Inter')) {
    return flat;
  }
  const weight = flat.fontWeight == null ? 400 : flat.fontWeight === 'bold' ? 700 : Number(flat.fontWeight) || 400;
  const bold = flat.fontFamily ? BOLD_FAMILIES.includes(flat.fontFamily) : weight >= 600;
  const fontSize = flat.fontSize ?? DEFAULT_FONT_SIZE;
  const resolved: TextStyle = {
    ...flat,
    fontFamily: bold ? urduFontFamilies.bold : urduFontFamilies.regular,
    lineHeight: Math.max(flat.lineHeight ?? 0, Math.ceil(fontSize * URDU_LINE_HEIGHT)),
    letterSpacing: 0,
  };
  delete resolved.fontWeight;
  return resolved;
}

type TextLikeProps = {
  style?: StyleProp;
  children?: unknown;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
};

function withInter<P extends TextLikeProps>(
  Original: React.ComponentType<P>,
  name: string,
): React.ComponentType<P> {
  const Wrapped = (props: P) => {
    // `style` is read off props rather than pulled out with a rest spread so
    // that `ref` and every other prop pass through untouched.
    const urdu =
      name === 'TextInput'
        ? hasUrdu(props.value ?? props.defaultValue ?? props.placeholder)
        : hasUrdu(props.children);
    const style = (
      urdu ? resolveUrduStyle(props.style) : props.style === undefined ? baseStyle : resolveStyle(props.style)
    ) as P['style'];
    return <Original {...props} style={style} />;
  };
  Wrapped.displayName = name;
  return Wrapped;
}

let applied = false;

export function applyGlobalFont(): void {
  if (applied) {
    return;
  }
  applied = true;

  const RN = require('react-native');

  (['Text', 'TextInput'] as const).forEach((name) => {
    const Original = RN[name];
    if (!Original) {
      return;
    }
    const Patched = withInter(Original, name);
    Object.defineProperty(RN, name, {
      configurable: true,
      enumerable: true,
      get: () => Patched,
    });
  });
}
