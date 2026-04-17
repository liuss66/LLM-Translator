const image = document.querySelector("#result-image");
const translation = document.querySelector("#result-translation");
const copyTranslation = document.querySelector("#copy-translation");
const resultReasoning = document.querySelector("#result-reasoning");
const resultReasoningContent = document.querySelector("#result-reasoning-content");
const status = document.querySelector("#status");
const replyArea = document.querySelector(".reply-area");
const chatSection = document.querySelector(".chat");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const stopAction = document.querySelector("#stop-action");
const configPanel = document.querySelector(".config-panel");
const toggleConfig = document.querySelector("#toggle-config");
const answerBox = document.querySelector(".answer-box");
const toggleAnswer = document.querySelector("#toggle-answer");
const showOcrResult = document.querySelector("#show-ocr-result");
const showInputImage = document.querySelector("#show-input-image");
const compressInputImage = document.querySelector("#compress-input-image");
const imageMaxEdge = document.querySelector("#image-max-edge");
const imageJpegQuality = document.querySelector("#image-jpeg-quality");
const enableThinking = document.querySelector("#enable-thinking");
const cropPageMargins = document.querySelector("#crop-page-margins");
const modelPreset = document.querySelector("#model-preset");
const targetLanguage = document.querySelector("#target-language");
const TARGET_LANGUAGE_OPTIONS = ["中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Русский", "Português", "Italiano"];
let currentDisplayLanguage = "en";
let chatHistory = [];
let hasScreenshotContext = false;
let currentResult = null;
let currentImageUrl = "";
let elapsedTimer = 0;
let stickyStatus = "";
let stickyStatusIsHtml = false;
const activeChatStreams = new Map();

chrome.runtime.connect({ name: "sidepanel" });
setChatEnabled(false);
loadUiState();
loadSettings();
loadLastResult();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "last-result-updated") {
    renderResult(message.result);
  }
  if (message?.type === "chat-stream-updated") {
    updateChatStream(message);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.showOcrResult) {
    showOcrResult.checked = Boolean(changes.showOcrResult.newValue);
  }
  if (areaName === "sync" && changes.showInputImage) {
    showInputImage.checked = Boolean(changes.showInputImage.newValue);
    if (currentResult) renderResult(currentResult);
  }
  if (areaName === "sync" && changes.compressInputImage) {
    compressInputImage.checked = Boolean(changes.compressInputImage.newValue);
  }
  if (areaName === "sync" && changes.imageMaxEdge) {
    imageMaxEdge.value = changes.imageMaxEdge.newValue;
  }
  if (areaName === "sync" && changes.imageJpegQuality) {
    imageJpegQuality.value = changes.imageJpegQuality.newValue;
  }
  if (areaName === "sync" && changes.enableThinking) {
    enableThinking.checked = Boolean(changes.enableThinking.newValue);
  }
  if (areaName === "sync" && changes.cropPageMargins) {
    cropPageMargins.checked = changes.cropPageMargins.newValue !== false;
  }
  if (areaName === "sync" && changes.targetLanguage) {
    setTargetLanguageValue(changes.targetLanguage.newValue);
  }
  if (areaName === "sync" && changes.displayLanguage) {
    applySidePanelDisplayLanguage(changes.displayLanguage.newValue);
  }
  if (areaName === "sync" && changes.themeColor) {
    applyThemeColor(changes.themeColor.newValue);
  }
  if (
    areaName === "sync" &&
    (changes.modelPresets || changes.currentPresetId || changes.provider || changes.textModel)
  ) {
    loadSettings();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImagePreview();
});

document.querySelector("#translate-selection").addEventListener("click", async () => {
  status.textContent = getSidePanelText("readingSelectedText");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    const text = await readSelectedTextWithClipboardFallback(tab.id);
    await sendAction(
      { type: "translate-active-selection", text },
      text ? getSidePanelText("translatingSelectedText") : getSidePanelText("noSelectedText")
    );
  } catch (error) {
    status.textContent = error.message || getSidePanelText("readSelectedTextFailed");
  }
});

document.querySelector("#translate-region").addEventListener("click", async () => {
  await sendAction({ type: "start-region-selection" }, getSidePanelText("selectArea"));
});

document.querySelector("#translate-page").addEventListener("click", async () => {
  await sendAction({ type: "translate-current-page" }, getSidePanelText("translatingCurrentPage"));
});

