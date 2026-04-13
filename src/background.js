const DEFAULT_SETTINGS = {
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  textModel: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  targetLanguage: "中文",
  showOcrResult: false,
  showInputImage: false,
  compressInputImage: true,
  imageMaxEdge: 1600,
  imageJpegQuality: 0.88,
  enableThinking: false,
  thinkingRequestFields: "enable_thinking\nchat_template_kwargs.enable_thinking",
  currentPresetId: "",
  modelPresets: [],
  systemPrompt:
    "You are a precise translation assistant. Preserve meaning, technical terms, formatting, and numbers. Return only the translation unless OCR text is requested."
};
const MODEL_SETTING_KEYS = [
  "provider",
  "apiBaseUrl",
  "apiKey",
  "textModel",
  "visionModel",
  "targetLanguage",
  "enableThinking",
  "thinkingRequestFields",
  "systemPrompt"
];

const MENU_TRANSLATE_SELECTION = "translate-selection";
const MENU_TRANSLATE_SCREENSHOT = "translate-screenshot-region";
const MENU_TRANSLATE_PAGE = "translate-current-page";
let lastResult = null;
const sidePanelPorts = new Set();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const missing = Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).filter(([key]) => existing[key] === undefined)
  );

  if (Object.keys(missing).length > 0) {
    await chrome.storage.sync.set(missing);
  }

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_TRANSLATE_SELECTION,
    title: "Translate selected text",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: MENU_TRANSLATE_SCREENSHOT,
    title: "Translate screen region",
    contexts: ["page", "selection", "image"]
  });

  chrome.contextMenus.create({
    id: MENU_TRANSLATE_PAGE,
    title: "Translate current page screenshot",
    contexts: ["page", "selection", "image"]
  });

  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_TRANSLATE_SELECTION) {
    const text = info.selectionText || "";
    runForTab(tab.id, () => translateSelection(tab.id, text));
    return;
  }

  if (info.menuItemId === MENU_TRANSLATE_SCREENSHOT) {
    runForTab(tab.id, () => startRegionSelection(tab.id));
    return;
  }

  if (info.menuItemId === MENU_TRANSLATE_PAGE) {
    runForTab(tab.id, () => translateCurrentPage(tab.id, tab.windowId));
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === MENU_TRANSLATE_SELECTION) {
    runForTab(tab.id, async () => {
      await translateSelection(tab.id, await readSelectedTextFromTab(tab.id));
    });
    return;
  }

  if (command === MENU_TRANSLATE_SCREENSHOT) {
    runForTab(tab.id, () => startRegionSelection(tab.id));
    return;
  }

  if (command === MENU_TRANSLATE_PAGE) {
    runForTab(tab.id, () => translateCurrentPage(tab.id, tab.windowId));
    return;
  }

  if (command === "open-side-panel") {
    await openSidePanel(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-side-panel" && sender.tab?.id) {
    const openPromise = chrome.sidePanel.open({
      tabId: sender.tab.id
    });
    chrome.storage.session.set({ sidePanelOpen: true });
    openPromise
      .then(async () => {
        await hideFloatingPanel(sender.tab.id);
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error(error);
        chrome.storage.session.set({ sidePanelOpen: false });
        sendResponse({ ok: false, error: error.message || "Failed to open side panel." });
      });
    return true;
  }

  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch(async (error) => {
      console.error(error);
      if (sender.tab?.id) {
        try {
          await showResult(sender.tab.id, {
            title: "Translation failed",
            source: "",
            translation: error.message || "Unexpected error"
          });
        } catch (displayError) {
          console.error(displayError);
        }
      }
      sendResponse({ ok: false, error: error.message || "Unexpected error" });
    });
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") return;
  sidePanelPorts.add(port);
  chrome.storage.session.set({ sidePanelOpen: true });
  port.onDisconnect.addListener(() => {
    sidePanelPorts.delete(port);
    if (sidePanelPorts.size === 0) {
      chrome.storage.session.set({ sidePanelOpen: false });
    }
  });
});

