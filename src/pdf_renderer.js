import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("src/vendor/pdfjs/pdf.worker.min.mjs");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ping-pdf-renderer") {
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== "render-pdf-page-to-image") return false;

  renderPdfPageToImage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "PDF rendering failed." }));
  return true;
});

async function renderPdfPageToImage({ pdfUrl, pageNumber, maxEdge, tabId, startedAt }) {
  const progress = (status) => {
    chrome.runtime
      .sendMessage({
        type: "pdf-render-progress",
        tabId,
        startedAt,
        source: pdfUrl,
        status
      })
      .catch(() => {});
  };

  progress("Fetching PDF bytes...");
  const pdfData = await fetchPdfBytes(pdfUrl);
  progress(`Loading PDF document (${formatBytes(pdfData.byteLength)})...`);
  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    stopAtErrors: true
  });
  const document = await withTimeout(loadingTask.promise, 15000, "PDF.js did not finish loading the document.");
  const pageCount = document.numPages;
  const safePageNumber = clampInteger(pageNumber, 1, pageCount, 1);
  progress(`Loading PDF page ${safePageNumber} of ${pageCount}...`);
  const page = await withTimeout(
    document.getPage(safePageNumber),
    10000,
    `PDF.js did not finish loading page ${safePageNumber}.`
  );
  const unitViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, maxEdge / Math.max(unitViewport.width, unitViewport.height)));
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const canvasContext = canvas.getContext("2d", { alpha: false });
  progress(`Rendering PDF page to ${canvas.width}x${canvas.height}...`);
  await withTimeout(
    page.render({ canvasContext, viewport }).promise,
    20000,
    `PDF.js did not finish rendering page ${safePageNumber} to canvas.`
  );

  progress("Encoding rendered PDF page...");
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

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fetchPdfBytes(pdfUrl) {
  const response = await fetch(pdfUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`PDF fetch failed (${response.status}).`);
  }

  const pdfData = new Uint8Array(await response.arrayBuffer());
  if (pdfData.byteLength === 0) {
    throw new Error(
      `Fetched 0 bytes from the PDF URL (${new URL(pdfUrl).protocol}). If this is a local file, enable file URL access for the extension; if it is an online PDF, open the direct PDF URL rather than the browser viewer wrapper.`
    );
  }

  if (!isPdfResponse(response, pdfData)) {
    throw new Error(
      `The active tab did not return PDF bytes (${pdfData.byteLength} bytes, content-type: ${
        response.headers.get("content-type") || "unknown"
      }).`
    );
  }

  return pdfData;
}

function isPdfResponse(response, bytes) {
  const contentType = response.headers.get("content-type") || "";
  if (/application\/pdf|application\/x-pdf/i.test(contentType)) {
    return true;
  }

  const header = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  return header === "%PDF-";
}
