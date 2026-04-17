# Release v0.6.2

## Changes

- fix: cancel active stream readers so Stop works during thinking output
- fix: keep thinking, theme, language, and model preset state synchronized across popup, side panel, and options
- fix: ignore stale translation results so older streaming or final responses cannot overwrite the current task
- feat: respect manual scrolling during streaming output while still auto-following new translation and chat streams
- feat: improve Options autosave feedback with Saving, Saved, and Save failed states
- refactor: centralize defaults, model setting keys, and settings normalization in a shared settings module
- test: add settings normalization and model field picking tests

## Notes

- Reload the extension after updating.
- Existing settings and model presets are preserved.
