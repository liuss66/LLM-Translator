# Release v0.3.4

## Fixes

- Added Markdown horizontal rule rendering for separator lines such as `---`, `***`, and `___`.
- Added safe inline `<sup>` and `<sub>` rendering for superscript and subscript text.
- Kept other raw HTML escaped while allowing only supported superscript and subscript tags.

## Notes

- Reload the extension after updating so the refreshed Markdown renderer and styles are applied.
