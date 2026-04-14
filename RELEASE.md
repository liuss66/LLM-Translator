# Release v0.3.0

## Highlights

- Added current visible page translation via the `Page` action and the default `Alt+A` shortcut.
- Added automatic reader margin cropping for current-page translation before image compression and model upload.
- Added a `Crop` switch, enabled by default, for controlling current-page margin cropping.
- Current-page status now reports crop dimensions, compression details, elapsed time, or the reason cropping was skipped.
- Updated README usage, settings, shortcut, release, and publishing notes for the current feature set.

## UI Changes

- Shortened popup and side panel labels to `OCR`, `Image`, `Think`, `Crop`, `Edge`, and `Quality`.
- Put the `Model` label and model preset dropdown on the same row in the popup and side panel.
- Added the `Crop` control to the popup, side panel, and options page.
- Kept current-page cropping scoped to full-page capture so manually selected screenshot regions are unchanged.

## Notes

- `Page` translation uses the current visible browser screenshot, which is useful for PDF viewer pages and scanned documents.
- Reload the unpacked extension after updating so the new command and settings defaults are applied.
- The experimental PDF rendering pipeline is not included in this release; this release uses the stable visible-page screenshot flow.
