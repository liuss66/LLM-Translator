const DEFAULT_SETTINGS = {
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  textModel: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  targetLanguage: "中文",
  displayLanguage: "auto",
  themeColor: "#2da44e",
  showOcrResult: false,
  showInputImage: false,
  compressInputImage: true,
  cropPageMargins: true,
  imageMaxEdge: 1600,
  imageJpegQuality: 0.88,
  enableThinking: false,
  thinkingEffort: "medium",
  thinkingBudgetTokens: 0,
  thinkingFieldPreset: "auto",
  thinkingRequestFields:
    "thinking.type\nenable_thinking\nchat_template_kwargs.enable_thinking\nextra_body.enable_thinking\nextra_body.chat_template_kwargs.enable_thinking",
  currentPresetId: "",
  modelPresets: [],
  systemPrompt:
    "You are a precise translation assistant. Preserve meaning, technical terms, formatting, and numbers. If you encounter images, charts, or other non-translatable content, insert a clear placeholder such as [此处应插入图 X.X] and briefly describe the image content in brackets if needed for context. Always return only the final translated text unless OCR extraction is explicitly requested."
};
const MODEL_SETTING_KEYS = [
  "provider",
  "apiBaseUrl",
  "apiKey",
  "textModel",
  "visionModel",
  "enableThinking",
  "thinkingEffort",
  "thinkingBudgetTokens",
  "thinkingFieldPreset",
  "thinkingRequestFields"
];

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const presetSelect = document.querySelector("#preset-select");
const presetName = document.querySelector("#preset-name");
const importSettingsFile = document.querySelector("#import-settings-file");
const displayLanguageSelect = document.querySelector("#display-language-select");
const targetLanguageSelect = document.querySelector("#target-language-select");
const targetLanguageCustom = document.querySelector("#target-language-custom");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const modelSelect = form.elements.textModel;
const modelInput = form.elements.textModelInput;
const CUSTOM_MODEL_VALUE = "__custom__";
let saveTimer;
let modelPresets = [];
let currentPresetId = "";
let isLoadingPreset = false;
let fetchedModels = [];
const EXPORT_VERSION = 1;
const IMPORTABLE_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "apiKey");
const TARGET_LANGUAGE_OPTIONS = Array.from(targetLanguageSelect.options)
  .map((option) => option.value)
  .filter((value) => value !== "Custom");
bootstrapThemeColor();
loadSettings();

form.addEventListener("change", async (event) => {
  if (isLoadingPreset) return;
  if (isPresetControl(event.target)) return;
  await saveSettings(getUiMessage("saved"));
});

form.addEventListener("input", (event) => {
  if (isLoadingPreset) return;
  if (isPresetControl(event.target)) return;
  if (event.target === form.elements.themeColor) {
    applyThemeColor(event.target.value);
    saveThemeColor(event.target.value);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSettings(getUiMessage("saved"));
  }, 450);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!reportFormValidity()) return;
  const presetId = await saveCurrentModelPreset();
  await saveSettings(presetId ? getUiMessage("settingsAndPresetSaved") : getUiMessage("saved"));
});

form.elements.provider.addEventListener("change", () => {
  updateModelControlState();
});