async function handleMessage(message, sender) {
  if (message?.type === "translate-selection") {
    const tabId = sender.tab?.id || message.tabId;
    if (!tabId) throw new Error("No active tab found.");
    await translateSelection(tabId, message.text || "");
    return { ok: true };
  }

  if (message?.type === "start-region-selection") {
    const tabId = sender.tab?.id || (await getActiveTabId());
    await startRegionSelection(tabId);
    return { ok: true };
  }

  if (message?.type === "translate-current-page") {
    const tab = await getActiveTab();
    await runForTab(tab.id, async () => {
      await translateCurrentPage(tab.id, tab.windowId);
    });
    return { ok: true };
  }

  if (message?.type === "translate-active-selection") {
    const tabId = await getActiveTabId();
    await runForTab(tabId, async () => {
      await translateSelection(tabId, message.text || (await readSelectedTextFromTab(tabId)));
    });
    return { ok: true };
  }

  if (message?.type === "open-side-panel") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    await openSidePanel(tab);
    return { ok: true };
  }

  if (message?.type === "mark-side-panel-open") {
    await chrome.storage.session.set({ sidePanelOpen: true });
    if (message.tabId) {
      await hideFloatingPanel(message.tabId);
    }
    return { ok: true };
  }

  if (message?.type === "floating-panel-closed") {
    return { ok: true };
  }

  if (message?.type === "get-last-result") {
    if (!lastResult) {
      const stored = await chrome.storage.session.get("lastResult");
      lastResult = stored.lastResult || null;
    }
    return { ok: true, result: lastResult };
  }

  if (message?.type === "test-model") {
    const result = await testModel(message.settings || {});
    return { ok: true, result };
  }

  if (message?.type === "get-settings") {
    return { ok: true, settings: await readSettings() };
  }

  if (message?.type === "update-settings") {
    await chrome.storage.sync.set(message.settings || {});
    return { ok: true, settings: await readSettings() };
  }

  if (message?.type === "switch-model-preset") {
    const result = await switchModelPreset(message.presetId || "");
    return { ok: true, ...result };
  }

  if (message?.type === "ask-last-screenshot") {
    const startedAt = Date.now();
    const answer = await askLastScreenshot(message.question || "", message.history || [], async (partial) => {
      if (!message.requestId) return;
      chrome.runtime
        .sendMessage({
          type: "chat-stream-updated",
          requestId: message.requestId,
          answer: partial,
          startedAt,
          isStreaming: true
        })
        .catch(() => {});
    });
    return { ok: true, answer, elapsedMs: Date.now() - startedAt };
  }

  if (message?.type === "region-selected") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId || !windowId) throw new Error("No source tab found.");
    await translateScreenshotRegion(tabId, windowId, message.rect);
    return { ok: true };
  }

  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  }

  return { ok: false, error: "Unknown message type." };
}

async function getActiveTabId() {
  return (await getActiveTab()).id;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  if (!tab.windowId) throw new Error("No active window found.");
  return tab;
}

async function runForTab(tabId, task) {
  try {
    await task();
  } catch (error) {
    console.error(error);
    await showResult(tabId, {
      title: "Translation failed",
      source: "",
      translation: error.message || "Unexpected error"
    });
  }
}

async function openSidePanel(tab) {
  if (!chrome.sidePanel?.open) {
    throw new Error("Chrome side panel API is not available in this browser.");
  }
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.storage.session.set({ sidePanelOpen: true });
  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "hide-translation" });
  } catch (error) {
    console.error(error);
  }
}

async function readSelectedTextFromTab(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectSelectedText
  });
  return result || "";
}

