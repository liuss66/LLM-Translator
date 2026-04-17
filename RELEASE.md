# Release v0.6.0

## Changes

- feat: redesign options into left-side tabs for model config, app config, prompt, keyboard, and backup
- feat: auto-save settings and keep global prompt independent from model presets
- feat: add display language and theme color settings with synchronized popup, side panel, options, and floating panel styling
- feat: add collapsible side panel config and answer areas while keeping the status bar visible
- feat: simplify main popup and side panel controls by hiding compression parameters from the main surface
- feat: show elapsed time and total tokens by default, with TTFT, TPS, input/output tokens, and reasoning tokens on hover
- fix: improve model preset creation and switching flow, including empty llama.cpp model support

## Notes

- Reload the extension after updating.
- Existing model presets are preserved. Prompt and app-level settings are now saved separately from model presets.