copyTranslation.addEventListener("click", async () => {
  await copyText(currentResult?.translation || translation.innerText || "", copyTranslation);
});

stopAction.addEventListener("click", async () => {
  stopAction.disabled = true;
  status.textContent = getSidePanelText("cancelling");
  await chrome.runtime.sendMessage({ type: "cancel-current-request" }).catch(() => {});
});

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

toggleConfig.addEventListener("click", async () => {
  const collapsed = !configPanel.classList.contains("is-collapsed");
  setConfigCollapsed(collapsed);
  await chrome.storage.local.set({ sidePanelConfigCollapsed: collapsed });
});

toggleAnswer.addEventListener("click", async () => {
  const collapsed = !answerBox.classList.contains("is-collapsed");
  setAnswerCollapsed(collapsed);
  await chrome.storage.local.set({ sidePanelAnswerCollapsed: collapsed });
});

showOcrResult.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { showOcrResult: showOcrResult.checked }
  });
});

showInputImage.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { showInputImage: showInputImage.checked }
  });
  if (currentResult) renderResult(currentResult);
});

enableThinking.addEventListener("change", async () => {
  const response = await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enableThinking: enableThinking.checked }
  });
  if (response?.settings) {
    enableThinking.checked = Boolean(response.settings.enableThinking);
    renderPresetOptions(response.settings);
  }
});

targetLanguage.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { targetLanguage: targetLanguage.value }
  });
});

compressInputImage.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { compressInputImage: compressInputImage.checked }
  });
});

cropPageMargins.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { cropPageMargins: cropPageMargins.checked }
  });
});

imageMaxEdge.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { imageMaxEdge: clampInteger(imageMaxEdge.value, 320, 4096, 1600) }
  });
});

imageJpegQuality.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { imageJpegQuality: clampNumber(imageJpegQuality.value, 0.5, 1, 0.88) }
  });
});

modelPreset.addEventListener("change", async () => {
  const presetId = modelPreset.value;
  status.textContent = "";
  if (!presetId) {
    chrome.runtime.openOptionsPage();
    return;
  }
  status.textContent = getSidePanelText("switching");
  modelPreset.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "switch-model-preset",
      presetId
    });
    if (!response?.ok) throw new Error(response?.error || getSidePanelText("modelPresetUnavailable"));
    status.textContent = getSidePanelText("switched");
    modelPreset.value = presetId;
  } catch (error) {
    const message = error.message || getSidePanelText("modelPresetUnavailable");
    await loadSettings();
    status.textContent = message;
  } finally {
    modelPreset.disabled = false;
  }
});

modelPreset.addEventListener("click", () => {
  if (modelPreset.options.length === 1 && modelPreset.options[0].value === "") {
    chrome.runtime.openOptionsPage();
  }
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  if (!hasScreenshotContext) {
    status.textContent = getSidePanelText("runScreenshotFirst");
    return;
  }

  chatInput.value = "";
  const historyForRequest = chatHistory.slice();
  const requestId = createRequestId();
  appendChatMessage("user", question);
  const assistantMessage = appendChatMessage("assistant", "");
  activeChatStreams.set(requestId, assistantMessage);
  updateStopVisibility();
  status.textContent = getSidePanelText("askingModel");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ask-last-screenshot",
      question,
      history: historyForRequest,
      requestId
    });
    if (!response?.ok) throw new Error(response?.error || getSidePanelText("questionFailed"));
    setChatMessageContent(assistantMessage, response.answer || "", { reasoning: response.reasoning || "" });
    status.textContent = response.elapsedMs !== undefined ? `T:${formatDuration(response.elapsedMs)}` : "";
  } catch (error) {
    status.textContent = error.message || getSidePanelText("questionFailed");
    setChatMessageContent(assistantMessage, status.textContent);
  } finally {
    activeChatStreams.delete(requestId);
    updateStopVisibility();
  }
});

async function loadLastResult() {
  const response = await chrome.runtime.sendMessage({ type: "get-last-result" });
  if (response?.result) {
    renderResult(response.result);
  }
}