function collectSelectedText() {
  const seen = new Set();
  const parts = [];

  const add = (value) => {
    const text = String(value || "").trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      parts.push(text);
    }
  };

  const readRoot = (root) => {
    try {
      add(root.getSelection?.().toString());
    } catch {}

    try {
      const active = root.activeElement;
      if (
        active &&
        typeof active.value === "string" &&
        Number.isInteger(active.selectionStart) &&
        Number.isInteger(active.selectionEnd) &&
        active.selectionEnd > active.selectionStart
      ) {
        add(active.value.slice(active.selectionStart, active.selectionEnd));
      }
    } catch {}

    let elements = [];
    try {
      elements = Array.from(root.querySelectorAll?.("*") || []);
    } catch {}

    for (const element of elements) {
      if (element.shadowRoot) {
        readRoot(element.shadowRoot);
      }
      if (element.tagName === "IFRAME") {
        try {
          if (element.contentDocument) {
            readRoot(element.contentDocument);
          }
        } catch {}
      }
    }
  };

  readRoot(document);
  return parts.join("\n\n");
}

async function translateSelection(tabId, rawText) {
  const text = rawText.trim();
  if (!text) {
    await showResult(tabId, {
      title: "No text selected",
      source: "",
      translation: "Select text in the page or PDF first, then run translation."
    });
    return;
  }

  const startedAt = Date.now();
  await showResult(tabId, {
    title: "Translating...",
    source: text,
    translation: "Waiting for model response.",
    startedAt,
    isStreaming: true
  });

  const settings = await getSettings();
  const translation = await translateText(settings, text, async (partial) => {
    await showResult(tabId, {
      title: `Translating to ${settings.targetLanguage}...`,
      source: text,
      translation: removeReasoningBlocks(partial, settings),
      startedAt,
      isStreaming: true
    });
  });
  await showResult(tabId, {
    title: `Translated to ${settings.targetLanguage}`,
    source: text,
    translation: removeReasoningBlocks(translation, settings),
    startedAt,
    elapsedMs: Date.now() - startedAt
  });
}

async function startRegionSelection(tabId) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "start-region-selection" });
}

async function translateScreenshotRegion(tabId, windowId, rect) {
  validateRect(rect);
  const startedAt = Date.now();
  await showResult(tabId, {
    title: "Recognizing...",
    source: "",
    translation: "Capturing the selected area and asking the model to read it.",
    startedAt,
    isStreaming: true
  });

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const croppedDataUrl = await cropDataUrl(dataUrl, rect);
  await translateScreenshotImage(tabId, croppedDataUrl, {
    source: "Selected screen region",
    initialTitle: "Recognizing...",
    startedAt
  });
}

async function translateCurrentPage(tabId, windowId) {
  const startedAt = Date.now();
  await showResult(tabId, {
    title: "Recognizing current page...",
    source: "",
    translation: "Capturing the current visible page and asking the model to read it.",
    startedAt,
    isStreaming: true
  });

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const pdfTarget = getPdfRenderTarget(tab?.url || "");
  if (pdfTarget) {
    try {
      const settings = await getSettings();
      const renderedPage = await renderPdfPageFromUrl(pdfTarget, settings);
      await translateScreenshotImage(tabId, renderedPage.dataUrl, {
        source: `PDF page ${renderedPage.pageNumber} of ${renderedPage.pageCount}`,
        initialTitle: "Recognizing PDF page...",
        startedAt
      });
      return;
    } catch (error) {
      console.warn("PDF rendering failed; falling back to visible tab capture.", error);
    }
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  await translateScreenshotImage(tabId, dataUrl, {
    source: "Current visible page",
    initialTitle: "Recognizing current page...",
    startedAt
  });
}

function getPdfRenderTarget(tabUrl) {
  if (!tabUrl) return null;

  let url;
  try {
    url = new URL(tabUrl);
  } catch {
    return null;
  }

  const embeddedPdfUrl = url.searchParams.get("src");
  const pdfUrl = embeddedPdfUrl || tabUrl;
  let parsedPdfUrl;
  try {
    parsedPdfUrl = new URL(pdfUrl);
  } catch {
    return null;
  }

  const looksLikePdf = /\.pdf(?:$|[?#])/i.test(parsedPdfUrl.href) || parsedPdfUrl.pathname.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return null;

  return {
    url: parsedPdfUrl.href,
    pageNumber: readPdfPageNumber(url.hash) || readPdfPageNumber(parsedPdfUrl.hash) || 1
  };
}

function readPdfPageNumber(hash) {
  const match = /(?:^|[#&])page=(\d+)/i.exec(hash || "");
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

async function renderPdfPageFromUrl(pdfTarget, settings) {
  const response = await fetch(pdfTarget.url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`PDF fetch failed (${response.status}).`);
  }

  await ensurePdfRendererDocument();
  const pdfData = await response.arrayBuffer();
  const renderMaxEdge = clampInteger(settings.imageMaxEdge, 320, 4096, DEFAULT_SETTINGS.imageMaxEdge);
  const responseMessage = await chrome.runtime.sendMessage({
    type: "render-pdf-page-to-image",
    pdfData,
    pageNumber: pdfTarget.pageNumber,
    maxEdge: renderMaxEdge
  });

  if (!responseMessage?.ok) {
    throw new Error(responseMessage?.error || "PDF rendering failed.");
  }
  return responseMessage.result;
}

async function ensurePdfRendererDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("Offscreen documents are not available in this browser.");
  }

  const documentUrl = chrome.runtime.getURL("src/offscreen.html");
  const contexts = await chrome.runtime.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl]
  });
  if (contexts?.length) return;

  await chrome.offscreen.createDocument({
    url: "src/offscreen.html",
    reasons: ["BLOBS"],
    justification: "Render PDF pages to images for OCR translation."
  });
}

