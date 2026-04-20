import "./settings.js";

const {
  DEFAULT_SETTINGS,
  MODEL_SETTING_KEYS,
  clampInteger,
  clampNumber,
  normalizeThinkingEffort,
  normalizeThinkingFieldPreset,
  apiPermissionPattern,
  pickModelSettings,
  readStoredSettings
} = globalThis.LLMT_SETTINGS;

const MENU_TRANSLATE_SELECTION = "translate-selection";
const MENU_TRANSLATE_SCREENSHOT = "translate-screenshot-region";
const MENU_TRANSLATE_PAGE = "translate-current-page";
let lastResult = null;
const sidePanelPorts = new Set();
const activeModelControllers = new Set();
const activeModelReaders = new Set();
const activeTabRequests = new Map();

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
    runForTab(tab.id, (requestId) => translateSelection(tab.id, text, requestId));
    return;
  }

  if (info.menuItemId === MENU_TRANSLATE_SCREENSHOT) {
    runForTab(tab.id, (requestId) => startRegionSelection(tab.id, requestId));
    return;
  }

  if (info.menuItemId === MENU_TRANSLATE_PAGE) {
    runForTab(tab.id, (requestId) => translateCurrentPage(tab.id, tab.windowId, requestId));
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === MENU_TRANSLATE_SELECTION) {
    runForTab(tab.id, async (requestId) => {
      await translateSelection(tab.id, await readSelectedTextFromTab(tab.id), requestId);
    });
    return;
  }

  if (command === MENU_TRANSLATE_SCREENSHOT) {
    runForTab(tab.id, (requestId) => startRegionSelection(tab.id, requestId));
    return;
  }

  if (command === MENU_TRANSLATE_PAGE) {
    runForTab(tab.id, (requestId) => translateCurrentPage(tab.id, tab.windowId, requestId));
    return;
  }

  if (command === "open-side-panel") {
    await openSidePanel(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-side-panel" && sender.tab?.id) {
    openSidePanel(sender.tab)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error(error);
        chrome.storage.session.set({ sidePanelOpen: false });
        sendResponse({ ok: false, error: userFacingError(error) || "无法打开侧边栏。" });
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
            translation: userFacingError(error) || "发生未知错误。"
          });
        } catch (displayError) {
          console.error(displayError);
        }
      }
      sendResponse({ ok: false, error: userFacingError(error) || "发生未知错误。" });
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
    await runForTab(tab.id, async (requestId) => {
      await translateCurrentPage(tab.id, tab.windowId, requestId);
    });
    return { ok: true };
  }

  if (message?.type === "translate-active-selection") {
    const tabId = await getActiveTabId();
    await runForTab(tabId, async (requestId) => {
      await translateSelection(tabId, message.text || (await readSelectedTextFromTab(tabId)), requestId);
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

  if (message?.type === "cancel-current-request") {
    cancelActiveModelRequests();
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
    await updateStoredSettings(message.settings || {});
    return { ok: true, settings: await readSettings() };
  }

  if (message?.type === "switch-model-preset") {
    const result = await switchModelPreset(message.presetId || "");
    return { ok: true, ...result };
  }

  if (message?.type === "ask-last-screenshot") {
    const startedAt = Date.now();
    const metrics = createModelMetrics();
    const answer = await askLastScreenshot(message.question || "", message.history || [], async (partial) => {
      if (!message.requestId) return;
      const output = modelOutputPayload(partial, metrics);
      chrome.runtime
        .sendMessage({
          type: "chat-stream-updated",
          requestId: message.requestId,
          answer: output.answer,
          reasoning: output.reasoning,
          metrics: snapshotMetrics(metrics),
          startedAt,
          isStreaming: true
        })
        .catch(() => {});
    }, metrics);
    const output = modelOutputPayload(answer, metrics);
    return { ok: true, answer: output.answer, reasoning: output.reasoning, metrics: snapshotMetrics(metrics), elapsedMs: Date.now() - startedAt };
  }

  if (message?.type === "region-selected") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId || !windowId) throw new Error("No source tab found.");
    if (message.requestId && !isCurrentTabRequest(tabId, message.requestId)) {
      return { ok: true, ignored: true };
    }
    await translateScreenshotRegion(tabId, windowId, message.rect, message.requestId);
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
  const [currentWindowTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isUsableTab(currentWindowTab)) return currentWindowTab;

  const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isUsableTab(lastFocusedTab)) return lastFocusedTab;

  const lastFocusedWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (!isValidWindowId(lastFocusedWindow?.id)) throw new Error("No active window found.");
  const [tab] = await chrome.tabs.query({ active: true, windowId: lastFocusedWindow.id });
  if (!tab?.id) throw new Error("No active tab found.");
  if (!isValidWindowId(tab.windowId)) throw new Error("No active window found.");
  return tab;
}

function isUsableTab(tab) {
  return Boolean(tab?.id && isValidWindowId(tab.windowId));
}

function isValidWindowId(windowId) {
  return Number.isInteger(windowId) && windowId >= 0;
}

async function runForTab(tabId, task) {
  const requestId = beginTabRequest(tabId);
  try {
    await task(requestId);
  } catch (error) {
    console.error(error);
    await showResult(tabId, {
      requestId,
      title: "Translation failed",
      source: "",
      translation: userFacingError(error) || "发生未知错误。"
    });
  }
}

function beginTabRequest(tabId) {
  const requestId = createRequestId();
  activeTabRequests.set(tabId, requestId);
  return requestId;
}

