import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("src/vendor/pdfjs/pdf.worker.min.mjs");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "render-pdf-page-to-image") return false;

  renderPdfPageToImage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "PDF rendering failed." }));
  return true;
});

async function renderPdfPageToImage({ pdfData, pageNumber, maxEdge }) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfData),
    useWorkerFetch: false,
    isEvalSupported: false
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const safePageNumber = clampInteger(pageNumber, 1, pageCount, 1);
  const page = await document.getPage(safePageNumber);
  const unitViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, maxEdge / Math.max(unitViewport.width, unitViewport.height)));
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const canvasContext = canvas.getContext("2d", { alpha: false });
  await page.render({ canvasContext, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  await document.destroy();
  return {
    dataUrl,
    pageNumber: safePageNumber,
    pageCount,
    width: canvas.width,
    height: canvas.height
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
