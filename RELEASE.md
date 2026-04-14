# Release v0.4.0

## Major Updates

- Added Markdown/GFM regression tests and expanded rendering support for blockquotes, bare links, footnotes, task lists, tables, separators, superscript/subscript, formulas, and highlighted fenced code blocks.
- Added screenshot input preview: click the input image to enlarge it, and compare the original page screenshot with the cropped input image when current-page crop succeeds.
- Added Stop support for in-progress streaming requests.
- Added provider templates plus settings import, export, and restore-defaults controls.
- Improved user-facing error messages for API, network, side panel, screenshot, empty input, and cancellation cases.
- Added extension packaging and release scripts. Store upload packages include only `manifest.json` and `src/`, excluding Git and development files.

## Notes

- Reload the extension after updating.
- The store upload zip can be generated with `npm run package`.