document.querySelector("#fetch-models").addEventListener("click", async () => {
  const apiBaseUrl = form.elements.apiBaseUrl.value.trim();
  const apiKey = form.elements.apiKey.value.trim();
  if (!apiBaseUrl) {
    status.textContent = getUiMessage("enterApiBaseUrl");
    return;
  }
  status.textContent = getUiMessage("fetchingModels");
  const fetchBtn = document.querySelector("#fetch-models");
  fetchBtn.disabled = true;
  try {
    const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${normalizedBaseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    const models = (data.data || []).map((m) => m.id).filter(Boolean);
    if (models.length === 0) {
      status.textContent = getUiMessage("noModelsReturned");
      return;
    }
    fetchedModels = models;
    populateModelSelect(models);
    const foundMessage = formatUiMessage("modelsFound", models.length);
    status.textContent = foundMessage;
    setTimeout(() => {
      if (status.textContent === foundMessage) status.textContent = "";
    }, 2000);
  } catch (error) {
    status.textContent = `${getUiMessage("fetchFailed")} ${error.message}`;
    fetchedModels = [];
    populateModelSelect([]);
  } finally {
    fetchBtn.disabled = false;
  }
});

function populateModelSelect(models) {
  const savedModel = readCurrentModelValue();

  modelSelect.innerHTML = "";

  if (models.length === 0) {
    modelSelect.hidden = true;
    modelSelect.disabled = true;
    modelInput.hidden = false;
    modelInput.disabled = false;
    updateModelControlState();
    return;
  }

  modelSelect.hidden = false;
  modelSelect.disabled = false;
  modelInput.hidden = true;
  modelInput.disabled = true;

  addOption(modelSelect, "", "-- select --");

  for (const model of models) {
    addOption(modelSelect, model, model);
  }
  addOption(modelSelect, CUSTOM_MODEL_VALUE, "Custom model...");

  if (savedModel && models.includes(savedModel)) {
    modelSelect.value = savedModel;
    modelInput.value = savedModel;
  } else if (savedModel) {
    modelSelect.value = CUSTOM_MODEL_VALUE;
    modelInput.value = savedModel;
  }
  syncCustomModelInput();
  updateModelControlState();
}

function addOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

// Model select -> hidden input sync
modelSelect.addEventListener("change", () => {
  syncCustomModelInput();
  if (modelSelect.value && modelSelect.value !== CUSTOM_MODEL_VALUE) {
    modelInput.value = modelSelect.value;
  }
});

document.querySelector("#test-model").addEventListener("click", async () => {
  if (!reportFormValidity()) return;
  status.textContent = getUiMessage("testingModel");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "test-model",
      settings: readFormSettings()
    });
    if (!response?.ok) throw new Error(response?.error || getUiMessage("modelTestFailed"));
    status.textContent = `${getUiMessage("modelTestPassed")} ${response.result}`;
  } catch (error) {
    status.textContent = error.message || getUiMessage("modelTestFailed");
  }
});

document.querySelector("#open-shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

targetLanguageSelect.addEventListener("change", async () => {
  syncTargetLanguageCustom();
  await saveSettings(getUiMessage("saved"));
});

displayLanguageSelect.addEventListener("change", async () => {
  applyOptionsDisplayLanguage(displayLanguageSelect.value);
  await saveSettings(getUiMessage("saved"));
});

form.elements.themeColor.addEventListener("change", async () => {
  await saveThemeColor(form.elements.themeColor.value, getUiMessage("saved"));
});

document.querySelector("#export-settings").addEventListener("click", () => {
  exportSettings();
});

document.querySelector("#import-settings").addEventListener("click", () => {
  importSettingsFile.value = "";
  importSettingsFile.click();
});

importSettingsFile.addEventListener("change", async () => {
  const [file] = importSettingsFile.files || [];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    const settings = sanitizeImportedSettings(imported);
    await applyImportedSettings(settings);
    status.textContent = getUiMessage("settingsImported");
  } catch (error) {
    status.textContent = error.message || getUiMessage("importFailed");
  }
});

document.querySelector("#restore-defaults").addEventListener("click", async () => {
  if (!confirm(getUiMessage("restoreConfirm"))) return;
  modelPresets = [];
  currentPresetId = "";
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS });
  renderPresetOptions();
  presetSelect.value = "";
  presetName.value = "";
  fillForm(DEFAULT_SETTINGS);
  status.textContent = getUiMessage("defaultsRestored");
});

presetSelect.addEventListener("change", () => {
  loadSelectedPreset();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTab(button.dataset.tab);
  });
});

document.querySelector("#new-preset").addEventListener("click", async () => {
  selectTab("model-config");
  clearCurrentPreset();
  clearModelConnectionFields();
  await chrome.storage.sync.set({ currentPresetId });
  status.textContent = getUiMessage("newPresetReady");
});

document.querySelector("#save-preset").addEventListener("click", async () => {
  const presetId = await saveCurrentModelPreset();
  if (!presetId) {
    status.textContent = getUiMessage("presetNeedsNameOrModel");
    return;
  }
  await saveSettings(getUiMessage("presetSaved"));
});

async function saveCurrentModelPreset() {
  const existingId = currentPresetId;
  const id = existingId || createPresetId();
  const name = presetName.value.trim() || readFormSettings().textModel || "Unnamed";
  if (!existingId && name === "Unnamed") {
    return "";
  }
  const preset = {
    id,
    name,
    ...pickModelSettings(readFormSettings())
  };
  modelPresets = [
    ...modelPresets.filter((item) => item.id !== id),
    preset
  ].sort((left, right) => left.name.localeCompare(right.name));
  currentPresetId = id;
  await chrome.storage.sync.set({
    modelPresets,
    currentPresetId,
    ...pickModelSettings(preset)
  });
  renderPresetOptions();
  presetSelect.value = id;
  presetName.value = name;
  return id;
}