function isCurrentTabRequest(tabId, requestId) {
  return !requestId || activeTabRequests.get(tabId) === requestId;
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function openSidePanel(tab) {
  if (!chrome.sidePanel?.open) {
    throw new Error("Chrome side panel API is not available in this browser.");
  }
  if (!tab?.id) {
    tab = await getActiveTab();
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

async function translateSelection(tabId, rawText, requestId = beginTabRequest(tabId)) {
  const text = rawText.trim();
  if (!text) {
    await showResult(tabId, {
      requestId,
      title: "No text selected",
      source: "",
      translation: "未检测到选中文本。请先在网页或 PDF 中选中文字；如果 PDF 选择失败，改用 Screenshot 或 Page 模式。"
    });
    return;
  }

  const startedAt = Date.now();
  await showResult(tabId, {
    requestId,
    title: "Translating...",
    source: text,
    translation: "Waiting for model response.",
    startedAt,
    isStreaming: true
  });

  const settings = await getSettings();
  const metrics = createModelMetrics();
  const translation = await translateText(settings, text, async (partial) => {
    const output = modelOutputPayload(partial, metrics);
    await showResult(tabId, {
      requestId,
      title: `Translating to ${settings.targetLanguage}...`,
      source: text,
      translation: output.answer,
      reasoning: output.reasoning,
      startedAt,
      metrics: snapshotMetrics(metrics),
      isStreaming: true
    });
  }, metrics);
  const output = modelOutputPayload(translation, metrics);
  await showResult(tabId, {
    requestId,
    title: `Translated to ${settings.targetLanguage}`,
    source: text,
    translation: output.answer,
    reasoning: output.reasoning,
    startedAt,
    elapsedMs: Date.now() - startedAt,
    metrics: snapshotMetrics(metrics)
  });
}

async function startRegionSelection(tabId, requestId = beginTabRequest(tabId)) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "start-region-selection", requestId });
}

async function translateScreenshotRegion(tabId, windowId, rect, requestId = beginTabRequest(tabId)) {
  validateRect(rect);
  const startedAt = Date.now();
  await showResult(tabId, {
    requestId,
    title: "Recognizing...",
    source: "",
    translation: "Capturing the selected area and asking the model to read it.",
    startedAt,
    isStreaming: true
  });

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const croppedDataUrl = await cropDataUrl(dataUrl, rect);
  await translateScreenshotImage(tabId, croppedDataUrl, {
    requestId,
    source: "Selected screen region",
    initialTitle: "Recognizing...",
    startedAt
  });
}

async function translateCurrentPage(tabId, windowId, requestId = beginTabRequest(tabId)) {
  const startedAt = Date.now();
  await showResult(tabId, {
    requestId,
    title: "Recognizing current page...",
    source: "",
    translation: "Capturing the current visible page and asking the model to read it.",
    startedAt,
    isStreaming: true
  });

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const settings = await readSettings();
  const pageImage = settings.cropPageMargins
    ? await cropPageCaptureMargins(dataUrl)
    : {
        dataUrl,
        info: {
          cropped: false,
          reason: "裁剪已关闭"
        }
      };
  await translateScreenshotImage(tabId, pageImage.dataUrl, {
    requestId,
    source: "Current visible page",
    initialTitle: "Recognizing current page...",
    startedAt,
    cropInfo: pageImage.info,
    originalImageUrl: pageImage.info?.cropped ? dataUrl : ""
  });
}

async function translateScreenshotImage(tabId, imageDataUrl, options) {
  const settings = await getSettings();
  const preparedImage = await prepareImageForModel(imageDataUrl, settings);
  const imageInfo = {
    ...preparedImage.info,
    cropInfo: options.cropInfo
  };
  await showResult(tabId, {
    requestId: options.requestId,
    title: options.initialTitle,
    source: options.source,
    translation: "Waiting for model response.",
    imageUrl: preparedImage.dataUrl,
    originalImageUrl: settings.showInputImage ? options.originalImageUrl : "",
    showInputImage: settings.showInputImage,
    imageInfo,
    startedAt: options.startedAt,
    isStreaming: true
  });
  const metrics = createModelMetrics();
  const translation = await translateImage(settings, preparedImage.dataUrl, async (partial) => {
    const output = modelOutputPayload(partial, metrics);
    await showResult(tabId, {
      requestId: options.requestId,
      title: `OCR translating to ${settings.targetLanguage}...`,
      source: options.source,
      translation: output.answer,
      reasoning: output.reasoning,
      imageUrl: preparedImage.dataUrl,
      originalImageUrl: settings.showInputImage ? options.originalImageUrl : "",
      showInputImage: settings.showInputImage,
      imageInfo,
      startedAt: options.startedAt,
      metrics: snapshotMetrics(metrics),
      isStreaming: true
    });
  }, metrics);

  const output = modelOutputPayload(translation, metrics);
  await showResult(tabId, {
    requestId: options.requestId,
    title: `OCR translated to ${settings.targetLanguage}`,
    source: options.source,
    translation: output.answer,
    reasoning: output.reasoning,
    imageUrl: preparedImage.dataUrl,
    originalImageUrl: settings.showInputImage ? options.originalImageUrl : "",
    showInputImage: settings.showInputImage,
    imageInfo,
    startedAt: options.startedAt,
    elapsedMs: Date.now() - options.startedAt,
    metrics: snapshotMetrics(metrics)
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
  if (!isCurrentTabRequest(tabId, payload.requestId)) return;
  const settings = await getSettings();
  if (!isCurrentTabRequest(tabId, payload.requestId)) return;
  lastResult = {
    ...payload,
    themeColor: settings.themeColor,
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
    payload: lastResult
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
  return readStoredSettings(chrome.storage.sync);
}

async function updateStoredSettings(partialSettings) {
  const settings = partialSettings && typeof partialSettings === "object" ? { ...partialSettings } : {};
  const modelKeys = Object.keys(settings).filter((key) => MODEL_SETTING_KEYS.includes(key));
  if (modelKeys.length === 0) {
    await chrome.storage.sync.set(settings);
    return;
  }

  const stored = await chrome.storage.sync.get(["currentPresetId", "modelPresets"]);
  const presets = Array.isArray(stored.modelPresets) ? stored.modelPresets : [];
  const currentPresetId = stored.currentPresetId || "";
  if (!currentPresetId || !presets.some((preset) => preset.id === currentPresetId)) {
    await chrome.storage.sync.set(settings);
    return;
  }

  const modelPatch = Object.fromEntries(modelKeys.map((key) => [key, settings[key]]));
  const nextPresets = presets.map((preset) =>
    preset.id === currentPresetId ? { ...preset, ...modelPatch } : preset
  );
  await chrome.storage.sync.set({
    ...settings,
    modelPresets: nextPresets
  });
}

async function switchModelPreset(presetId) {
  const settings = await readSettings();
  const preset = settings.modelPresets.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error("Model preset was not found.");
  }

  const presetSettings = pickModelSettings(preset);
  if (!preset.apiKey) {
    delete presetSettings.apiKey;
  }
  const nextSettings = {
    ...pickModelSettings(settings),
    ...presetSettings
  };
  await testModel(nextSettings);
  await chrome.storage.sync.set({
    ...nextSettings,
    currentPresetId: preset.id
  });
  return { presetId: preset.id, settings: await readSettings() };
}

async function hideFloatingPanel(tabId) {
  try {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "hide-translation" });
  } catch (error) {
    console.error(error);
  }
}

