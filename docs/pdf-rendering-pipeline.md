# PDF Rendering Pipeline Experiment

This branch tests rendering a PDF page directly before OCR translation instead of relying only on the browser viewport screenshot.

## Current Approach

- Detect PDF tabs from the active tab URL.
- Parse `#page=N` when present, falling back to page 1.
- Fetch the PDF bytes from the detected PDF URL with extension host permissions.
- Render the page in an MV3 offscreen document using vendored PDF.js.
- Send the rendered page image through the existing screenshot OCR translation pipeline.
- Fall back to `chrome.tabs.captureVisibleTab` if PDF fetch or rendering fails.

## Expected Benefits

- Avoids browser toolbar, PDF viewer controls, scrollbars, and page margins in OCR input.
- Produces a stable page image independent of current zoom level.
- Allows rendering the logical PDF page rather than only the visible viewport.

## Known Limits

- Local `file://` PDFs require the user to enable file access for the extension.
- Authenticated PDFs depend on whether extension `fetch` can access the PDF URL with cookies.
- Chrome's built-in PDF viewer does not always expose the current page number in the tab URL. Without `#page=N`, this experiment renders page 1.
- Some PDFs may need extra PDF.js assets such as CMaps, standard fonts, or wasm decoders. The experiment currently vendors only the core browser build and worker.

## Manual Test

1. Reload the unpacked extension.
2. Open a directly accessible PDF URL.
3. Navigate to `#page=2` or another explicit page.
4. Use the `Page` button or `Alt+A`.
5. Confirm the status source shows `PDF page N of M`.
6. Test a PDF URL that blocks fetch; the action should fall back to visible screenshot translation.
