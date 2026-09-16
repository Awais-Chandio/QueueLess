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
| Android `assembleDebug` | **passing** (exit 0) |

APK contents verified rather than trusting the exit code: all five Inter faces
present under `assets/fonts/`, zero vector-icons font files, and
`RNReactNativeHapticFeedbackPackage` autolinked into the generated
`PackageList.java` with no `vector` entry remaining.

The iOS native build was not run here — `pod install` succeeded and the iOS
Metro bundle is clean, but an Xcode build still needs a run on a Mac with a
configured simulator/signing before Phase B is considered shipped.

---

## Brand assets — ✅ COMPLETE (out-of-phase task)

**Launcher icon** — replaced the placeholder with the approved **Check M** mark:
the M's centre valley drawn as an asymmetric checkmark, tinted in the accent, so
"confirmed / your turn" sits inside the monogram. Three concepts were reviewed
first (see `icon-concepts/`); the outgoing placeholder was both more intricate
than a launcher icon can carry and off-brand, running on a `#1565FF` blue found
nowhere in the theme tokens.

Everything is generated by `scripts/generate-app-icons.js` from one source of
truth — **regenerate with `node scripts/generate-app-icons.js`, never by hand.**
It writes 38 files (Android mipmaps ×5 densities, iOS AppIcon ×9, store assets,
SVG/PNG masters) and verifies every one for exact pixel dimensions and channel
count before exiting non-zero on any mismatch.

Two details worth keeping in mind when touching icons again:
- The adaptive **foreground** scales the mark by 72/108 so it appears at the same
  visual size as the legacy icon once a launcher masks it.
- iOS icons are **flattened** — the App Store rejects an icon with an alpha channel.

**Wordmark** — `src/components/ui/Wordmark.tsx` is now the only way the app name
should be rendered as branding. Inter ExtraBold, tracking −0.028em, accent Q.
Applied to splash, login, phone login, OTP, forgot password, the About screen's
brand section and the patient home hero. **Not** applied inside running sentences
or settings rows, where a logotype reads as a typo.

`MedicalLogo` now carries the same Check M geometry as the launcher icon. If the
mark ever changes, change it in both `MedicalLogo.tsx` and
`scripts/generate-app-icons.js` or the in-app logo and home-screen icon drift.

## Phase B — Splash + Auth — 🟨 IN PROGRESS

Scope is `src/features/auth/components/`: Splash, Onboarding, Login, Signup,
PhoneLogin, OTPVerification, ForgotPassword, ResetPassword.

### Done this pass — token/dark-mode correctness + duplication
| # | Task | Status |
|---|------|--------|
| B1 | Extract the 5x-duplicated fade/slide/logo-pop mount animation into `useAuthEntranceAnimation` | ✅ |
| B2 | Replace hardcoded `#EF4444`/`#22C55E` error/success text with `colors.error`/`colors.success` (Login, Signup, PhoneLogin, OTP, ForgotPassword) | ✅ |
| B3 | Remove the hardcoded `crossColor="#14B8A6"` override on `Floating3DLogo` across all 5 screens | ✅ |
| B4 | Convert `PhoneLoginScreen`'s country picker from a plain `Modal` to `AppBottomSheet` | ✅ |
| B5 | Fix `OnboardingScreen`'s off-brand background gradient (`#1e3a8a`/`#0f766e` — outside the palette, and a jarring bright gradient in dark mode) to theme tokens | ✅ |

**B3 detail:** `MedicalLogo.tsx` already has a deliberately-tuned default —
`checkColor = crossColor || (showBackground ? '#5EEAD4' : colors.accent)` — a
lighter tint calibrated for contrast against the primary gradient, matching the
app icon. Every auth screen's header logo was passing a *hardcoded*
`crossColor="#14B8A6"`, which silently overrode that tuned default with a value
that (a) doesn't match the icon's on-gradient tint and (b) never changes in
dark mode. Deleting the prop lets the existing considered default apply.

**B2/B3 pattern:** none of this was a random hardcoded color — every instance
was a value that already exists as a semantic token (`colors.error`,
`colors.success`, `colors.accent`, `colors.warning`) but was pinned to its
light-mode hex instead of reading the token, so it silently stayed the same
color when the OS switched to dark mode. Same root cause as the doctor/staff
queue-screen dark-mode gap flagged in Phase A's Observations — just in auth.

### Verified after this pass
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 79 errors / 569 warnings (was 83/577 — net improvement, no new errors in touched files) |
| `jest` | 70/70 passing |
| Metro bundle (Android, `--dev false`) | clean, no errors |

### Not done yet — remaining for Phase B to be complete
- Screens still use raw `<Text>` with hand-set `fontSize`/`fontWeight` rather
  than `AppText` variants. Not a correctness bug (global font patching still
  applies), but it's the inconsistent-typography pattern `AppText` exists to
  fix, and these screens predate it.
- Screen-entry animation still runs on the legacy `Animated` API rather than
  Moti, per Section 19's guidance. Left as-is this pass because it already
  works and converting five screens' worth of interleaved fade/slide/step-wizard
  animation is a larger, separable change — flagging rather than doing it
  half-supervised.
- `OTPVerificationScreen` mixes `Animated` (RN) for mount and `Animated`
  (Reanimated, aliased) for shake/success in the same file. Works, but is a
  legibility smell worth a follow-up unification.
- No structural/spacing-rhythm redesign of the card layouts yet (Section 34's
  "premium via execution" bar) — this pass fixed correctness and duplication,
  not visual redesign depth.
- `SplashScreen.tsx` was reviewed and left untouched: its animated background
  (heartbeat pulse, signal-field paths, rising particles) is already a
  deliberate, premium, brand-consistent treatment predating this tracker —
  no changes needed.

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

3. **`scripts/generate_icons.js` is a landmine.** It is the *old placeholder*
   icon generator — it still draws the pin mark and the off-brand `#1565FF`
   gradient, and writes to the same paths as the new generator. Running it would
   silently overwrite the approved Check M icon set across both platforms. It is
   superseded by `scripts/generate-app-icons.js` and should be deleted, but that
   was outside the scope of the icon task.

4. **Pre-existing lint debt:** 87 eslint errors on `main` before this work began
   (e.g. unused `supabase` import in `src/services/bookingService.ts`). Untouched.

5. **`pod install` needs a UTF-8 locale** on this machine, or CocoaPods 1.16.2
   dies with an `Encoding::CompatibilityError`. Use
   `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