async function translateText(settings, text, onUpdate, metrics = createModelMetrics()) {
  const messages = [
    { role: "system", content: settings.systemPrompt },
    {
      role: "user",
      content: `Translate the following text to ${settings.targetLanguage}. Preserve Markdown structure and keep mathematical formulas in LaTeX delimiters such as $...$ or $$...$$:\n\n${text}`
    }
  ];

  return callModel(settings, settings.textModel, messages, { stream: Boolean(onUpdate), onDelta: onUpdate, metrics });
}

async function translateImage(settings, imageDataUrl, onUpdate, metrics = createModelMetrics()) {
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

  return callModel(settings, settings.visionModel, messages, { stream: Boolean(onUpdate), onDelta: onUpdate, metrics });
}

async function askLastScreenshot(question, history, onUpdate, metrics = createModelMetrics()) {
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
      await onUpdate?.(partial);
    },
    metrics
  });
  return answer;
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

async function assertApiHostPermission(settings) {
  const origin = apiPermissionPattern(settings.apiBaseUrl);
  if (!origin || !chrome.permissions?.contains) return;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) {
    throw new Error(`API host permission is missing for ${origin}. Open Options and click Test model or Fetch to grant access for this API endpoint.`);
  }
}

async function callOpenAIChatCompletions(settings, model, messages, options = {}) {
  await assertApiHostPermission(settings);
  const controller = new AbortController();
  activeModelControllers.add(controller);
  const metrics = options.metrics || createModelMetrics();
  startModelMetrics(metrics, messages);
  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const body = {
    messages: withThinkingInstruction(settings, messages),
    temperature: 0.2
  };
  if (shouldSendModelField(settings, model)) {
    body.model = String(model || "").trim();
  }
  if (options.stream) {
    body.stream = true;
    if (shouldRequestStreamUsage(settings)) {
      body.stream_options = { include_usage: true };
    }
  }
  const appliedThinkingFields = applyThinkingSettings(settings, body, model);

  try {
    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      if (appliedThinkingFields && shouldRetryWithoutThinkingFields(response.status, detail)) {
        return callOpenAIChatCompletions(
          { ...settings, thinkingFieldPreset: "none", thinkingRequestFields: "" },
          model,
          messages,
          options
        );
      }
      throw new Error(`Model request failed (${response.status}): ${detail}`);
    }

    if (options.stream) {
      return readOpenAIStream(response, options.onDelta, metrics);
    }

    const data = await response.json();
    applyOpenAIUsage(metrics, data?.usage);
    const message = data?.choices?.[0]?.message || {};
    const content = message.content;
    appendReasoningText(metrics, reasoningTextFromOpenAIMessage(message));
    if (!content && !metrics.reasoningText) {
      throw new Error("Model response did not contain translated content.");
    }

    const text = Array.isArray(content)
      ? content.map((part) => part.text || "").join("").trim()
      : String(content || "").trim();
    finishModelMetrics(metrics, text, metrics.reasoningText);
    return text;
  } finally {
    activeModelControllers.delete(controller);
  }
}

