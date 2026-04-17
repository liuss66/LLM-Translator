const status = document.querySelector("#status");
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
let activeTabContext = null;

loadSettings();
refreshActiveTabContext();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.showOcrResult) {
    showOcrResult.checked = Boolean(changes.showOcrResult.newValue);
  }
  if (areaName === "sync" && changes.showInputImage) {
    showInputImage.checked = Boolean(changes.showInputImage.newValue);
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
    applyPopupDisplayLanguage(changes.displayLanguage.newValue);
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
    await chrome.runtime.openOptionsPage();
    window.close();
    return;
  }
  status.textContent = getPopupText("switching");
  modelPreset.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "switch-model-preset",
      presetId
    });
    if (!response?.ok) throw new Error(response?.error || getPopupText("modelPresetUnavailable"));
    status.textContent = getPopupText("switched");
    modelPreset.value = presetId;
  } catch (error) {
    const message = error.message || getPopupText("modelPresetUnavailable");
    await loadSettings();
    status.textContent = message;
  } finally {
    modelPreset.disabled = false;
  }
});

modelPreset.addEventListener("click", async () => {
  if (modelPreset.options.length === 1 && modelPreset.options[0].value === "") {
    await chrome.runtime.openOptionsPage();
    window.close();
  }
});

document.querySelector("#translate-selection").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const text = await readSelectedTextWithClipboardFallback(tab.id);
    const response = await chrome.runtime.sendMessage({
      type: "translate-selection",
      tabId: tab.id,
      text
    });
    if (!response?.ok) throw new Error(response?.error || getPopupText("translateSelectionFailed"));
    window.close();
  } catch (error) {
    status.textContent = error.message || getPopupText("translateSelectionFailed");
  }
});

document.querySelector("#translate-region").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "start-region-selection" });
    if (!response?.ok) throw new Error(response?.error || getPopupText("startRegionFailed"));
    window.close();
  } catch (error) {
    status.textContent = error.message || getPopupText("startRegionFailed");
  }
});

document.querySelector("#translate-page").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "translate-current-page" });
    if (!response?.ok) throw new Error(response?.error || getPopupText("translatePageFailed"));
    window.close();
  } catch (error) {
    status.textContent = error.message || getPopupText("translatePageFailed");
  }
});

document.querySelector("#open-side-panel").addEventListener("click", async () => {
  try {
    if (!activeTabContext?.windowId) {
      throw new Error(getPopupText("noActiveWindow"));
    }
    const openPromise = chrome.sidePanel.open({ windowId: activeTabContext.windowId });
    await chrome.runtime.sendMessage({ type: "mark-side-panel-open", tabId: activeTabContext.tabId });
    await openPromise;
    window.close();
  } catch (error) {
    chrome.storage.session.set({ sidePanelOpen: false });
    status.textContent = error.message || getPopupText("openSidePanelFailed");
  }
});

document.querySelector("#open-options").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});

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
  applyPopupDisplayLanguage(settings.displayLanguage || "auto");
  renderTargetLanguageOptions(settings.targetLanguage || "中文");
  renderPresetOptions(settings);
}

async function refreshActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isValidWindowId(tab.windowId)) return;
  activeTabContext = {
    tabId: tab.id,
    windowId: tab.windowId
  };
}

function renderPresetOptions(settings) {
  const presets = settings.modelPresets || [];
  const currentValue = resolveActivePresetId(settings, presets);
  modelPreset.innerHTML = "";
  if (presets.length === 0) {
    modelPreset.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = getPopupText("newPreset");
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

function isValidWindowId(windowId) {
  return Number.isInteger(windowId) && windowId >= 0;
}

const POPUP_UI_TEXT = {
  en: {
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
    sidePanel: "Side panel",
    options: "Options",
    newPreset: "New Preset",
    switching: "Testing model...",
    switched: "Switched",
    shortcutText: "Shortcut: Alt+T",
    shortcutScreenshot: "Shortcut: Alt+S",
    pageTitle: "Translate the current visible page",
    sidePanelTitle: "Shortcut: Alt+Shift+Y",
    optionsTitle: "Open settings",
    imageSettingsLabel: "Image compression settings",
    modelPresetUnavailable: "Model preset is unavailable.",
    translateSelectionFailed: "Failed to translate selection.",
    startRegionFailed: "Failed to start region selection.",
    translatePageFailed: "Failed to translate current page.",
    noActiveWindow: "No active browser window found. Reopen the extension popup and try again.",
    openSidePanelFailed: "Failed to open side panel."
  },
  "zh-CN": {
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
    sidePanel: "侧边栏",
    options: "设置",
    newPreset: "新建预设",
    switching: "正在测试模型...",
    switched: "切换成功",
    shortcutText: "快捷键：Alt+T",
    shortcutScreenshot: "快捷键：Alt+S",
    pageTitle: "翻译当前可见页",
    sidePanelTitle: "快捷键：Alt+Shift+Y",
    optionsTitle: "打开设置",
    imageSettingsLabel: "图片压缩设置",
    modelPresetUnavailable: "模型预设不可用。",
    translateSelectionFailed: "翻译选中文本失败。",
    startRegionFailed: "启动截图框选失败。",
    translatePageFailed: "翻译当前页失败。",
    noActiveWindow: "没有找到活动浏览器窗口。请重新打开扩展弹窗后再试。",
    openSidePanelFailed: "打开侧边栏失败。"
  }
};

function applyPopupDisplayLanguage(value) {
  currentDisplayLanguage = resolveDisplayLanguage(value);
  const text = POPUP_UI_TEXT[currentDisplayLanguage];
  document.documentElement.lang = currentDisplayLanguage;
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
  setText("#open-side-panel", text.sidePanel);
  setText("#open-options", text.options);
  document.querySelector("#translate-selection")?.setAttribute("title", text.shortcutText);
  document.querySelector("#translate-region")?.setAttribute("title", text.shortcutScreenshot);
  document.querySelector("#translate-page")?.setAttribute("title", text.pageTitle);
  document.querySelector("#open-side-panel")?.setAttribute("title", text.sidePanelTitle);
  document.querySelector("#open-options")?.setAttribute("title", text.optionsTitle);
  document.querySelector(".image-settings")?.setAttribute("aria-label", text.imageSettingsLabel);
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

function getPopupText(key) {
  return POPUP_UI_TEXT[currentDisplayLanguage]?.[key] || POPUP_UI_TEXT.en[key] || "";
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
  if (textNode) textNode.nodeValue = `${value}\n          `;
}
