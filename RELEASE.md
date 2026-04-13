# Release v0.2.0

## Highlights

- Added streaming model output for text translation, screenshot OCR translation, and screenshot follow-up answers.
- Added elapsed time and image compression status reporting.
- Added screenshot input image display toggle, disabled by default.
- Added configurable screenshot compression with max edge and JPEG quality controls.
- Improved OCR translation prompting so image results are translated into the target language instead of repeated as source text.
- Added configurable thinking request fields for OpenAI-compatible model providers.
- Improved PDF text selection handling with selection and clipboard fallbacks.

## UI Changes

- Reworked the side panel into a fixed top configuration area, scrollable response area, and fixed bottom answer box.
- Added collapsible configuration controls in the side panel.
- Moved text and screenshot actions into a horizontal button row.
- Separated translation output from metadata and status text.
- Added copy buttons for final translation, user messages, and assistant messages.
- Hidden follow-up output until the first question is asked.
- Improved popup layout for image compression controls.

## Rendering Fixes

- Markdown headings now support levels 1 through 6.
- Long code, math, and generated text are constrained to avoid horizontal overflow in the floating panel and side panel.

## Notes

- The extension now requests clipboard permissions for PDF text-selection fallback support.
- Reload the unpacked extension after updating so the new manifest permissions are applied.