async function callAnthropicMessages(settings, model, messages, options = {}) {
  await assertApiHostPermission(settings);
  const controller = new AbortController();
  activeModelControllers.add(controller);
  const metrics = options.metrics || createModelMetrics();
  startModelMetrics(metrics, messages);
  const { system, anthropicMessages } = toAnthropicMessages(withThinkingInstruction(settings, messages));
  const body = {
    model,
    max_tokens: 2048,
    temperature: 0.2,
    stream: Boolean(options.stream),
    system,
    messages: anthropicMessages
  };
  applyAnthropicThinkingSettings(settings, body);
  try {
    const response = await fetch(`${settings.apiBaseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Anthropic request failed (${response.status}): ${detail}`);
    }

    if (options.stream) {
      return readAnthropicStream(response, options.onDelta, metrics);
    }

    const data = await response.json();
    applyAnthropicUsage(metrics, data?.usage);
    const content = data?.content;
    if (!Array.isArray(content)) {
      throw new Error("Anthropic response did not contain translated content.");
    }

    const text = content
      .filter((part) => part.type === "text")
      .map((part) => part.text || "")
      .join("")
      .trim();
    appendReasoningText(metrics, content.filter((part) => part.type === "thinking").map((part) => part.thinking || "").join("\n\n"));
    finishModelMetrics(metrics, text, metrics.reasoningText);
    return text;
  } finally {
    activeModelControllers.delete(controller);
  }
}

async function readOpenAIStream(response, onDelta, metrics) {
  let text = "";
  await readServerSentEvents(response, async (eventData) => {
    if (eventData === "[DONE]") return;
    const data = JSON.parse(eventData);
    applyOpenAIUsage(metrics, data?.usage);
    const choiceDelta = data?.choices?.[0]?.delta || {};
    const reasoningDelta = reasoningTextFromOpenAIDelta(choiceDelta);
    const content = choiceDelta.content;
    const delta = Array.isArray(content)
      ? content.map((part) => part.text || "").join("")
      : content || "";
    if (!delta && !reasoningDelta) return;
    markFirstToken(metrics);
    appendReasoningText(metrics, reasoningDelta);
    text += delta;
    await onDelta?.(text);
  });
  if (!text.trim() && !String(metrics.reasoningText || "").trim()) {
    throw new Error("Model response did not contain translated content.");
  }
  const finalText = text.trim();
  finishModelMetrics(metrics, finalText, metrics.reasoningText);
  return finalText;
}

async function readAnthropicStream(response, onDelta, metrics) {
  let text = "";
  await readServerSentEvents(response, async (eventData) => {
    const data = JSON.parse(eventData);
    if (data?.type === "message_start") {
      applyAnthropicUsage(metrics, data?.message?.usage);
    }
    if (data?.type === "message_delta") {
      applyAnthropicUsage(metrics, data?.usage);
    }
    if (data?.type !== "content_block_delta") return;
    const reasoningDelta = data?.delta?.type === "thinking_delta" ? data.delta.thinking || "" : "";
    const delta = data?.delta?.type === "text_delta" ? data.delta.text || "" : "";
    if (!delta && !reasoningDelta) return;
    markFirstToken(metrics);
    appendReasoningText(metrics, reasoningDelta);
    text += delta;
    await onDelta?.(text);
  });
  if (!text.trim() && !String(metrics.reasoningText || "").trim()) {
    throw new Error("Anthropic response did not contain translated content.");
  }
  const finalText = text.trim();
  finishModelMetrics(metrics, finalText, metrics.reasoningText);
  return finalText;
}

async function readServerSentEvents(response, onEventData) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response is not readable in this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  activeModelReaders.add(reader);
  try {
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
  } finally {
    activeModelReaders.delete(reader);
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

function applyThinkingSettings(settings, body, model = "") {
  const enableThinking = Boolean(settings.enableThinking);
  const fieldPaths = resolveThinkingRequestFields(settings, model);
  if (settings.provider === "anthropic" || fieldPaths.length === 0 || !shouldSendThinkingCustomFields(settings)) {
    return false;
  }

  for (const fieldSpec of fieldPaths) {
    const { path, explicitValue } = parseThinkingFieldSpec(fieldSpec);
    const value = thinkingFieldValue(settings, path, enableThinking, explicitValue);
    if (value !== undefined) {
      setNestedRequestField(body, path, value);
    }
  }
  return fieldPaths.length > 0;
}

function applyAnthropicThinkingSettings(settings, body) {
  if (!settings.enableThinking) return;
  const budgetTokens = clampInteger(settings.thinkingBudgetTokens, 1024, 128000, 1024);
  body.thinking = {
    type: "enabled",
    budget_tokens: budgetTokens
  };
  body.max_tokens = Math.max(Number(body.max_tokens || 0), budgetTokens + 1024);
}

function parseThinkingFieldSpec(fieldSpec) {
  const text = String(fieldSpec || "").trim();
  const equalsIndex = text.indexOf("=");
  if (equalsIndex < 0) {
    return { path: text, explicitValue: "" };
  }
  return {
    path: text.slice(0, equalsIndex).trim(),
    explicitValue: text.slice(equalsIndex + 1).trim()
  };
}

function thinkingFieldValue(settings, fieldPath, enableThinking, explicitValue = "") {
  if (explicitValue) {
    return parseExplicitThinkingValue(settings, explicitValue, enableThinking);
  }

  const normalized = String(fieldPath || "").trim().toLowerCase();
  if (normalized === "thinking") {
    return { type: enableThinking ? "enabled" : "disabled" };
  }
  if (normalized === "thinking.type") {
    return enableThinking ? "enabled" : "disabled";
  }
  if (normalized === "reasoning_effort" || normalized === "reasoning.effort") {
    return enableThinking ? normalizeThinkingEffort(settings.thinkingEffort) || "medium" : "minimal";
  }
  if (normalized === "reasoning.enabled") {
    return enableThinking;
  }
  if (normalized === "reasoning.exclude") {
    return !enableThinking;
  }
  if (normalized === "reasoning.max_tokens" || normalized === "thinking.budget_tokens") {
    const budgetTokens = clampInteger(settings.thinkingBudgetTokens, 0, 128000, 0);
    return enableThinking && budgetTokens > 0 ? budgetTokens : undefined;
  }
  return enableThinking;
}

function parseExplicitThinkingValue(settings, rawValue, enableThinking) {
  const value = String(rawValue || "").trim();
  if (!value) return undefined;
  if (value.includes("|")) {
    const [enabledValue, disabledValue = ""] = value.split("|").map((part) => part.trim());
    return parseExplicitThinkingValue(settings, enableThinking ? enabledValue : disabledValue, enableThinking);
  }
  if (value === "{effort}") {
    return normalizeThinkingEffort(settings.thinkingEffort) || "medium";
  }
  if (value === "{budget}") {
    const budgetTokens = clampInteger(settings.thinkingBudgetTokens, 0, 128000, 0);
    return budgetTokens > 0 ? budgetTokens : undefined;
  }
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {}
  }
  return value;
}

