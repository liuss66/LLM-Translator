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
  "thinkingRequestFields",
  "systemPrompt"
];

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const presetSelect = document.querySelector("#preset-select");
const presetName = document.querySelector("#preset-name");
const importSettingsFile = document.querySelector("#import-settings-file");
const targetLanguageSelect = document.querySelector("#target-language-select");
const targetLanguageCustom = document.querySelector("#target-language-custom");
const modelSelect = form.elements.textModel;
const modelInput = form.elements.textModelInput;
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
loadSettings();

form.addEventListener("change", async (event) => {
  if (isLoadingPreset) return;
  if (isPresetControl(event.target)) return;
  await saveSettings("Saved.");
});

form.addEventListener("input", (event) => {
  if (isLoadingPreset) return;
  if (isPresetControl(event.target)) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSettings("Saved.");
  }, 450);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const presetId = await saveCurrentModelPreset();
  await saveSettings(presetId ? "Settings and preset saved." : "Saved.");
});

form.elements.provider.addEventListener("change", () => {
  updateModelControlState();
});

document.querySelector("#fetch-models").addEventListener("click", async () => {
  const apiBaseUrl = form.elements.apiBaseUrl.value.trim();
  const apiKey = form.elements.apiKey.value.trim();
  if (!apiBaseUrl) {
    status.textContent = "Please enter API Base URL first.";
    return;
  }
  status.textContent = "Fetching models...";
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
      status.textContent = "No models returned from API.";
      return;
    }
    fetchedModels = models;
    populateModelSelect(models);
    status.textContent = `Found ${models.length} models.`;
    setTimeout(() => {
      if (status.textContent.startsWith("Found")) status.textContent = "";
    }, 2000);
  } catch (error) {
    status.textContent = `Fetch failed: ${error.message}`;
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

  if (savedModel && models.includes(savedModel)) {
    modelSelect.value = savedModel;
    modelInput.value = savedModel;
  }
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
  if (modelSelect.value) {
    modelInput.value = modelSelect.value;
  }
});

document.querySelector("#test-model").addEventListener("click", async () => {
  status.textContent = "Testing model...";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "test-model",
      settings: readFormSettings()
    });
    if (!response?.ok) throw new Error(response?.error || "Model test failed.");
    status.textContent = `Model test passed: ${response.result}`;
  } catch (error) {
    status.textContent = error.message || "Model test failed.";
  }
});

document.querySelector("#open-shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

targetLanguageSelect.addEventListener("change", async () => {
  syncTargetLanguageCustom();
  await saveSettings("Saved.");
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
    status.textContent = "Settings imported. API Key was unchanged.";
  } catch (error) {
    status.textContent = error.message || "Import failed.";
  }
});

document.querySelector("#restore-defaults").addEventListener("click", async () => {
  if (!confirm("Restore all settings to defaults? API Key and presets will be cleared.")) return;
  modelPresets = [];
  currentPresetId = "";
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS });
  renderPresetOptions();
  presetSelect.value = "";
  presetName.value = "";
  fillForm(DEFAULT_SETTINGS);
  status.textContent = "Defaults restored.";
});

presetSelect.addEventListener("change", () => {
  loadSelectedPreset();
});

document.querySelector("#save-preset").addEventListener("click", async () => {
  const presetId = await saveCurrentModelPreset();
  if (!presetId) {
    status.textContent = "Model preset needs a name or model.";
    return;
  }
  await saveSettings("Preset saved.");
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
  await saveSettings("Default prompt restored.");
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
    await saveSettings("Preset loaded.", { includePresetState: true });
  } finally {
    isLoadingPreset = false;
  }
}

document.querySelector("#delete-preset").addEventListener("click", async () => {
  const preset = modelPresets.find((item) => item.id === presetSelect.value);
  if (!preset) {
    status.textContent = "Select a preset first.";
    return;
  }
  modelPresets = modelPresets.filter((item) => item.id !== preset.id);
  currentPresetId = currentPresetId === preset.id ? "" : currentPresetId;
  await chrome.storage.sync.set({ modelPresets, currentPresetId });
  renderPresetOptions();
  presetName.value = "";
  status.textContent = "Preset deleted.";
});

async function loadSettings() {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
  };

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
          const value = !modelSelect.hidden ? data.get(key) : modelInput.value;
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
  settings.currentPresetId = currentPresetId;
  settings.modelPresets = modelPresets;
  return settings;
}

function readCurrentModelValue() {
  return String((modelSelect.hidden ? modelInput.value : modelSelect.value) || modelInput.value || "").trim();
}

function updateModelControlState() {
  const requireModel = form.elements.provider.value !== "llamacpp";
  modelSelect.required = requireModel && !modelSelect.hidden && !modelSelect.disabled;
  modelInput.required = requireModel && !modelInput.hidden && !modelInput.disabled;
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
  if (modelPresets.length === 0) {
    presetSelect.innerHTML = '<option value="">New Preset</option>';
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
  status.textContent = "Settings exported without API Key.";
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