async function translateScreenshotImage(tabId, imageDataUrl, options) {
  const settings = await getSettings();
  const preparedImage = await prepareImageForModel(imageDataUrl, settings);
  await showResult(tabId, {
    title: options.initialTitle,
    source: options.source,
    translation: "Waiting for model response.",
    imageUrl: preparedImage.dataUrl,
    showInputImage: settings.showInputImage,
    imageInfo: preparedImage.info,
    startedAt: options.startedAt,
    isStreaming: true
  });
  const translation = await translateImage(settings, preparedImage.dataUrl, async (partial) => {
    await showResult(tabId, {
      title: `OCR translating to ${settings.targetLanguage}...`,
      source: options.source,
      translation: removeReasoningBlocks(partial, settings),
      imageUrl: preparedImage.dataUrl,
      showInputImage: settings.showInputImage,
      imageInfo: preparedImage.info,
      startedAt: options.startedAt,
      isStreaming: true
    });
  });

  await showResult(tabId, {
    title: `OCR translated to ${settings.targetLanguage}`,
    source: options.source,
    translation: removeReasoningBlocks(translation, settings),
    imageUrl: preparedImage.dataUrl,
    showInputImage: settings.showInputImage,
    imageInfo: preparedImage.info,
    startedAt: options.startedAt,
    elapsedMs: Date.now() - options.startedAt
  });
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });
    if (!response?.hasMarkdown || !response?.hasKatex) {
      await injectContentAssets(tabId);
    }
  } catch {
    await injectContentAssets(tabId);
  }
}

async function injectContentAssets(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["src/vendor/katex/katex.min.css", "src/content.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/vendor/katex/katex.min.js", "src/markdown.js", "src/content.js"]
  });
}

async function showResult(tabId, payload) {
  lastResult = {
    ...payload,
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.session.set({ lastResult });
  chrome.runtime.sendMessage({ type: "last-result-updated", result: lastResult }).catch(() => {});
  if (await isSidePanelOpen()) {
    await hideFloatingPanel(tabId);
    return;
  }
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, {
    type: "show-translation",
    payload
  });
}

async function isSidePanelOpen() {
  if (sidePanelPorts.size > 0) return true;
  const { sidePanelOpen } = await chrome.storage.session.get("sidePanelOpen");
  return Boolean(sidePanelOpen);
}

async function getSettings() {
  const settings = await readSettings();

  if (settings.provider !== "llamacpp" && !settings.apiKey) {
    throw new Error("API key is missing. Open extension options and set it first.");
  }

  return settings;
}