function createModelMetrics() {
  return {
    requestStartedAt: 0,
    firstTokenAt: 0,
    finishedAt: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    reasoningText: "",
    inputEstimated: false,
    outputEstimated: false
  };
}

function startModelMetrics(metrics, messages) {
  metrics.requestStartedAt = Date.now();
  metrics.firstTokenAt = 0;
  metrics.finishedAt = 0;
  metrics.inputTokens = estimateMessageTokens(messages);
  metrics.outputTokens = 0;
  metrics.reasoningTokens = 0;
  metrics.reasoningText = "";
  metrics.inputEstimated = true;
  metrics.outputEstimated = false;
}

function markFirstToken(metrics) {
  if (!metrics.firstTokenAt) {
    metrics.firstTokenAt = Date.now();
  }
}

function finishModelMetrics(metrics, outputText = "", reasoningText = "") {
  metrics.finishedAt = Date.now();
  if (!metrics.firstTokenAt && (outputText || reasoningText)) {
    metrics.firstTokenAt = metrics.finishedAt;
  }
  if ((!metrics.outputTokens || metrics.outputEstimated) && (outputText || reasoningText)) {
    metrics.reasoningTokens = estimateTextTokens(reasoningText);
    metrics.outputTokens = estimateTextTokens(outputText) + metrics.reasoningTokens;
    metrics.outputEstimated = true;
  } else if (!metrics.reasoningTokens && reasoningText) {
    metrics.reasoningTokens = estimateTextTokens(reasoningText);
  }
}

function snapshotMetrics(metrics) {
  if (!metrics?.requestStartedAt) return null;
  const now = metrics.finishedAt || Date.now();
  const durationMs = Math.max(0, now - metrics.requestStartedAt);
  const generationMs = metrics.firstTokenAt ? Math.max(0, now - metrics.firstTokenAt) : 0;
  const outputTokens = Number(metrics.outputTokens || 0);
  return {
    elapsedMs: durationMs,
    ttftMs: metrics.firstTokenAt ? metrics.firstTokenAt - metrics.requestStartedAt : undefined,
    tokensPerSecond: generationMs > 0 && outputTokens > 0 ? outputTokens / (generationMs / 1000) : undefined,
    inputTokens: Number(metrics.inputTokens || 0),
    outputTokens,
    reasoningTokens: Number(metrics.reasoningTokens || 0),
    inputEstimated: Boolean(metrics.inputEstimated),
    outputEstimated: Boolean(metrics.outputEstimated)
  };
}

function applyOpenAIUsage(metrics, usage) {
  if (!usage) return;
  applyUsageTokens(metrics, usage.prompt_tokens, usage.completion_tokens);
}

function applyAnthropicUsage(metrics, usage) {
  if (!usage) return;
  applyUsageTokens(metrics, usage.input_tokens, usage.output_tokens);
}

function shouldRequestStreamUsage(settings) {
  const host = apiHost(settings.apiBaseUrl);
  return host === "api.openai.com" || host.includes("openrouter.ai");
}

function applyUsageTokens(metrics, inputTokens, outputTokens) {
  const input = Number(inputTokens);
  if (Number.isFinite(input) && input > 0) {
    metrics.inputTokens = input;
    metrics.inputEstimated = false;
  }
  const output = Number(outputTokens);
  if (Number.isFinite(output) && output > 0) {
    metrics.outputTokens = output;
    metrics.outputEstimated = false;
  }
}

function estimateMessageTokens(messages) {
  return messages.reduce((total, message) => total + estimateContentTokens(message.content), 0);
}

function estimateContentTokens(content) {
  if (typeof content === "string") return estimateTextTokens(content);
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, part) => {
    if (part?.type === "text") {
      return total + estimateTextTokens(part.text);
    }
    if (part?.type === "image_url") {
      return total + estimateImageTokens(part.image_url?.url);
    }
    return total;
  }, 0);
}

function estimateTextTokens(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const nonCjk = value.length - cjk;
  return Math.max(1, Math.ceil(cjk * 0.75 + nonCjk / 4));
}

function estimateImageTokens(dataUrl) {
  const dimensions = imageDimensionsFromDataUrl(dataUrl);
  if (!dimensions) return 0;
  const width = Math.max(1, dimensions.width);
  const height = Math.max(1, dimensions.height);
  const maxSide = Math.max(width, height);
  const scale = maxSide > 2048 ? 2048 / maxSide : 1;
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const shortSide = Math.min(scaledWidth, scaledHeight);
  const detailScale = shortSide > 768 ? 768 / shortSide : 1;
  const detailWidth = Math.max(1, Math.round(scaledWidth * detailScale));
  const detailHeight = Math.max(1, Math.round(scaledHeight * detailScale));
  const tiles = Math.ceil(detailWidth / 512) * Math.ceil(detailHeight / 512);
  return 85 + tiles * 170;
}