document.querySelector("#restore-default-prompt").addEventListener("click", async () => {
  form.elements.systemPrompt.value = DEFAULT_SETTINGS.systemPrompt;
  await saveSettings(getUiMessage("defaultPromptRestored"));
});

async function loadSelectedPreset() {
  const preset = modelPresets.find((item) => item.id === presetSelect.value);
  if (!preset) {
    currentPresetId = "";
    presetName.value = "";
    await chrome.storage.sync.set({ currentPresetId });
    return;
  }
  try {
    isLoadingPreset = true;
    fillForm({
      ...readFormSettings(),
      ...pickPresetSettingsForLoad(preset),
      currentPresetId: preset.id,
      modelPresets
    });
    currentPresetId = preset.id;
    presetName.value = preset.name || "";
    await saveSettings(getUiMessage("presetLoaded"), { includePresetState: true });
  } finally {
    isLoadingPreset = false;
  }
}

document.querySelector("#delete-preset").addEventListener("click", async () => {
  const preset = modelPresets.find((item) => item.id === presetSelect.value);
  if (!preset) {
    status.textContent = getUiMessage("selectPresetFirst");
    return;
  }
  modelPresets = modelPresets.filter((item) => item.id !== preset.id);
  currentPresetId = currentPresetId === preset.id ? "" : currentPresetId;
  await chrome.storage.sync.set({ modelPresets, currentPresetId });
  renderPresetOptions();
  presetName.value = "";
  status.textContent = getUiMessage("presetDeleted");
});

async function loadSettings() {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
  };
  settings.themeColor = normalizeThemeColor(settings.themeColor);

  modelPresets = Array.isArray(settings.modelPresets) ? settings.modelPresets : [];
  currentPresetId = modelPresets.some((item) => item.id === settings.currentPresetId) ? settings.currentPresetId : "";
  const currentPreset = modelPresets.find((item) => item.id === currentPresetId);
  const displaySettings = currentPreset
    ? {
        ...settings,
        ...pickPresetSettingsForLoad(currentPreset),
        currentPresetId
      }
    : settings;
  renderPresetOptions();
  presetSelect.value = currentPresetId;
  presetName.value = modelPresets.find((item) => item.id === currentPresetId)?.name || "";
  fillForm(displaySettings);
}

async function bootstrapThemeColor() {
  const { themeColor } = await chrome.storage.sync.get({ themeColor: DEFAULT_SETTINGS.themeColor });
  applyThemeColor(themeColor);
}

async function saveThemeColor(value, message = "") {
  const themeColor = normalizeThemeColor(value);
  form.elements.themeColor.value = themeColor;
  applyThemeColor(themeColor);
  await chrome.storage.sync.set({ themeColor });
  if (message) {
    status.textContent = message;
    setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 1600);
  }
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (key === "textModelInput") continue;
    const field = form.elements[key];
    if (field?.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (field) {
      field.value = value;
    }
  }
  setTargetLanguageValue(settings.targetLanguage);
  applyOptionsDisplayLanguage(settings.displayLanguage);
  applyThemeColor(settings.themeColor);

  if (fetchedModels.length > 0) {
    populateModelSelect(fetchedModels);
  } else {
    modelSelect.hidden = true;
    modelSelect.disabled = true;
    modelInput.hidden = false;
    modelInput.disabled = false;
    modelInput.value = settings.textModel || "";
    updateModelControlState();
  }
}