async function readSettings() {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
  };

  settings.apiBaseUrl = settings.apiBaseUrl.replace(/\/+$/, "");
  settings.compressInputImage = Boolean(settings.compressInputImage);
  settings.imageMaxEdge = clampInteger(settings.imageMaxEdge, 320, 4096, DEFAULT_SETTINGS.imageMaxEdge);
  settings.imageJpegQuality = clampNumber(
    settings.imageJpegQuality,
    0.5,
    1,
    DEFAULT_SETTINGS.imageJpegQuality
  );
  settings.thinkingRequestFields = String(
    settings.thinkingRequestFields || DEFAULT_SETTINGS.thinkingRequestFields
  ).trim();
  return settings;
}

async function switchModelPreset(presetId) {
  const settings = await readSettings();
  const preset = settings.modelPresets.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error("Model preset was not found.");
  }

  const nextSettings = {
    ...pickModelSettings(settings),
    ...pickModelSettings(preset)
  };
  await testModel(nextSettings);
  await chrome.storage.sync.set({
    ...nextSettings,
    currentPresetId: preset.id
  });
  return { presetId: preset.id, settings: await readSettings() };
}

function pickModelSettings(source) {
  return Object.fromEntries(
    MODEL_SETTING_KEYS.map((key) => [key, source[key] ?? DEFAULT_SETTINGS[key]])
  );
}

async function hideFloatingPanel(tabId) {
  try {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "hide-translation" });
  } catch (error) {
    console.error(error);
  }
}

async function translateText(settings, text, onUpdate) {
  const messages = [
    { role: "system", content: settings.systemPrompt },
    {
      role: "user",
      content: `Translate the following text to ${settings.targetLanguage}. Preserve Markdown structure and keep mathematical formulas in LaTeX delimiters such as $...$ or $$...$$:\n\n${text}`
    }
  ];

  return callModel(settings, settings.textModel, messages, { stream: Boolean(onUpdate), onDelta: onUpdate });
}

async function translateImage(settings, imageDataUrl, onUpdate) {
  const outputInstruction = settings.showOcrResult
    ? "Return Markdown with two sections: OCR Text and Translation."
    : "Return only the translated text in Markdown. Do not include an OCR Text section or the source text.";
  const messages = [
    {
      role: "system",
      content:
        "You are an OCR and translation assistant. Read all visible document text in the image, then translate it accurately into the requested target language. Ignore browser UI, PDF viewer controls, scrollbars, page margins, and extension UI if present. Do not merely repeat the source text. Preserve line breaks, tables, code, and mathematical formulas when useful. Keep formulas in LaTeX delimiters such as $...$ or $$...$$."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Recognize the text in this image and translate it to ${settings.targetLanguage}. The final answer must be in ${settings.targetLanguage}, except for code, formulas, proper nouns, and unavoidable technical identifiers. ${outputInstruction}`
        },
        {
          type: "image_url",
          image_url: {
            url: imageDataUrl
          }
        }
      ]
    }
  ];

  return callModel(settings, settings.visionModel, messages, { stream: Boolean(onUpdate), onDelta: onUpdate });
}

async function askLastScreenshot(question, history, onUpdate) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error("Question is empty.");
  }
  if (!lastResult) {
    const stored = await chrome.storage.session.get("lastResult");
    lastResult = stored.lastResult || null;
  }
  if (!lastResult?.imageUrl) {
    throw new Error("No screenshot translation is available to discuss.");
  }

  const settings = await getSettings();
  const recentHistory = history
    .slice(-6)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content:
        "Answer questions about the provided screenshot and prior translation. Be concise, cite visible text when needed, and preserve formulas with LaTeX delimiters."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Previous translation result:\n${lastResult.translation || ""}\n\nRecent conversation:\n${recentHistory || "(none)"}\n\nUser question:\n${trimmedQuestion}`
        },
        {
          type: "image_url",
          image_url: {
            url: lastResult.imageUrl
          }
        }
      ]
    }
  ];

  const answer = await callModel(settings, settings.visionModel, messages, {
    stream: Boolean(onUpdate),
    onDelta: async (partial) => {
      await onUpdate?.(removeReasoningBlocks(partial, settings));
    }
  });
  return removeReasoningBlocks(answer, settings);
}