function imageDimensionsFromDataUrl(dataUrl) {
  const parsed = parseDataUrlSafe(dataUrl);
  if (!parsed) return null;
  if (parsed.mediaType === "image/png") {
    return pngDimensions(parsed.bytes);
  }
  if (parsed.mediaType === "image/jpeg" || parsed.mediaType === "image/jpg") {
    return jpegDimensions(parsed.bytes);
  }
  return null;
}

function parseDataUrlSafe(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { mediaType: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20)
  };
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    while (bytes[offset] === 0xff) offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) return null;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (isJpegStartOfFrame(marker) && offset + 7 < bytes.length) {
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5)
      };
    }
    offset += segmentLength;
  }
  return null;
}

function isJpegStartOfFrame(marker) {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes, offset) {
  return bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

function shouldSendThinkingCustomFields(settings) {
  return settings.provider !== "anthropic";
}

function resolveThinkingRequestFields(settings, model = "") {
  const preset = normalizeThinkingFieldPreset(settings.thinkingFieldPreset);
  if (preset === "custom") {
    return parseThinkingRequestFields(settings.thinkingRequestFields);
  }
  if (preset === "doubao") {
    return parseThinkingRequestFields(thinkingFieldsForPreset(preset));
  }
  return parseThinkingRequestFields(inferThinkingRequestFields(settings, model));
}

function thinkingFieldsForPreset(preset) {
  switch (preset) {
    case "doubao":
      return "thinking.type";
    case "custom":
      return "";
    default:
      return "";
  }
}

function inferThinkingRequestFields(settings, model = "") {
  if (settings.provider === "anthropic") return "";
  const host = apiHost(settings.apiBaseUrl);
  const modelName = String(model || settings.textModel || "").toLowerCase();

  // OpenAI reasoning models use reasoning_effort
  if (host === "api.openai.com" && isOpenAIReasoningModel(modelName)) {
    return "reasoning_effort";
  }

  // OpenRouter uses reasoning object
  if (host.includes("openrouter.ai")) {
    return "reasoning.enabled\nreasoning.effort\nreasoning.max_tokens";
  }

  // Doubao / VolcEngine uses thinking.type
  if (host.includes("volces.com") || host.includes("volcengine") || modelName.includes("doubao")) {
    return "thinking.type";
  }

  // Default fallback: common fields for OpenAI-compatible local and hosted APIs.
  return "enable_thinking\nchat_template_kwargs.enable_thinking\nextra_body.enable_thinking\nextra_body.chat_template_kwargs.enable_thinking";
}

function shouldSendModelField(settings, model) {
  if (settings.provider === "llamacpp" && !String(model || "").trim()) {
    return false;
  }
  return true;
}

function apiHost(apiBaseUrl) {
  try {
    return new URL(apiBaseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalApiHost(host) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function isOpenAIReasoningModel(modelName) {
  return /(^|[/:_-])(gpt-5|o1|o3|o4)([/:_.-]|$)/i.test(modelName);
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

function userFacingError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) return "";

  if (error?.name === "AbortError" || /abort|aborted|signal is aborted/i.test(message)) {
    return "已取消当前请求。";
  }

  const modelError = parseModelError(message);
  if (modelError) return modelError;

  if (/api key is missing/i.test(message)) {
    return "API Key 缺失。请打开 Options，填写对应服务商的 API Key 后再试。";
  }

  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "网络请求失败。请检查 API Base URL、网络连接、代理设置，或确认该服务允许浏览器扩展直接访问。";
  }

  if (/chrome side panel api is not available/i.test(message)) {
    return "当前浏览器不支持 Chrome Side Panel API。请使用较新的 Chrome/Edge，或改用悬浮窗模式。";
  }

  if (/sidePanel\.open\(\) may only be called in response to a user gesture/i.test(message)) {
    return "浏览器要求侧边栏必须由点击或快捷键直接打开。请重新点击扩展里的 Side panel 按钮。";
  }

  if (/no window with id:\s*-?\d+/i.test(message)) {
    return "无法定位当前浏览器窗口。请重新点击页面或重新打开扩展弹窗后再试。";
  }

  if (/no active tab found/i.test(message)) {
    return "未找到当前活动标签页。请切换到要翻译的页面后再试。";
  }

  if (/no active window found/i.test(message)) {
    return "未找到当前浏览器窗口。请重新聚焦浏览器窗口后再试。";
  }

  if (/cannot access|cannot be scripted|extension context invalidated|receiving end does not exist/i.test(message)) {
    return "当前页面暂时无法注入扩展脚本。请刷新页面后再试；Chrome 内置页面和部分商店页面不允许扩展运行。";
  }

  if (/selected region is too small/i.test(message)) {
    return "截图区域太小。请重新选择更大的区域。";
  }

  if (/screenshot data url is invalid|invalid image|failed to execute 'createImageBitmap'|image/i.test(message)) {
    return "截图图片处理失败。请重新截图；如果页面很大，建议开启压缩或降低 Max Edge。";
  }

  if (/no screenshot translation is available/i.test(message)) {
    return "当前没有可追问的截图翻译结果。请先运行 Screenshot 或 Page 翻译。";
  }

  if (/question is empty/i.test(message)) {
    return "问题为空。请输入要追问的内容。";
  }

  if (/model response did not contain translated content/i.test(message)) {
    return "模型返回为空。请检查模型名称是否正确，或换一个模型重试。";
  }

  if (/streaming response is not readable/i.test(message)) {
    return "当前服务不支持可读取的流式响应。请换用支持流式输出的模型服务，或稍后重试。";
  }

  return message;
}

function parseModelError(message) {
  const match = /(?:Model|Anthropic) request failed \((\d{3})\):\s*([\s\S]*)/i.exec(message);
  if (!match) return "";

  const status = Number.parseInt(match[1], 10);
  const detail = summarizeErrorDetail(match[2]);

  if (status === 400) {
    if (/vision|image|modal|multimodal|content type|image_url/i.test(detail)) {
      return `模型请求失败（400）：当前模型可能不支持图片输入。请在 Options 中切换 Vision model，或检查 provider 是否兼容。${detail ? `\n\n服务返回：${detail}` : ""}`;
    }
    if (/context|token|too long|max/i.test(detail)) {
      return `模型请求失败（400）：输入内容可能过长。请缩小截图区域、开启图片压缩，或降低 Max Edge。${detail ? `\n\n服务返回：${detail}` : ""}`;
    }
    return `模型请求参数无效（400）。请检查 API Base URL、模型名、thinking 字段配置和 provider 类型。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 401) {
    return `认证失败（401）。请检查 API Key 是否正确，或该 Key 是否属于当前 API Base URL。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 403) {
    return `权限不足（403）。请确认账号有权限调用该模型，API Key 未被禁用，且服务商允许浏览器扩展访问。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 404) {
    return `模型或接口不存在（404）。请检查 API Base URL 和模型名称是否正确。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 408 || status === 504) {
    return `模型请求超时（${status}）。请稍后重试，或缩小输入内容/截图区域。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 413) {
    return `请求体过大（413）。请开启图片压缩、降低 Max Edge，或缩小截图区域。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 422) {
    return `模型服务无法处理该请求（422）。请检查模型名、thinking 字段和输入格式是否符合该服务商要求。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status === 429) {
    return `请求过于频繁或额度不足（429）。请稍后重试，或检查服务商额度和限流策略。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  if (status >= 500) {
    return `模型服务暂时异常（${status}）。请稍后重试；如果持续出现，请检查 API Base URL 或切换服务商。${detail ? `\n\n服务返回：${detail}` : ""}`;
  }

  return `模型请求失败（${status}）。${detail ? `服务返回：${detail}` : "请检查模型服务配置。"}`;
}

function summarizeErrorDetail(detail) {
  const text = extractErrorText(detail).replace(/\s+/g, " ").trim();
  return text.length > 360 ? `${text.slice(0, 360)}...` : text;
}

function extractErrorText(detail) {
  const raw = String(detail || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return findErrorText(parsed) || raw;
  } catch {
    return raw;
  }
}

function findErrorText(value) {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  if (value.error) return findErrorText(value.error);
  if (typeof value.detail === "string") return value.detail;
  if (Array.isArray(value.details)) return value.details.map(findErrorText).filter(Boolean).join("; ");
  return "";
}

function cancelActiveModelRequests() {
  for (const controller of activeModelControllers) {
    controller.abort();
  }
  for (const reader of activeModelReaders) {
    reader.cancel().catch(() => {});
  }
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

function modelOutputPayload(content, metrics) {
  const parsed = splitReasoningContent(content);
  const reasoning = [metrics?.reasoningText || "", parsed.reasoning]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (metrics && reasoning) {
    metrics.reasoningTokens = estimateTextTokens(reasoning);
  }
  if (metrics && (!metrics.outputTokens || metrics.outputEstimated)) {
    metrics.outputTokens = estimateTextTokens(parsed.answer) + Number(metrics.reasoningTokens || 0);
    metrics.outputEstimated = true;
  }
  return {
    answer: parsed.answer,
    reasoning
  };
}

function splitReasoningContent(content) {
  const raw = String(content || "");
  const reasoningParts = [];
  let answer = raw.replace(/<think\b[^>]*>([\s\S]*?)<\/think>/gi, (_match, reasoning) => {
    reasoningParts.push(String(reasoning || "").trim());
    return "";
  });

  const openThink = answer.search(/<think\b[^>]*>/i);
  if (openThink >= 0) {
    const before = answer.slice(0, openThink);
    const after = answer.slice(openThink).replace(/^<think\b[^>]*>/i, "");
    reasoningParts.push(after.trim());
    answer = before;
  }

  return {
    answer: answer.trim(),
    reasoning: reasoningParts.filter(Boolean).join("\n\n").trim()
  };
}

function appendReasoningText(metrics, value) {
  const text = normalizeReasoningText(value);
  if (!text) return;
  metrics.reasoningText = [metrics.reasoningText, text].filter(Boolean).join("");
  metrics.reasoningTokens = estimateTextTokens(metrics.reasoningText);
}

function normalizeReasoningText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeReasoningText).join("");
  if (typeof value === "object") {
    return (
      normalizeReasoningText(value.text) ||
      normalizeReasoningText(value.content) ||
      normalizeReasoningText(value.reasoning) ||
      normalizeReasoningText(value.reasoning_content)
    );
  }
  return String(value);
}

function reasoningTextFromOpenAIDelta(delta) {
  return normalizeReasoningText(
    delta?.reasoning_content ??
      delta?.reasoning ??
      delta?.reasoning_text ??
      delta?.reasoning_details
  );
}

function reasoningTextFromOpenAIMessage(message) {
  return normalizeReasoningText(
    message?.reasoning_content ??
      message?.reasoning ??
      message?.reasoning_text ??
      message?.reasoning_details
  );
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

async function cropPageCaptureMargins(dataUrl) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const width = image.width;
  const height = image.height;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, width, height).data;
  const scanTop = Math.floor(height * 0.08);
  const scanBottom = Math.floor(height * 0.98);
  const leftBackground = sampleEdgeBackground(pixels, width, height, 0, Math.max(2, Math.floor(width * 0.015)), scanTop, scanBottom);
  const rightBackground = sampleEdgeBackground(
    pixels,
    width,
    height,
    Math.max(0, width - Math.max(2, Math.floor(width * 0.015))),
    width,
    scanTop,
    scanBottom
  );

  const left = findHorizontalContentEdge(pixels, width, height, leftBackground, 1, scanTop, scanBottom);
  let right = findHorizontalContentEdge(pixels, width, height, rightBackground, -1, scanTop, scanBottom);
  if (left > width * 0.05 && right >= width - 1) {
    right = Math.max(left + 1, width - left - 1);
  }
  const pad = Math.max(4, Math.round(width * 0.003));
  const sx = Math.max(0, left - pad);
  const ex = Math.min(width, right + pad + 1);
  const croppedWidth = ex - sx;
  const removedWidth = width - croppedWidth;
  const reason = getPageCropSkipReason({ left, right, croppedWidth, removedWidth, width });

  if (reason) {
    return {
      dataUrl,
      info: {
        cropped: false,
        reason,
        originalWidth: width,
        originalHeight: height,
        width,
        height
      }
    };
  }

  const output = new OffscreenCanvas(croppedWidth, height);
  const outputContext = output.getContext("2d");
  outputContext.drawImage(canvas, sx, 0, croppedWidth, height, 0, 0, croppedWidth, height);
  const blob = await output.convertToBlob({ type: "image/png" });
  return {
    dataUrl: await blobToDataUrl(blob),
    info: {
      cropped: true,
      originalWidth: width,
      originalHeight: height,
      width: croppedWidth,
      height,
      left: sx,
      right: width - ex
    }
  };
}

function getPageCropSkipReason({ left, right, croppedWidth, removedWidth, width }) {
  if (left <= 0 && right >= width - 1) return "未检测到左右阅读器空白";
  if (right <= left) return "检测到的页面边界无效";
  if (croppedWidth < width * 0.35) return "检测到的页面区域过窄，已跳过裁剪";
  if (removedWidth < Math.max(48, width * 0.035)) return "左右空白较小，已跳过裁剪";
  return "";
}

function sampleEdgeBackground(pixels, width, height, startX, endX, startY, endY) {
  const color = [0, 0, 0];
  const samples = [];
  let count = 0;
  const stepY = Math.max(4, Math.floor(height / 160));
  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      const sample = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      color[0] += sample[0];
      color[1] += sample[1];
      color[2] += sample[2];
      samples.push(sample);
      count += 1;
    }
  }
  const average = count ? color.map((value) => value / count) : [255, 255, 255];
  const variance = samples.reduce((sum, sample) => {
    const distance = colorDistance(sample[0], sample[1], sample[2], average);
    return sum + distance * distance;
  }, 0) / Math.max(1, samples.length);
  const noise = Math.sqrt(variance);
  const brightness = averageBrightness(average);
  return {
    color: average,
    brightness,
    tolerance: Math.min(58, Math.max(18, noise * 3 + 14))
  };
}