function readFormSettings() {
  const data = new FormData(form);
  const settings = Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS)
      .filter(
        (key) =>
          key !== "showOcrResult" &&
          key !== "showInputImage" &&
          key !== "compressInputImage" &&
          key !== "cropPageMargins" &&
          key !== "enableThinking" &&
          key !== "currentPresetId" &&
          key !== "modelPresets"
      )
      .map((key) => {
        if (key === "textModel") {
          const value = readCurrentModelValue();
          return [key, String(value || "").trim()];
        }
        return [key, String(data.get(key) || "").trim()];
      })
  );
  settings.showOcrResult = form.elements.showOcrResult.checked;
  settings.showInputImage = form.elements.showInputImage.checked;
  settings.compressInputImage = form.elements.compressInputImage.checked;
  settings.cropPageMargins = form.elements.cropPageMargins.checked;
  settings.imageMaxEdge = clampInteger(form.elements.imageMaxEdge.value, 320, 4096, 1600);
  settings.imageJpegQuality = clampNumber(form.elements.imageJpegQuality.value, 0.5, 1, 0.88);
  settings.enableThinking = form.elements.enableThinking.checked;
  settings.thinkingEffort = normalizeThinkingEffort(form.elements.thinkingEffort.value);
  settings.thinkingBudgetTokens = clampInteger(form.elements.thinkingBudgetTokens.value, 0, 128000, 0);
  settings.thinkingFieldPreset = normalizeThinkingFieldPreset(form.elements.thinkingFieldPreset.value);
  settings.visionModel = settings.textModel;
  settings.targetLanguage = readTargetLanguage();
  settings.themeColor = normalizeThemeColor(settings.themeColor);
  settings.currentPresetId = currentPresetId;
  settings.modelPresets = modelPresets;
  return settings;
}

function readCurrentModelValue() {
  if (modelSelect.hidden || modelSelect.value === CUSTOM_MODEL_VALUE) {
    return String(modelInput.value || "").trim();
  }
  return String(modelSelect.value || "").trim();
}

function updateModelControlState() {
  const requireModel = form.elements.provider.value !== "llamacpp";
  modelSelect.required = requireModel && !modelSelect.hidden && !modelSelect.disabled;
  modelInput.required = requireModel && !modelInput.hidden && !modelInput.disabled;
}

function syncCustomModelInput() {
  if (modelSelect.hidden || modelSelect.value === CUSTOM_MODEL_VALUE) {
    modelInput.hidden = false;
    modelInput.disabled = false;
  } else {
    modelInput.hidden = true;
    modelInput.disabled = true;
  }
  updateModelControlState();
}

async function saveSettings(message, options = {}) {
  const settings = readFormSettings();
  if (!options.includePresetState) {
    delete settings.currentPresetId;
    delete settings.modelPresets;
  }
  await chrome.storage.sync.set(settings);
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1600);
}

function renderPresetOptions() {
  presetSelect.innerHTML = "";
  addOption(presetSelect, "", getUiMessage(modelPresets.length === 0 ? "noSavedPresets" : "selectPreset"));
  if (modelPresets.length === 0) {
    presetSelect.value = "";
    return;
  }
  modelPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name || preset.textModel || "Unnamed";
    presetSelect.append(option);
  });
}

function setTargetLanguageValue(value) {
  const language = String(value || DEFAULT_SETTINGS.targetLanguage).trim() || DEFAULT_SETTINGS.targetLanguage;
  if (TARGET_LANGUAGE_OPTIONS.includes(language)) {
    targetLanguageSelect.value = language;
    targetLanguageCustom.value = language;
  } else {
    targetLanguageSelect.value = "Custom";
    targetLanguageCustom.value = language;
  }
  syncTargetLanguageCustom();
}

function syncTargetLanguageCustom() {
  const custom = targetLanguageSelect.value === "Custom";
  targetLanguageCustom.hidden = !custom;
  targetLanguageCustom.required = custom;
  if (!custom) {
    targetLanguageCustom.value = targetLanguageSelect.value;
  }
}

function readTargetLanguage() {
  const value =
    targetLanguageSelect.value === "Custom"
      ? targetLanguageCustom.value
      : targetLanguageSelect.value;
  return String(value || DEFAULT_SETTINGS.targetLanguage).trim() || DEFAULT_SETTINGS.targetLanguage;
}

