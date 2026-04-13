const status = document.querySelector("#status");
const showOcrResult = document.querySelector("#show-ocr-result");
const enableThinking = document.querySelector("#enable-thinking");
const modelPreset = document.querySelector("#model-preset");

loadSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.showOcrResult) {
    showOcrResult.checked = Boolean(changes.showOcrResult.newValue);
  }
  if (areaName === "sync" && changes.enableThinking) {
    enableThinking.checked = Boolean(changes.enableThinking.newValue);
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

enableThinking.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "update-settings",
    settings: { enableThinking: enableThinking.checked }
  });
});

modelPreset.addEventListener("change", async () => {
  const presetId = modelPreset.value;
  if (!presetId) return;
  status.textContent = "Testing model...";
  modelPreset.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "switch-model-preset",
      presetId
    });
    if (!response?.ok) throw new Error(response?.error || "Model preset is unavailable.");
    status.textContent = "Model switched.";
  } catch (error) {
    status.textContent = error.message || "Model preset is unavailable.";
    await loadSettings();
  } finally {
    modelPreset.disabled = false;
  }
});

document.querySelector("#translate-selection").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.getSelection?.().toString() || ""
    });
    const response = await chrome.runtime.sendMessage({
      type: "translate-selection",
      tabId: tab.id,
      text: result || ""
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

document.querySelector("#open-side-panel").addEventListener("click", async () => {
  try {
    const openPromise = chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({ type: "mark-side-panel-open", tabId: tab?.id });
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
  enableThinking.checked = Boolean(settings.enableThinking);
  renderPresetOptions(settings.modelPresets || [], settings.currentPresetId || "");
}

function renderPresetOptions(presets, currentPresetId) {
  const currentValue = currentPresetId || "";
  modelPreset.innerHTML = '<option value="">Current</option>';
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name || preset.textModel || "Unnamed";
    modelPreset.append(option);
  });
  modelPreset.value = currentValue;
}