async function loadUiState() {
  const { sidePanelConfigCollapsed, sidePanelAnswerCollapsed } = await chrome.storage.local.get([
    "sidePanelConfigCollapsed",
    "sidePanelAnswerCollapsed"
  ]);
  setConfigCollapsed(Boolean(sidePanelConfigCollapsed));
  setAnswerCollapsed(Boolean(sidePanelAnswerCollapsed));
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "get-settings" });
  const settings = response?.settings || {};
  showOcrResult.checked = Boolean(settings.showOcrResult);
  showInputImage.checked = Boolean(settings.showInputImage);
  compressInputImage.checked = settings.compressInputImage !== false;
  cropPageMargins.checked = settings.cropPageMargins !== false;
  imageMaxEdge.value = settings.imageMaxEdge || 1600;
  imageJpegQuality.value = settings.imageJpegQuality || 0.88;
  enableThinking.checked = Boolean(settings.enableThinking);
  applyThemeColor(settings.themeColor);
  applySidePanelDisplayLanguage(settings.displayLanguage || "auto");
  renderTargetLanguageOptions(settings.targetLanguage || "中文");
  renderPresetOptions(settings);
}

function renderPresetOptions(settings) {
  const presets = settings.modelPresets || [];
  const currentValue = resolveActivePresetId(settings, presets);
  modelPreset.innerHTML = "";
  if (presets.length === 0) {
    modelPreset.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = getSidePanelText("newPreset");
    modelPreset.append(option);
    return;
  }
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name || preset.textModel || "Unnamed";
    modelPreset.append(option);
  });
  modelPreset.value = currentValue;
}

function resolveActivePresetId(settings, presets) {
  if (settings.currentPresetId && presets.some((preset) => preset.id === settings.currentPresetId)) {
    return settings.currentPresetId;
  }
  const matched = presets.find((preset) => presetMatchesSettings(preset, settings));
  return matched?.id || "";
}

function presetMatchesSettings(preset, settings) {
  const keys = [
    "provider",
    "apiBaseUrl",
    "textModel",
    "visionModel",
    "enableThinking",
    "thinkingEffort",
    "thinkingBudgetTokens",
    "thinkingFieldPreset",
    "thinkingRequestFields"
  ];
  return keys.every((key) => normalizePresetValue(preset[key]) === normalizePresetValue(settings[key]));
}

function normalizePresetValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim();
}

function renderTargetLanguageOptions(value) {
  const language = String(value || "中文").trim() || "中文";
  const options = TARGET_LANGUAGE_OPTIONS.includes(language)
    ? TARGET_LANGUAGE_OPTIONS
    : [language, ...TARGET_LANGUAGE_OPTIONS];
  targetLanguage.innerHTML = "";
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    targetLanguage.append(option);
  }
  targetLanguage.value = language;
}

function setTargetLanguageValue(value) {
  const language = String(value || "中文").trim() || "中文";
  if (!Array.from(targetLanguage.options).some((option) => option.value === language)) {
    renderTargetLanguageOptions(language);
    return;
  }
  targetLanguage.value = language;
}

async function readSelectedTextWithClipboardFallback(tabId) {
  const selectedText = await readSelectedTextFromTab(tabId).catch(() => "");
  if (selectedText) return selectedText;

  const [{ result: copied } = {}] = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => document.execCommand?.("copy") || false
    })
    .catch(() => [{ result: false }]);
  if (!copied) return "";

  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return "";
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
      if (element.shadowRoot) readRoot(element.shadowRoot);
      if (element.tagName === "IFRAME") {
        try {
          if (element.contentDocument) readRoot(element.contentDocument);
        } catch {}
      }
    }
  };
  readRoot(document);
  return parts.join("\n\n");
}

function setConfigCollapsed(collapsed) {
  configPanel.classList.toggle("is-collapsed", collapsed);
  setFoldButtonIcon(toggleConfig, collapsed ? "⌄" : "⌃");
  toggleConfig.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggleConfig.setAttribute("aria-label", getSidePanelText(collapsed ? "expandConfig" : "collapseConfig"));
  toggleConfig.setAttribute("title", getSidePanelText(collapsed ? "expandConfig" : "collapseConfig"));
}

function setAnswerCollapsed(collapsed) {
  answerBox.classList.toggle("is-collapsed", collapsed);
  setFoldButtonIcon(toggleAnswer, collapsed ? "⌃" : "⌄");
  toggleAnswer.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggleAnswer.setAttribute("aria-label", getSidePanelText(collapsed ? "expandAnswer" : "collapseAnswer"));
  toggleAnswer.setAttribute("title", getSidePanelText(collapsed ? "expandAnswer" : "collapseAnswer"));
}