function exportSettings() {
  const settings = readFormSettings();
  const exportData = {
    format: "llm-translator-settings",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: pickExportSettings(settings)
  };
  const blob = new Blob([`${JSON.stringify(exportData, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `llm-translator-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  status.textContent = getUiMessage("settingsExported");
}

function pickExportSettings(settings) {
  return Object.fromEntries(
    IMPORTABLE_SETTING_KEYS.map((key) => [
      key,
      key === "modelPresets" ? stripPresetSecrets(settings[key]) : cloneSettingValue(settings[key])
    ])
  );
}

function cloneSettingValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeImportedSettings(imported) {
  const source = imported?.settings && typeof imported.settings === "object" ? imported.settings : imported;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Import file must contain a settings object.");
  }

  const next = {};
  for (const key of IMPORTABLE_SETTING_KEYS) {
    if (source[key] !== undefined) {
      next[key] = sanitizeSettingValue(key, source[key]);
    }
  }
  if (Object.keys(next).length === 0) {
    throw new Error("Import file did not contain supported settings.");
  }
  return next;
}

function sanitizeSettingValue(key, value) {
  if (key === "provider") {
    return ["openai", "anthropic", "llamacpp"].includes(value) ? value : DEFAULT_SETTINGS.provider;
  }
  if (key === "displayLanguage") {
    return normalizeDisplayLanguage(value);
  }
  if (key === "themeColor") {
    return normalizeThemeColor(value);
  }
  if (key === "showOcrResult" || key === "showInputImage" || key === "compressInputImage" || key === "cropPageMargins" || key === "enableThinking") {
    return Boolean(value);
  }
  if (key === "imageMaxEdge") {
    return clampInteger(value, 320, 4096, DEFAULT_SETTINGS.imageMaxEdge);
  }
  if (key === "imageJpegQuality") {
    return clampNumber(value, 0.5, 1, DEFAULT_SETTINGS.imageJpegQuality);
  }
  if (key === "thinkingEffort") {
    return normalizeThinkingEffort(value);
  }
  if (key === "thinkingBudgetTokens") {
    return clampInteger(value, 0, 128000, DEFAULT_SETTINGS.thinkingBudgetTokens);
  }
  if (key === "thinkingFieldPreset") {
    return normalizeThinkingFieldPreset(value);
  }
  if (key === "modelPresets") {
    return sanitizeModelPresets(value);
  }
  if (key === "currentPresetId") {
    return String(value || "");
  }
  return String(value ?? DEFAULT_SETTINGS[key] ?? "").trim();
}

function sanitizeModelPresets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || createPresetId()),
      name: String(item.name || item.textModel || "Unnamed").trim() || "Unnamed",
      ...pickPresetSettingsWithoutApiKey(item)
    }));
}

async function applyImportedSettings(settings) {
  const existing = readFormSettings();
  const next = {
    ...existing,
    ...settings,
    apiKey: existing.apiKey
  };
  modelPresets = Array.isArray(next.modelPresets) ? next.modelPresets : [];
  currentPresetId = modelPresets.some((item) => item.id === next.currentPresetId) ? next.currentPresetId : "";
  next.modelPresets = modelPresets;
  next.currentPresetId = currentPresetId;
  await chrome.storage.sync.set(next);
  renderPresetOptions();
  presetSelect.value = currentPresetId;
  presetName.value = modelPresets.find((item) => item.id === currentPresetId)?.name || "";
  fillForm(next);
}

function pickModelSettings(source) {
  return Object.fromEntries(
    MODEL_SETTING_KEYS.map((key) => [key, source[key] ?? DEFAULT_SETTINGS[key]])
  );
}

function pickPresetSettingsForLoad(preset) {
  const settings = pickModelSettings(preset);
  if (!preset.apiKey) {
    delete settings.apiKey;
  }
  return settings;
}

function pickPresetSettingsWithoutApiKey(source) {
  return Object.fromEntries(
    MODEL_SETTING_KEYS.filter((key) => key !== "apiKey").map((key) => [key, source[key] ?? DEFAULT_SETTINGS[key]])
  );
}

function stripPresetSecrets(presets) {
  return sanitizeModelPresets(presets);
}

function createPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clearCurrentPreset() {
  currentPresetId = "";
  presetSelect.value = "";
  presetName.value = "";
}

function clearModelConnectionFields() {
  form.elements.apiBaseUrl.value = "";
  form.elements.apiKey.value = "";
  form.elements.textModel.value = "";
  form.elements.textModelInput.value = "";
  fetchedModels = [];
  populateModelSelect([]);
}