async function testModel(rawSettings) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    apiBaseUrl: String(rawSettings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/+$/, "")
  };
  if (settings.provider !== "llamacpp" && !settings.apiKey) {
    throw new Error("API key is missing.");
  }

  const reply = await callModel(settings, settings.textModel, [
    { role: "system", content: "You are a connectivity test endpoint." },
    { role: "user", content: "Reply exactly: OK" }
  ]);

  return reply;
}

async function callModel(settings, model, messages, options = {}) {
  if (settings.provider === "anthropic") {
    return callAnthropicMessages(settings, model, messages, options);
  }

  return callOpenAIChatCompletions(settings, model, messages, options);
}

async function callOpenAIChatCompletions(settings, model, messages, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const body = {
    model,
    messages: withThinkingInstruction(settings, messages),
    temperature: 0.2
  };
  if (options.stream) {
    body.stream = true;
  }
  const appliedThinkingFields = applyThinkingSettings(settings, body);

  const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    if (appliedThinkingFields && shouldRetryWithoutThinkingFields(response.status, detail)) {
      return callOpenAIChatCompletions(
        { ...settings, thinkingRequestFields: "" },
        model,
        messages,
        options
      );
    }
    throw new Error(`Model request failed (${response.status}): ${detail}`);
  }

  if (options.stream) {
    return readOpenAIStream(response, options.onDelta);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model response did not contain translated content.");
  }

  return Array.isArray(content)
    ? content.map((part) => part.text || "").join("").trim()
    : String(content).trim();
}

async function callAnthropicMessages(settings, model, messages, options = {}) {
  const { system, anthropicMessages } = toAnthropicMessages(withThinkingInstruction(settings, messages));
  const response = await fetch(`${settings.apiBaseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.2,
      stream: Boolean(options.stream),
      system,
      messages: anthropicMessages
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${detail}`);
  }

  if (options.stream) {
    return readAnthropicStream(response, options.onDelta);
  }

  const data = await response.json();
  const content = data?.content;
  if (!Array.isArray(content)) {
    throw new Error("Anthropic response did not contain translated content.");
  }

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

async function readOpenAIStream(response, onDelta) {
  let text = "";
  await readServerSentEvents(response, async (eventData) => {
    if (eventData === "[DONE]") return;
    const data = JSON.parse(eventData);
    const content = data?.choices?.[0]?.delta?.content;
    const delta = Array.isArray(content)
      ? content.map((part) => part.text || "").join("")
      : content || "";
    if (!delta) return;
    text += delta;
    await onDelta?.(text);
  });
  if (!text.trim()) {
    throw new Error("Model response did not contain translated content.");
  }
  return text.trim();
}

async function readAnthropicStream(response, onDelta) {
  let text = "";
  await readServerSentEvents(response, async (eventData) => {
    const data = JSON.parse(eventData);
    if (data?.type !== "content_block_delta" || data?.delta?.type !== "text_delta") return;
    const delta = data.delta.text || "";
    if (!delta) return;
    text += delta;
    await onDelta?.(text);
  });
  if (!text.trim()) {
    throw new Error("Anthropic response did not contain translated content.");
  }
  return text.trim();
}

async function readServerSentEvents(response, onEventData) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response is not readable in this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      const data = part
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      await onEventData(data);
    }
  }

  buffer += decoder.decode();
  const data = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data) {
    await onEventData(data);
  }
}

function withThinkingInstruction(settings, messages) {
  if (settings.enableThinking) {
    return messages;
  }

  const instruction =
    "Do not output reasoning, chain-of-thought, <think> blocks, or hidden analysis. Return only the final user-facing answer.";
  const nextMessages = messages.map((message) => ({ ...message }));
  const systemMessage = nextMessages.find((message) => message.role === "system");
  if (systemMessage) {
    systemMessage.content = `${plainTextContent(systemMessage.content)}\n\n${instruction}`;
    return nextMessages;
  }
  return [{ role: "system", content: instruction }, ...nextMessages];
}