function setFoldButtonIcon(button, icon) {
  const iconElement = button.querySelector("span");
  if (iconElement) {
    iconElement.textContent = icon;
  } else {
    button.textContent = icon;
  }
}

async function sendAction(message, pendingText) {
  status.textContent = pendingText;
  updateStopVisibility(true);
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || getSidePanelText("actionFailed"));
  } catch (error) {
    status.textContent = error.message || getSidePanelText("actionFailed");
    return;
  } finally {
    updateStopVisibility(false);
  }
  setTimeout(() => {
    restoreStickyStatus();
  }, 1200);
}

function renderResult(result) {
  const nextImageUrl = result?.imageUrl || "";
  const isNewScreenshotContext = Boolean(nextImageUrl && nextImageUrl !== currentImageUrl);
  currentResult = result || null;
  currentImageUrl = nextImageUrl;
  renderResultStatus(result);
  copyTranslation.hidden = Boolean(result?.isStreaming || !result?.translation);
  translation.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(result?.translation || "");
  resultReasoning.hidden = !result?.reasoning;
  resultReasoningContent.innerHTML = result?.reasoning
    ? globalThis.LLMTranslatorMarkdown.renderMarkdown(result.reasoning)
    : "";
  updateStopVisibility();

  image.innerHTML = "";
  hasScreenshotContext = Boolean(result?.imageUrl);
  setChatEnabled(hasScreenshotContext);

  if (result?.imageUrl && showInputImage.checked) {
    const img = document.createElement("img");
    img.src = result.imageUrl;
    img.alt = "Selected region";
    img.title = getSidePanelText("clickToPreview");
    img.addEventListener("click", () => openImagePreview(result.imageUrl, result.originalImageUrl));
    image.append(img);
  }

  if (isNewScreenshotContext) {
    chatHistory = [];
    chatLog.innerHTML = "";
    setChatVisible(false);
  } else if (!nextImageUrl) {
    chatHistory = [];
    chatLog.innerHTML = "";
    setChatVisible(false);
  }
}

function renderResultStatus(result) {
  stopElapsedTimer();
  if (!result) {
    setStatus("");
    return;
  }

  const updateStatus = () => {
    const parts = [];
    const metrics = result.metrics || {};
    const elapsedMs =
      metrics.elapsedMs ??
      result.elapsedMs ??
      (result.startedAt ? Date.now() - new Date(result.startedAt).getTime() : undefined);
    if (elapsedMs !== undefined) parts.push(formatMetric("T", formatDuration(elapsedMs)));
    const detailParts = [];
    if (metrics.ttftMs !== undefined) detailParts.push(formatMetric("TTFT", formatDuration(metrics.ttftMs)));
    if (metrics.tokensPerSecond !== undefined) detailParts.push(formatMetric("TPS", formatRate(metrics.tokensPerSecond)));
    const tokenSummary = formatTokenSummary(metrics, detailParts);
    if (tokenSummary) parts.push(tokenSummary);
    if (result.isStreaming) {
      parts.push('<span class="status-metric__label">Stream</span>');
    }
    setStatus(parts.join(" "), { html: true });
  };

  updateStatus();
  if (result.startedAt && result.elapsedMs === undefined) {
    elapsedTimer = setInterval(updateStatus, 250);
  }
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, milliseconds / 1000);
  if (totalSeconds < 10) return `${totalSeconds.toFixed(1)}s`;
  return `${Math.round(totalSeconds)}s`;
}

function formatRate(value) {
  const rate = Number(value || 0);
  if (!Number.isFinite(rate) || rate <= 0) return "-";
  if (rate < 10) return rate.toFixed(1);
  return String(Math.round(rate));
}

