# Readex Pro

Static, unmodified TrueType fonts from the [official Readex Pro repository](https://github.com/ThomasJockin/readexpro/tree/563dfbb36ae45e52ec50829b016ce724ac2fca70/fonts/ttf).

Pinned revision: `563dfbb36ae45e52ec50829b016ce724ac2fca70`.
License: SIL Open Font License 1.1; see `OFL.txt`.

| File | Weight | SHA-256 |
| --- | --- | --- |
| ReadexPro-Regular.ttf | 400 | `0cd21fac7049bc6e2750281dc9991698ef519d14939a940d8bc0c1f883c9e806` |
| ReadexPro-Medium.ttf | 500 | `e8e5143990d521b6fcef8e1f467f5720b26c9c1b263d250f8e5c5db4721dedbb` |
| ReadexPro-SemiBold.ttf | 600 | `94db0bf2752c30ea693e8a637c711b0b479cffa642ea12ae9d1c0262cc831b70` |

iOS references these files directly in the Xcode Resources build phase and registers them in `UIAppFonts`. Android packages identical copies under `android/app/src/main/assets/fonts`. Keep the copies synchronized when updating fonts. Rebuild the native application after updating font assets.

The `readexFont` helper in `src/theme/theme.ts` chooses the correct family/face on each platform; use typography tokens instead of applying unrelated `fontWeight` overrides.
