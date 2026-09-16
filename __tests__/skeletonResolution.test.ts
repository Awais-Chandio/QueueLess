/**
 * `moti/skeleton` is the only skeleton subpath moti exports, and it imports
 * `expo-linear-gradient`, which a bare React Native app does not have. Two
 * separate aliases keep it working — one in `metro.config.js` for the app
 * bundle and one in `jest.config.js` for tests — both pointing at
 * `src/shims/expo-linear-gradient.ts`.
 *
 * They are easy to break independently, and the failure mode is a red screen at
 * runtime rather than a type error, so this asserts the import path resolves.
 */
describe('skeleton module resolution', () => {
  it('resolves moti/skeleton through the expo-linear-gradient shim', () => {
    const moti = require('moti/skeleton');
    expect(moti.Skeleton).toBeDefined();
  });

  it('exports the shim as both a named and a default LinearGradient', () => {
    const shim = require('../src/shims/expo-linear-gradient');
    expect(shim.LinearGradient).toBeDefined();
    expect(shim.default).toBeDefined();
  });

  it('exports every skeleton preset the screens use', () => {
    const skeleton = require('../src/components/ui/Skeleton');
    expect(skeleton.Skeleton).toBeDefined();
    expect(skeleton.SkeletonText).toBeDefined();
    expect(skeleton.SkeletonCard).toBeDefined();
    expect(skeleton.SkeletonList).toBeDefined();
  });
});
