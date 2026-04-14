# Release v0.3.2

## Fixes

- Fixed intermittent side panel open failures caused by passing Chrome's `WINDOW_ID_CURRENT` sentinel value to `sidePanel.open()`.
- Fixed popup side panel opening so it stays inside the user click gesture required by Chrome.
- Added active tab/window fallback handling for shortcut and content-script side panel entry points.

## Notes

- Reload the extension after updating so the background service worker and popup script are refreshed.
