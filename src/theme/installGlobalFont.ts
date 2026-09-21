/**
 * Side-effect entry point for the app-wide Inter font.
 *
 * This exists as its own module because ES import declarations are hoisted:
 * calling `applyGlobalFont()` inline in index.js would run *after* './App' had
 * already been required. Babel emits the hoisted `require` calls in source
 * order, so importing this module above './App' guarantees the patch is
 * installed before any screen module is evaluated.
 */
import { applyGlobalFont } from './applyGlobalFont';

applyGlobalFont();
