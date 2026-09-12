# Adriatic Trade v3.13.1 — Logo aspect-ratio hotfix

## Fix
- Footer logo no longer stretches vertically on mobile.
- Corrected malformed `img` dimension attribute placement introduced in v3.13.0.
- Added explicit `height:auto`, square aspect ratio and `object-fit:contain` for the footer logo.
- Added CSS cache-busting query `?v=3.13.1` so phones do not keep the old stylesheet.

No Worker change is required. Worker remains v4.3.0.