function formatTokens(value) {
  const tokens = Number(value || 0);
  if (!Number.isFinite(tokens) || tokens <= 0) return "-";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`;
  return `${Math.round(tokens)}`;
}

function formatTokenSummary(metrics, detailParts = []) {
  if (metrics.inputTokens === undefined && metrics.outputTokens === undefined) return "";
  const input = Number(metrics.inputTokens || 0);
  const output = Number(metrics.outputTokens || 0);
  const reasoning = Number(metrics.reasoningTokens || 0);
  const hiddenDetails = [
    ...detailParts,
    `<span class="status-metric__arrow">↑</span><span class="status-metric__value">${formatTokens(input)}</span>`,
    `<span class="status-metric__arrow">↓</span><span class="status-metric__value">${formatTokens(output)}</span>`
  ];
  if (reasoning > 0) {
    hiddenDetails.push(
      `<span class="status-metric__label">R:</span><span class="status-metric__value">${formatTokens(reasoning)}</span>`
    );
  }
  return `<span class="status-metric__label">Tokens:</span><span class="status-metric__value">${formatTokens(input + output)}</span><span class="status-details"> ${hiddenDetails.join(" ")}</span>`;
}

function formatMetric(label, value) {
  return `<span class="status-metric__label">${label}:</span><span class="status-metric__value">${value}</span>`;
}

function openImagePreview(imageUrl, originalImageUrl = "") {
  if (!imageUrl) return;
  closeImagePreview();

  const preview = document.createElement("div");
  preview.className = "image-preview";
  preview.setAttribute("role", "dialog");
  preview.setAttribute("aria-modal", "true");
  preview.setAttribute("aria-label", getSidePanelText("inputImagePreview"));
  const hasComparison = Boolean(originalImageUrl && originalImageUrl !== imageUrl);
  preview.innerHTML = hasComparison
    ? `
      <button class="image-preview__close" type="button" aria-label="${escapeAttribute(getSidePanelText("closeImagePreview"))}">×</button>
      <div class="image-preview__grid">
        <figure>
          <figcaption>${escapeHtml(getSidePanelText("beforeCrop"))}</figcaption>
          <img data-role="original" alt="${escapeAttribute(getSidePanelText("originalPageScreenshot"))}">
        </figure>
        <figure>
          <figcaption>${escapeHtml(getSidePanelText("inputImage"))}</figcaption>
          <img data-role="input" alt="${escapeAttribute(getSidePanelText("inputImagePreview"))}">
        </figure>
      </div>
    `
    : `
      <button class="image-preview__close" type="button" aria-label="${escapeAttribute(getSidePanelText("closeImagePreview"))}">×</button>
      <img data-role="input" alt="${escapeAttribute(getSidePanelText("inputImagePreview"))}">
    `;
  preview.querySelector('[data-role="input"]').src = imageUrl;
  if (hasComparison) {
    preview.querySelector('[data-role="original"]').src = originalImageUrl;
  }
  preview.addEventListener("click", closeImagePreview);
  preview.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", (event) => event.stopPropagation());
  });
  preview.querySelector(".image-preview__grid")?.addEventListener("click", (event) => event.stopPropagation());
  preview.querySelector(".image-preview__close").addEventListener("click", closeImagePreview);
  document.body.append(preview);
  preview.querySelector(".image-preview__close").focus();
}

function closeImagePreview() {
  document.querySelector(".image-preview")?.remove();
}

function setStatus(message, options = {}) {
  stickyStatus = message || "";
  stickyStatusIsHtml = Boolean(options.html);
  restoreStickyStatus();
}

function restoreStickyStatus() {
  if (stickyStatusIsHtml) {
    status.innerHTML = stickyStatus;
  } else {
    status.textContent = stickyStatus;
  }
}

function appendChatMessage(role, content) {
  setChatVisible(true);
  chatHistory.push({ role, content });
  const message = document.createElement("article");
  message.className = `chat-message chat-message--${role}`;
  message.innerHTML = `
    <div class="chat-message__header">
      <div class="chat-message__role">${role}</div>
      <button class="copy-button" type="button">${escapeHtml(getSidePanelText("copy"))}</button>
    </div>
    <details class="chat-message__reasoning" hidden>
      <summary>${escapeHtml(getSidePanelText("thinking"))}</summary>
      <div class="chat-message__reasoning-content"></div>
    </details>
    <div class="chat-message__content">${globalThis.LLMTranslatorMarkdown.renderMarkdown(
      content
    )}</div>
  `;
  message.querySelector(".copy-button").addEventListener("click", async () => {
    await copyText(message.dataset.copyText || "", message.querySelector(".copy-button"));
  });
  message.querySelector(".copy-button").hidden = role === "assistant" && !content;
  message.dataset.copyText = content || "";
  chatLog.append(message);
  scrollReplyAreaToBottom();
  return message;
}

function updateChatStream(message) {
  const element = activeChatStreams.get(message.requestId);
  if (!element) return;
  setChatMessageContent(element, message.answer || "", { showCopy: false, reasoning: message.reasoning || "" });
  if (message.startedAt && message.elapsedMs === undefined) {
    status.textContent = `T:${formatDuration(Date.now() - new Date(message.startedAt).getTime())} Stream`;
  }
  updateStopVisibility();
}

function updateStopVisibility(forceVisible) {
  const visible =
    forceVisible === true ||
    Boolean(currentResult?.isStreaming) ||
    activeChatStreams.size > 0;
  stopAction.hidden = !visible;
  stopAction.disabled = false;
}

function setChatMessageContent(message, content, { showCopy = true, reasoning = "" } = {}) {
  const contentElement = message.querySelector(".chat-message__content");
  contentElement.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(content || "");
  const reasoningElement = message.querySelector(".chat-message__reasoning");
  const reasoningContent = message.querySelector(".chat-message__reasoning-content");
  if (reasoningElement && reasoningContent) {
    reasoningElement.hidden = !reasoning;
    reasoningContent.innerHTML = reasoning ? globalThis.LLMTranslatorMarkdown.renderMarkdown(reasoning) : "";
  }
  message.dataset.copyText = content || "";
  message.querySelector(".copy-button").hidden = !showCopy || !content;
  const lastHistoryItem = chatHistory[chatHistory.length - 1];
  if (lastHistoryItem?.role === "assistant") {
    lastHistoryItem.content = content || "";
  }
  scrollReplyAreaToBottom();
}

function createRequestId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function scrollReplyAreaToBottom() {
  replyArea.scrollTop = replyArea.scrollHeight;
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

function setChatEnabled(enabled) {
  chatForm.setAttribute("aria-disabled", enabled ? "false" : "true");
  chatInput.disabled = !enabled;
  chatForm.querySelector("button").disabled = !enabled;
}

function setChatVisible(visible) {
  chatSection.hidden = !visible;
}

async function copyText(text, button) {
  const value = String(text || "").trim();
  if (!value) {
    status.textContent = getSidePanelText("nothingToCopy");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showCopyState(button, getSidePanelText("copied"));
  } catch {
    status.textContent = getSidePanelText("copyFailed");
  }
}

function showCopyState(button, label) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}

const SIDEPANEL_UI_TEXT = {
  en: {
    collapseConfig: "Collapse settings",
    expandConfig: "Expand settings",
    collapseAnswer: "Collapse answer input",
    expandAnswer: "Expand answer input",
    options: "Options",
    text: "Text",
    screenshot: "Screenshot",
    page: "Page",
    model: "Model",
    lang: "Lang",
    ocr: "OCR",
    image: "Image",
    think: "Think",
    crop: "Crop",
    compress: "Compress",
    edge: "Edge",
    quality: "Quality",
    thinking: "Thinking",
    translation: "Translation",
    copy: "Copy",
    followUp: "Follow-up",
    askPlaceholder: "Ask a question after screenshot translation",
    ask: "Ask",
    stop: "Stop",
    newPreset: "New Preset",
    switching: "Testing model...",
    switched: "Switched",
    modelResponse: "Model response",
    answerInput: "Answer input",
    imageSettingsLabel: "Image compression settings",
    readingSelectedText: "Reading selected text...",
    translatingSelectedText: "Translating selected text...",
    noSelectedText: "No selected text found.",
    readSelectedTextFailed: "Failed to read selected text.",
    selectArea: "Select an area in the active tab.",
    translatingCurrentPage: "Translating current visible page...",
    cancelling: "Cancelling...",
    modelPresetUnavailable: "Model preset is unavailable.",
    runScreenshotFirst: "Run screenshot translation first.",
    askingModel: "Asking model...",
    questionFailed: "Question failed.",
    actionFailed: "Action failed.",
    clickToPreview: "Click to preview",
    inputImagePreview: "Input image preview",
    closeImagePreview: "Close image preview",
    beforeCrop: "Before crop",
    originalPageScreenshot: "Original page screenshot",
    nothingToCopy: "Nothing to copy.",
    copied: "Copied",
    copyFailed: "Copy failed."
  },
  "zh-CN": {
    collapseConfig: "折叠设置",
    expandConfig: "展开设置",
    collapseAnswer: "向下折叠提问区",
    expandAnswer: "展开提问区",
    options: "设置",
    text: "文本",
    screenshot: "截图",
    page: "整页",
    model: "模型",
    lang: "语言",
    ocr: "OCR",
    image: "图片",
    think: "思考",
    crop: "裁剪",
    compress: "压缩",
    edge: "边长",
    quality: "质量",
    thinking: "思考过程",
    translation: "翻译",
    copy: "复制",
    followUp: "追问",
    askPlaceholder: "截图翻译后继续提问",
    ask: "提问",
    stop: "停止",
    newPreset: "新建预设",
    switching: "正在测试模型...",
    switched: "切换成功",
    modelResponse: "模型回复",
    answerInput: "提问输入",
    imageSettingsLabel: "图片压缩设置",
    readingSelectedText: "正在读取选中文本...",
    translatingSelectedText: "正在翻译选中文本...",
    noSelectedText: "没有找到选中文本。",
    readSelectedTextFailed: "读取选中文本失败。",
    selectArea: "请在当前标签页框选区域。",
    translatingCurrentPage: "正在翻译当前可见页...",
    cancelling: "正在取消...",
    modelPresetUnavailable: "模型预设不可用。",
    runScreenshotFirst: "请先运行截图翻译。",
    askingModel: "正在提问模型...",
    questionFailed: "提问失败。",
    actionFailed: "操作失败。",
    clickToPreview: "点击预览",
    inputImagePreview: "输入图片预览",
    closeImagePreview: "关闭图片预览",
    beforeCrop: "裁剪前",
    originalPageScreenshot: "原始页面截图",
    nothingToCopy: "没有可复制的内容。",
    copied: "已复制",
    copyFailed: "复制失败。"
  }
};

function applySidePanelDisplayLanguage(value) {
  currentDisplayLanguage = resolveDisplayLanguage(value);
  const text = SIDEPANEL_UI_TEXT[currentDisplayLanguage];
  document.documentElement.lang = currentDisplayLanguage;
  setConfigCollapsed(configPanel.classList.contains("is-collapsed"));
  setAnswerCollapsed(answerBox.classList.contains("is-collapsed"));
  document.querySelector("#open-options")?.setAttribute("aria-label", text.options);
  document.querySelector("#open-options")?.setAttribute("title", text.options);
  setText("#translate-selection", text.text);
  setText("#translate-region", text.screenshot);
  setText("#translate-page", text.page);
  setText(".preset-row span", text.model);
  setText(".language-row span", text.lang);
  setText("#show-ocr-result ~ span:last-child", text.ocr);
  setText("#show-input-image ~ span:last-child", text.image);
  setText("#enable-thinking ~ span:last-child", text.think);
  setText("#crop-page-margins ~ span:last-child", text.crop);
  setText("#compress-input-image ~ span:last-child", text.compress);
  setLabelText("#image-max-edge", text.edge);
  setLabelText("#image-jpeg-quality", text.quality);
  setText("#result-reasoning summary", text.thinking);
  setText(".translation-panel__label", text.translation);
  setText("#copy-translation", text.copy);
  setText(".chat h2", text.followUp);
  chatInput.placeholder = text.askPlaceholder;
  setText('#chat-form button[type="submit"]', text.ask);
  setText("#stop-action", text.stop);
  document.querySelector(".image-settings")?.setAttribute("aria-label", text.imageSettingsLabel);
  document.querySelector(".reply-area")?.setAttribute("aria-label", text.modelResponse);
  document.querySelector(".answer-box")?.setAttribute("aria-label", text.answerInput);
  if (modelPreset.options.length === 1 && modelPreset.options[0].value === "") {
    modelPreset.options[0].textContent = text.newPreset;
  }
}

function resolveDisplayLanguage(value) {
  if (value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function normalizeThemeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#2da44e";
}

function applyThemeColor(value) {
  document.documentElement.style.setProperty("--llmt-theme-color", normalizeThemeColor(value));
}

function getSidePanelText(key) {
  return SIDEPANEL_UI_TEXT[currentDisplayLanguage]?.[key] || SIDEPANEL_UI_TEXT.en[key] || "";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setLabelText(inputSelector, value) {
  const input = document.querySelector(inputSelector);
  const label = input?.closest("label");
  if (!label) return;
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.nodeValue = `${value}\n                `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