function applyThinkingSettings(settings, body) {
  const enableThinking = Boolean(settings.enableThinking);
  if (settings.provider === "anthropic" || !shouldSendThinkingCustomFields(settings)) {
    return false;
  }

  const fieldPaths = parseThinkingRequestFields(settings.thinkingRequestFields);
  for (const fieldPath of fieldPaths) {
    setNestedRequestField(body, fieldPath, enableThinking);
  }
  return fieldPaths.length > 0;
}

function shouldSendThinkingCustomFields(settings) {
  if (settings.provider === "llamacpp") return true;
  try {
    return new URL(settings.apiBaseUrl).hostname.toLowerCase() !== "api.openai.com";
  } catch {
    return true;
  }
}

function parseThinkingRequestFields(rawFields) {
  return String(rawFields ?? DEFAULT_SETTINGS.thinkingRequestFields)
    .split(/[\n,]+/)
    .map((field) => field.trim())
    .filter(Boolean);
}

function shouldRetryWithoutThinkingFields(status, detail) {
  if (![400, 422].includes(status)) return false;
  return /unknown|unrecognized|unsupported|extra|invalid|not permitted|unexpected/i.test(detail || "");
}

function setNestedRequestField(target, fieldPath, value) {
  const keys = fieldPath.split(".").map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0) return;

  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function removeReasoningBlocks(content, settings) {
  if (settings.enableThinking) {
    return content;
  }
  return String(content || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function toAnthropicMessages(messages) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => plainTextContent(message.content))
    .join("\n\n");
  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: anthropicContent(message.content)
    }));

  return { system, anthropicMessages };
}

function anthropicContent(content) {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text || "" };
    }

    if (part.type === "image_url") {
      const { mediaType, data } = parseDataUrl(part.image_url?.url || "");
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data
        }
      };
    }

    return { type: "text", text: plainTextContent(part) };
  });
}

function plainTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || "").join("\n");
  }
  return "";
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Screenshot data URL is invalid.");
  }
  return { mediaType: match[1], data: match[2] };
}

async function cropDataUrl(dataUrl, rect) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scaleX = image.width / rect.viewportWidth;
  const scaleY = image.height / rect.viewportHeight;
  const sx = Math.max(0, Math.round(rect.x * scaleX));
  const sy = Math.max(0, Math.round(rect.y * scaleY));
  const sw = Math.min(image.width - sx, Math.round(rect.width * scaleX));
  const sh = Math.min(image.height - sy, Math.round(rect.height * scaleY));

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext("2d");
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: "image/png" });

  return blobToDataUrl(blob);
}

async function prepareImageForModel(dataUrl, settings) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const originalWidth = image.width;
  const originalHeight = image.height;
  const shouldCompress = Boolean(settings.compressInputImage);
  const maxEdge = clampInteger(settings.imageMaxEdge, 320, 4096, DEFAULT_SETTINGS.imageMaxEdge);
  const quality = clampNumber(settings.imageJpegQuality, 0.5, 1, DEFAULT_SETTINGS.imageJpegQuality);
  const scale = shouldCompress ? Math.min(1, maxEdge / Math.max(originalWidth, originalHeight)) : 1;
  const outputWidth = Math.max(1, Math.round(originalWidth * scale));
  const outputHeight = Math.max(1, Math.round(originalHeight * scale));

  if (!shouldCompress) {
    return {
      dataUrl,
      info: {
        compressed: false,
        originalWidth,
        originalHeight,
        width: originalWidth,
        height: originalHeight,
        format: "image/png"
      }
    };
  }

  const canvas = new OffscreenCanvas(outputWidth, outputHeight);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality
  });

  return {
    dataUrl: await blobToDataUrl(blob),
    info: {
      compressed: true,
      originalWidth,
      originalHeight,
      width: outputWidth,
      height: outputHeight,
      format: "image/jpeg",
      quality
    }
  };
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function validateRect(rect) {
  if (
    !rect ||
    rect.width < 8 ||
    rect.height < 8 ||
    rect.viewportWidth <= 0 ||
    rect.viewportHeight <= 0
  ) {
    throw new Error("Selected region is too small.");
  }
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