function selectTab(tabId) {
  if (!tabId) return;
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  tabPanels.forEach((panel) => {
    const active = panel.id === tabId;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function reportFormValidity() {
  if (form.checkValidity()) return true;
  const invalidField = form.querySelector(":invalid");
  const panel = invalidField?.closest(".tab-panel");
  if (panel?.id) {
    selectTab(panel.id);
  }
  form.reportValidity();
  return false;
}

function isPresetControl(target) {
  return target?.id === "preset-select" || target?.id === "preset-name";
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

function normalizeThinkingEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  return ["none", "minimal", "low", "medium", "high", "xhigh"].includes(effort)
    ? effort
    : DEFAULT_SETTINGS.thinkingEffort;
}

function normalizeThinkingFieldPreset(value) {
  const preset = String(value || "").trim().toLowerCase();
  return ["auto", "doubao", "custom"].includes(preset)
    ? preset
    : DEFAULT_SETTINGS.thinkingFieldPreset;
}

function normalizeDisplayLanguage(value) {
  const language = String(value || "").trim();
  return ["auto", "zh-CN", "en"].includes(language) ? language : DEFAULT_SETTINGS.displayLanguage;
}

function normalizeThemeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_SETTINGS.themeColor;
}

function applyThemeColor(value) {
  document.documentElement.style.setProperty("--llmt-theme-color", normalizeThemeColor(value));
}

const OPTIONS_UI_TEXT = {
  en: {
    intro: "Fill in model service configuration. Changes are saved automatically.",
    modelConfig: "Model config",
    appConfig: "App config",
    prompt: "Prompt",
    keyboard: "Keyboard",
    configBackup: "Config backup",
    preset: "Preset",
    name: "Name",
    provider: "Provider",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    model: "Model",
    enableThinking: "Enable model thinking",
    fieldPreset: "Field preset",
    thinkingEffort: "Thinking effort",
    tokenBudget: "Token budget",
    customThinkingFields: "Custom thinking fields",
    displayLanguage: "Display language",
    targetLanguage: "Target language",
    themeColor: "Theme color",
    ocrText: "OCR text",
    inputImage: "Input image",
    compress: "Compress",
    crop: "Crop",
    maxEdge: "Max edge",
    jpegQuality: "JPEG quality",
    systemPrompt: "System prompt",
    settingsMenu: "Settings menu",
    newPreset: "New preset",
    savePreset: "Save preset",
    deletePreset: "Delete preset",
    fetch: "Fetch",
    testModel: "Test model",
    defaultPrompt: "Default prompt",
    promptNote: "Prompt is a global setting and is not saved or switched with model presets.",
    keyboardNote: "Chrome extension shortcuts must be configured on the browser shortcuts page.",
    configureShortcuts: "Configure shortcuts",
    exportSettings: "Export settings",
    importSettings: "Import settings",
    restoreDefaults: "Restore defaults",
    backupNote: "Export and import will not include or overwrite the API Key.",
    targetCustom: "Custom",
    modelPlaceholder: "-- select or type --",
    apiKeyPlaceholder: "OpenAI/Anthropic required; llama.cpp optional",
    fetchTitle: "Fetch model list from /models endpoint",
    fieldAuto: "Auto from URL/model",
    fieldDoubao: "Doubao / VolcEngine",
    fieldCustom: "Custom fields below",
    thinkingFieldsNote: "Auto selects the best field from URL and model name; Custom uses the fields below.",
    shortcutTranslateText: "Translate selected text",
    shortcutTranslateTextDesc: "Translate the currently selected text",
    shortcutScreenshot: "Screenshot translation",
    shortcutScreenshotDesc: "Select a screen region and translate it",
    shortcutPage: "Translate current page",
    shortcutPageDesc: "Translate the current visible page",
    shortcutSidePanel: "Open side panel",
    shortcutSidePanelDesc: "Open the translator side panel",
    saved: "Saved.",
    settingsAndPresetSaved: "Settings and preset saved.",
    enterApiBaseUrl: "Please enter API Base URL first.",
    fetchingModels: "Fetching models...",
    noModelsReturned: "No models returned from API.",
    modelsFound: "Found {0} models.",
    fetchFailed: "Fetch failed:",
    testingModel: "Testing model...",
    modelTestFailed: "Model test failed.",
    modelTestPassed: "Model test passed:",
    settingsImported: "Settings imported. API Key was unchanged.",
    importFailed: "Import failed.",
    restoreConfirm: "Restore all settings to defaults? API Key and presets will be cleared.",
    defaultsRestored: "Defaults restored.",
    newPresetReady: "New preset ready. Fill the model config and click Save preset.",
    presetNeedsNameOrModel: "Model preset needs a name or model.",
    presetSaved: "Preset saved.",
    defaultPromptRestored: "Default prompt restored.",
    presetLoaded: "Preset loaded.",
    selectPresetFirst: "Select a preset first.",
    presetDeleted: "Preset deleted.",
    noSavedPresets: "No saved presets",
    selectPreset: "Select preset",
    settingsExported: "Settings exported without API Key."
  },
  "zh-CN": {
    intro: "填写模型服务配置。修改参数后会自动保存。",
    modelConfig: "模型配置",
    appConfig: "应用配置",
    prompt: "提示词",
    keyboard: "快捷键",
    configBackup: "配置备份",
    preset: "预设",
    name: "名称",
    provider: "服务商",
    apiBaseUrl: "API 地址",
    apiKey: "API Key",
    model: "模型",
    enableThinking: "启用模型思考",
    fieldPreset: "字段预设",
    thinkingEffort: "思考强度",
    tokenBudget: "Token 预算",
    customThinkingFields: "自定义思考字段",
    displayLanguage: "显示语言",
    targetLanguage: "目标语言",
    themeColor: "主题色",
    ocrText: "OCR 原文",
    inputImage: "输入图片",
    compress: "压缩",
    crop: "裁剪",
    maxEdge: "最大边长",
    jpegQuality: "JPEG 质量",
    systemPrompt: "系统提示词",
    settingsMenu: "设置菜单",
    newPreset: "新建预设",
    savePreset: "保存预设",
    deletePreset: "删除预设",
    fetch: "获取模型",
    testModel: "测试模型",
    defaultPrompt: "默认提示词",
    promptNote: "提示词是全局配置，不会随模型预设保存或切换。",
    keyboardNote: "Chrome 扩展快捷键需要在浏览器快捷键页面配置。",
    configureShortcuts: "配置快捷键",
    exportSettings: "导出配置",
    importSettings: "导入配置",
    restoreDefaults: "恢复默认",
    backupNote: "导出和导入不会包含或覆盖 API Key。",
    targetCustom: "自定义",
    modelPlaceholder: "-- 选择或输入 --",
    apiKeyPlaceholder: "OpenAI/Anthropic 必填；llama.cpp 可选",
    fetchTitle: "从 /models 接口获取模型列表",
    fieldAuto: "根据 URL/模型自动选择",
    fieldDoubao: "豆包 / 火山方舟",
    fieldCustom: "使用下方自定义字段",
    thinkingFieldsNote: "Auto 会根据 URL 和模型名自动选择最合适的字段；Custom 才使用下面的自定义字段。",
    shortcutTranslateText: "翻译选中文本",
    shortcutTranslateTextDesc: "翻译当前选中的文本",
    shortcutScreenshot: "截图翻译",
    shortcutScreenshotDesc: "框选屏幕区域并翻译",
    shortcutPage: "翻译当前页",
    shortcutPageDesc: "翻译当前可见页",
    shortcutSidePanel: "打开侧边栏",
    shortcutSidePanelDesc: "打开翻译侧边栏",
    saved: "已保存。",
    settingsAndPresetSaved: "设置和预设已保存。",
    enterApiBaseUrl: "请先填写 API 地址。",
    fetchingModels: "正在获取模型...",
    noModelsReturned: "API 没有返回模型。",
    modelsFound: "找到 {0} 个模型。",
    fetchFailed: "获取失败：",
    testingModel: "正在测试模型...",
    modelTestFailed: "模型测试失败。",
    modelTestPassed: "模型测试通过：",
    settingsImported: "配置已导入，API Key 未被覆盖。",
    importFailed: "导入失败。",
    restoreConfirm: "确定恢复默认设置？API Key 和预设都会被清空。",
    defaultsRestored: "已恢复默认设置。",
    newPresetReady: "新预设已准备好。填写模型配置后点击保存预设。",
    presetNeedsNameOrModel: "模型预设需要名称或模型。",
    presetSaved: "预设已保存。",
    defaultPromptRestored: "已恢复默认提示词。",
    presetLoaded: "预设已加载。",
    selectPresetFirst: "请先选择一个预设。",
    presetDeleted: "预设已删除。",
    noSavedPresets: "没有已保存预设",
    selectPreset: "选择预设",
    settingsExported: "配置已导出，不包含 API Key。"
  }
};

function applyOptionsDisplayLanguage(value) {
  const language = resolveDisplayLanguage(value);
  const text = OPTIONS_UI_TEXT[language];
  document.documentElement.lang = language;
  setText("#page-intro-text", text.intro);
  setText('[data-tab="model-config"]', text.modelConfig);
  setText('[data-tab="app-config"]', text.appConfig);
  setText('[data-tab="prompt-config"]', text.prompt);
  setText('[data-tab="keyboard-config"]', text.keyboard);
  setText('[data-tab="config-backup"]', text.configBackup);
  setText("#model-config h2", text.modelConfig);
  setText("#app-config h2", text.appConfig);
  setText("#prompt-config h2", text.prompt);
  setText("#keyboard-config h2", text.keyboard);
  setText("#config-backup h2", text.configBackup);
  setText("#new-preset", text.newPreset);
  setText("#save-preset", text.savePreset);
  setText("#delete-preset", text.deletePreset);
  setText("#fetch-models", text.fetch);
  setText("#test-model", text.testModel);
  setText("#restore-default-prompt", text.defaultPrompt);
  setLabelText("#preset-select", text.preset);
  setLabelText("#preset-name", text.name);
  setLabelText('[name="provider"]', text.provider);
  setLabelText('[name="apiBaseUrl"]', text.apiBaseUrl);
  setLabelText('[name="apiKey"]', text.apiKey);
  setLabelText('[name="textModel"]', text.model);
  setText('[name="enableThinking"] ~ span:last-child', text.enableThinking);
  setLabelText('[name="thinkingFieldPreset"]', text.fieldPreset);
  setLabelText('[name="thinkingEffort"]', text.thinkingEffort);
  setLabelText('[name="thinkingBudgetTokens"]', text.tokenBudget);
  setLabelText('[name="thinkingRequestFields"]', text.customThinkingFields);
  setLabelText("#display-language-select", text.displayLanguage);
  setLabelText("#target-language-select", text.targetLanguage);
  setLabelText('[name="themeColor"]', text.themeColor);
  setText('[name="showOcrResult"] ~ span:last-child', text.ocrText);
  setText('[name="showInputImage"] ~ span:last-child', text.inputImage);
  setText('[name="compressInputImage"] ~ span:last-child', text.compress);
  setText('[name="cropPageMargins"] ~ span:last-child', text.crop);
  setLabelText('[name="imageMaxEdge"]', text.maxEdge);
  setLabelText('[name="imageJpegQuality"]', text.jpegQuality);
  setLabelText('[name="systemPrompt"]', text.systemPrompt);
  document.querySelector(".settings-menu")?.setAttribute("aria-label", text.settingsMenu);
  document.querySelector("#fetch-models")?.setAttribute("title", text.fetchTitle);
  document.querySelector('[name="apiKey"]')?.setAttribute("placeholder", text.apiKeyPlaceholder);
  setOptionText('[name="textModel"]', "", text.modelPlaceholder);
  setOptionText('[name="thinkingFieldPreset"]', "auto", text.fieldAuto);
  setOptionText('[name="thinkingFieldPreset"]', "doubao", text.fieldDoubao);
  setOptionText('[name="thinkingFieldPreset"]', "custom", text.fieldCustom);
  setOptionText("#target-language-select", "Custom", text.targetCustom);
  setText("#model-config .section-note", text.thinkingFieldsNote);
  setText("#prompt-config .section-note", text.promptNote);
  setText("#keyboard-config .section-note", text.keyboardNote);
  setText("#config-backup .section-note", text.backupNote);
  setShortcutText(0, text.shortcutTranslateText, text.shortcutTranslateTextDesc);
  setShortcutText(1, text.shortcutScreenshot, text.shortcutScreenshotDesc);
  setShortcutText(2, text.shortcutPage, text.shortcutPageDesc);
  setShortcutText(3, text.shortcutSidePanel, text.shortcutSidePanelDesc);
  setText("#open-shortcuts", text.configureShortcuts);
  setText("#export-settings", text.exportSettings);
  setText("#import-settings", text.importSettings);
  setText("#restore-defaults", text.restoreDefaults);
}

function getUiMessage(key) {
  const language = resolveDisplayLanguage(displayLanguageSelect.value);
  return OPTIONS_UI_TEXT[language]?.[key] || OPTIONS_UI_TEXT.en[key] || "";
}

function formatUiMessage(key, ...values) {
  return values.reduce(
    (message, value, index) => message.replace(`{${index}}`, String(value)),
    getUiMessage(key)
  );
}

function resolveDisplayLanguage(value) {
  const normalized = normalizeDisplayLanguage(value);
  if (normalized === "zh-CN") return "zh-CN";
  if (normalized === "en") return "en";
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
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
  if (textNode) textNode.nodeValue = `${value}\n              `;
}

function setOptionText(selectSelector, optionValue, text) {
  const option = document.querySelector(`${selectSelector} option[value="${optionValue}"]`);
  if (option) option.textContent = text;
}

function setShortcutText(index, title, description) {
  const row = document.querySelectorAll(".shortcut-row")[index];
  if (!row) return;
  row.querySelector("strong").textContent = title;
  row.querySelector("span").textContent = description;
}
