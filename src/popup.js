const status = document.querySelector("#status");
const showOcrResult = document.querySelector("#show-ocr-result");
const showInputImage = document.querySelector("#show-input-image");
const compressInputImage = document.querySelector("#compress-input-image");
const imageMaxEdge = document.querySelector("#image-max-edge");
const imageJpegQuality = document.querySelector("#image-jpeg-quality");
const enableThinking = document.querySelector("#enable-thinking");
const cropPageMargins = document.querySelector("#crop-page-margins");
const modelPreset = document.querySelector("#model-preset");
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
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enableThinking: enableThinking.checked }
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
  status.textContent = "Testing model...";
  modelPreset.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "switch-model-preset",
      presetId
    });
    if (!response?.ok) throw new Error(response?.error || "Model preset is unavailable.");
    status.textContent = "切换成功";
    modelPreset.value = presetId;
  } catch (error) {
    const message = error.message || "Model preset is unavailable.";
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
    if (!response?.ok) throw new Error(response?.error || "Failed to translate selection.");
    window.close();
  } catch (error) {
    status.textContent = error.message || "Failed to translate selection.";
  }
});

document.querySelector("#translate-region").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "start-region-selection" });
    if (!response?.ok) throw new Error(response?.error || "Failed to start region selection.");
    window.close();
  } catch (error) {
    status.textContent = error.message || "Failed to start region selection.";
  }
});

document.querySelector("#translate-page").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "translate-current-page" });
    if (!response?.ok) throw new Error(response?.error || "Failed to translate current page.");
    window.close();
  } catch (error) {
    status.textContent = error.message || "Failed to translate current page.";
  }
});

document.querySelector("#open-side-panel").addEventListener("click", async () => {
  try {
    if (!activeTabContext?.windowId) {
      throw new Error("No active browser window found. Reopen the extension popup and try again.");
    }
    const openPromise = chrome.sidePanel.open({ windowId: activeTabContext.windowId });
    await chrome.runtime.sendMessage({ type: "mark-side-panel-open", tabId: activeTabContext.tabId });
    await openPromise;
    window.close();
  } catch (error) {
    chrome.storage.session.set({ sidePanelOpen: false });
    status.textContent = error.message || "Failed to open side panel.";
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
    modelPreset.innerHTML = '<option value="">New Preset</option>';
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
    "thinkingRequestFields",
    "systemPrompt"
  ];
  return keys.every((key) => normalizePresetValue(preset[key]) === normalizePresetValue(settings[key]));
}

function normalizePresetValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim();
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