function findHorizontalContentEdge(pixels, width, height, background, direction, startY, endY) {
  const startX = direction > 0 ? 0 : width - 1;
  const endX = direction > 0 ? width : -1;
  const stepY = Math.max(6, Math.floor(height / 140));
  const columnStep = direction > 0 ? 1 : -1;
  const requiredRun = Math.max(3, Math.floor(width * 0.0025));
  let runStart = -1;
  let runLength = 0;
  for (let x = startX; x !== endX; x += columnStep) {
    if (isDocumentColumn(pixels, width, x, background, startY, endY, stepY)) {
      if (runLength === 0) runStart = x;
      runLength += 1;
      if (runLength >= requiredRun) {
        return direction > 0 ? runStart : x;
      }
    } else {
      runStart = -1;
      runLength = 0;
    }
  }
  return direction > 0 ? 0 : width - 1;
}

function isDocumentColumn(pixels, width, x, background, startY, endY, stepY) {
  const score = documentColumnScore(pixels, width, x, background, startY, endY, stepY);
  return score > 0.14;
}

function documentColumnScore(pixels, width, x, background, startY, endY, stepY) {
  let contentLike = 0;
  let total = 0;
  for (let y = startY; y < endY; y += stepY) {
    const offset = (y * width + x) * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const distance = colorDistance(r, g, b, background.color);
    const brightness = (r + g + b) / 3;
    const brightPageOnDarkBackground = background.brightness < 120 && brightness > Math.max(180, background.brightness + 70);
    const darkPageOnLightBackground = background.brightness > 135 && brightness < Math.min(80, background.brightness - 70);
    const inkOnDarkPage = background.brightness < 70 && distance > Math.max(14, background.tolerance * 0.8);
    if (
      distance > background.tolerance ||
      brightPageOnDarkBackground ||
      darkPageOnLightBackground ||
      inkOnDarkPage
    ) {
      contentLike += 1;
    }
    total += 1;
  }
  return total > 0 ? contentLike / total : 0;
}

function averageBrightness(color) {
  return (color[0] + color[1] + color[2]) / 3;
}

function colorDistance(r, g, b, color) {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
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

