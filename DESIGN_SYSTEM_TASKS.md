# MediQ — UI/UX Redesign Task Tracker

Tracks the visual/motion redesign pass: fonts, animation, and one consistent
design system across splash → auth → patient → staff → admin.

**Scope rule:** this is a UI/styling/animation pass, not a logic pass. Bugs found
while redesigning get logged under "Observations" below, not fixed inline.

---

## Phase A — Design system foundation ✅ COMPLETE

| # | Task | Status |
|---|------|--------|
| A1 | Delete dead `src/theme/medicalTheme.ts` + barrel export | ✅ |
| A2 | Resolve icon library duplication | ✅ |
| A3 | Add Inter font, link natively, wire into typography tokens | ✅ |
| A4 | Install animation/motion libraries | ✅ |
| A5 | Verify typecheck / lint / test / bundle / build on both platforms | ✅ |

### A1 — Dead theme removed
`medicalTheme.ts` exported a *second, conflicting* palette (`#0F766E` teal vs the
canonical `#0E7490` blue) and was re-exported from `src/theme/index.ts`, so a
wildcard import could silently pull the wrong tokens. It had zero real consumers.
Deleted. `useTheme()` + `src/theme/colors.ts` are now the single source of truth.

### A2 — Icon library
`lucide-react-native` is imported in **71** files; `react-native-vector-icons`
was a declared dependency with **zero** imports anywhere in `src/`. No migration
was needed — the dependency and its autolinked `RNVectorIcons` pod were removed.
**Lucide is the only icon library. Do not add another.**

### A3 — Inter
- Inter **4.1** static TTFs in `src/assets/fonts/`: Regular, Medium, SemiBold,
  Bold, ExtraBold (license at `src/assets/Inter-LICENSE.txt`).
- Each file's PostScript name matches its filename exactly, so one family string
  resolves on both iOS (PostScript name) and Android (asset filename).
- Registered via `react-native.config.js` + `npx react-native-asset`
  → `android/app/src/main/assets/fonts/` and iOS `UIAppFonts`.
- Tokens: `typography.fonts` / `fontFamilies` in `src/theme/typography.ts`.

**Screens must never hardcode `fontFamily`.** `src/theme/applyGlobalFont.tsx`
patches `Text`/`TextInput` at the `react-native` module boundary and maps each
style's `fontWeight` onto the matching Inter face, then strips `fontWeight` so
neither platform synthesizes a fake bold on top of an already-bold file. It is
installed from `index.js` via `src/theme/installGlobalFont.ts`, which must stay
imported **above** `./App` — ES imports are hoisted, so ordering is load-bearing.

> Why not `Text.render`? RN 0.84 / React 19 removed `defaultProps` and the
> `.render` property on `Text`, and the automatic JSX runtime bypasses
> `React.createElement`. The module-getter swap is what still works, because
> Babel compiles `<Text>` to a lazy `_reactNative.Text` lookup at render time.

Inter ships upright faces only — italic text will be synthesized by the OS.

### A4 — Libraries installed
| Library | Version | Native? | Purpose |
|---|---|---|---|
| `moti` | ^0.30.0 | no | Screen transitions, stagger, skeletons |
| `@gorhom/bottom-sheet` | ^5.2.14 | no | Replaces plain `Modal` slide-ups |
| `react-native-toast-message` | ^2.5.2 | no | One app-wide toast system |
| `react-native-haptic-feedback` | ^3.0.0 | **yes** | Key-action haptics |
| `lottie-react-native` | ^7.3.8 | yes | *Already present*, only used in `EmptyState` |

`@shopify/react-native-skia` was **not** added — per brief, pending a concrete
need on admin analytics.

**Skeleton import gotcha:** use `import { Skeleton } from 'moti/skeleton'`.
That path imports `expo-linear-gradient`, which bare RN does not have. Rather
than deep-importing moti's unexported bare-RN path (which makes Metro warn on
every build), `metro.config.js` aliases `expo-linear-gradient` to
`src/shims/expo-linear-gradient.ts`, re-exporting the `react-native-linear-gradient`
already in the project.

### A5 — Verification
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 87 errors / 612 warnings — **identical to pre-Phase-A baseline** |
| `jest` | 9/9 passing |
| Metro bundle (iOS) | clean, no warnings |
| Metro bundle (Android) | clean, no warnings |
| `pod install` | RNVectorIcons removed, RNReactNativeHapticFeedback added |

---

## Phase B — Splash + Auth — ⬜ NOT STARTED
## Phase C — Patient flow — ⬜ NOT STARTED
## Phase D — Staff flow — ⬜ NOT STARTED
## Phase E — Admin flow — ⬜ NOT STARTED

---

## Observations (bugs / debt found, deliberately NOT fixed in this pass)

1. **Duplicate store directories.** Both `src/store/` and `src/stores/` exist with
   overlapping modules (`authStore`, `profileStore`, `queueStore`, `themeStore`,
   `toastStore`, …). `useTheme` imports from `src/store/`. Two stores for the same
   concern means state can silently diverge. Needs a consolidation pass of its own.

2. **Reanimated version range was a trap.** `react-native-reanimated: "^4.5.0"`
   resolved upward to 4.6.0, which peers on `react-native-worklets@0.12.x`, while
   the root pinned `^0.10.0` — so *any* `npm install <pkg>` failed with ERESOLVE.
   Pinned both to the exact already-installed, mutually-compatible pair
   (reanimated `4.5.0` / worklets `0.10.0`). The installed tree did not change.
   Upgrading both together is a separate, deliberate task.

3. **Pre-existing lint debt:** 87 eslint errors on `main` before this work began
   (e.g. unused `supabase` import in `src/services/bookingService.ts`). Untouched.

4. **`pod install` needs a UTF-8 locale** on this machine, or CocoaPods 1.16.2
   dies with an `Encoding::CompatibilityError`. Use
   `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
