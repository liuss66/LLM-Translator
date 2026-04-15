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
  thinkingRequestFields: "thinking.type\nenable_thinking\nchat_template_kwargs.enable_thinking",
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
  "thinkingEffort",
  "thinkingBudgetTokens",
  "thinkingRequestFields",
  "systemPrompt"
];

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const presetSelect = document.querySelector("#preset-select");
const presetName = document.querySelector("#preset-name");
const importSettingsFile = document.querySelector("#import-settings-file");
const providerTemplate = document.querySelector("#provider-template");
const providerTemplateSummary = document.querySelector("#provider-template-summary");
const targetLanguageSelect = document.querySelector("#target-language-select");
const targetLanguageCustom = document.querySelector("#target-language-custom");
let saveTimer;
let modelPresets = [];
let currentPresetId = "";
const EXPORT_VERSION = 1;
const IMPORTABLE_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "apiKey");
const TARGET_LANGUAGE_OPTIONS = Array.from(targetLanguageSelect.options)
  .map((option) => option.value)
  .filter((value) => value !== "Custom");
const providerDefaults = {
  openai: {
    apiBaseUrl: "https://api.openai.com/v1",
    textModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini"
  },
  anthropic: {
    apiBaseUrl: "https://api.anthropic.com/v1",
    textModel: "claude-sonnet-4-20250514",
    visionModel: "claude-sonnet-4-20250514"
  },
  llamacpp: {
    apiBaseUrl: "http://127.0.0.1:8080/v1",
    textModel: "local-model",
    visionModel: "local-model"
  }
};
const PROVIDER_TEMPLATES = [
  {
    id: "openai",
    name: "OpenAI",
    provider: "openai",
    apiBaseUrl: "https://api.openai.com/v1",
    textModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: ""
  },
  {
    id: "openai-reasoning",
    name: "OpenAI Reasoning-compatible",
    provider: "openai",
    apiBaseUrl: "https://api.openai.com/v1",
    textModel: "gpt-5-mini",
    visionModel: "gpt-5-mini",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: "reasoning_effort"
  },
  {
    id: "anthropic",
    name: "Anthropic",
    provider: "anthropic",
    apiBaseUrl: "https://api.anthropic.com/v1",
    textModel: "claude-sonnet-4-20250514",
    visionModel: "claude-sonnet-4-20250514",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 1024,
    thinkingRequestFields: ""
  },
  {
    id: "volcengine",
    name: "VolcEngine Ark / Doubao",
    provider: "openai",
    apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    textModel: "doubao-seed-1-6-250615",
    visionModel: "doubao-seed-1-6-vision-250615",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: "thinking.type"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    provider: "openai",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    textModel: "openai/gpt-4o-mini",
    visionModel: "openai/gpt-4o-mini",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: "reasoning.enabled\nreasoning.effort\nreasoning.max_tokens"
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "openai",
    apiBaseUrl: "https://api.deepseek.com/v1",
    textModel: "deepseek-chat",
    visionModel: "deepseek-chat",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: ""
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    provider: "openai",
    apiBaseUrl: "https://api.deepseek.com/v1",
    textModel: "deepseek-reasoner",
    visionModel: "deepseek-reasoner",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: ""
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    provider: "openai",
    apiBaseUrl: "https://api.siliconflow.cn/v1",
    textModel: "Qwen/Qwen2.5-7B-Instruct",
    visionModel: "Qwen/Qwen2.5-VL-7B-Instruct",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: "enable_thinking\nchat_template_kwargs.enable_thinking"
  },
  {
    id: "ollama",
    name: "Ollama OpenAI-compatible",
    provider: "openai",
    apiBaseUrl: "http://127.0.0.1:11434/v1",
    textModel: "qwen2.5",
    visionModel: "llava",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: ""
  },
  {
    id: "llamacpp",
    name: "llama.cpp server",
    provider: "llamacpp",
    apiBaseUrl: "http://127.0.0.1:8080/v1",
    textModel: "local-model",
    visionModel: "local-model",
    enableThinking: false,
    thinkingEffort: "medium",
    thinkingBudgetTokens: 0,
    thinkingRequestFields: "chat_template_kwargs.enable_thinking"
  }
];

renderProviderTemplates();
loadSettings();

form.elements.provider.addEventListener("change", async () => {
  currentPresetId = "";
  const defaults = providerDefaults[form.elements.provider.value];
  form.elements.apiBaseUrl.value = defaults.apiBaseUrl;
  form.elements.textModel.value = defaults.textModel;
  form.elements.visionModel.value = defaults.visionModel;
  await saveSettings("Provider saved.");
});

form.addEventListener("change", async (event) => {
  if (isPresetControl(event.target)) return;
  if (MODEL_SETTING_KEYS.includes(event.target.name)) {
    currentPresetId = "";
  }
  await saveSettings("Saved.");
});

form.addEventListener("input", (event) => {
  if (isPresetControl(event.target)) return;
  if (MODEL_SETTING_KEYS.includes(event.target.name)) {
    currentPresetId = "";
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSettings("Saved.");
  }, 450);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings("Saved.");
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

providerTemplate.addEventListener("change", () => {
  const template = getSelectedProviderTemplate();
  providerTemplateSummary.value = template
    ? `${template.provider} · ${template.apiBaseUrl} · ${template.textModel}`
    : "Provider, base URL, models, thinking fields";
});

targetLanguageSelect.addEventListener("change", async () => {
  syncTargetLanguageCustom();
  currentPresetId = "";
  await saveSettings("Saved.");
});

document.querySelector("#apply-provider-template").addEventListener("click", async () => {
  const template = getSelectedProviderTemplate();
  if (!template) {
    status.textContent = "Choose a provider template first.";
    return;
  }
  currentPresetId = "";
  applyProviderTemplate(template);
  await saveSettings(`${template.name} template applied. API Key was unchanged.`);
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
  const preset = modelPresets.find((item) => item.id === presetSelect.value);
  presetName.value = preset?.name || "";
});

document.querySelector("#save-preset").addEventListener("click", async () => {
  const existingId = presetSelect.value;
  const id = existingId || createPresetId();
  const name = presetName.value.trim() || form.elements.textModel.value.trim() || "Unnamed";
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
  status.textContent = "Preset saved.";
});

document.querySelector("#load-preset").addEventListener("click", async () => {
  const preset = modelPresets.find((item) => item.id === presetSelect.value);
  if (!preset) {
    status.textContent = "Select a preset first.";
    return;
  }
  fillForm({
    ...readFormSettings(),
    ...pickPresetSettingsForLoad(preset),
    currentPresetId: preset.id,
    modelPresets
  });
  currentPresetId = preset.id;
  await saveSettings("Preset loaded.");
});

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
  currentPresetId = settings.currentPresetId || "";
  renderPresetOptions();
  presetSelect.value = currentPresetId;
  presetName.value = modelPresets.find((item) => item.id === currentPresetId)?.name || "";
  fillForm(settings);
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements[key];
    if (field?.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (field) {
      field.value = value;
    }
  }
  setTargetLanguageValue(settings.targetLanguage);
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
      .map((key) => [key, String(data.get(key) || "").trim()])
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
  settings.targetLanguage = readTargetLanguage();
  settings.currentPresetId = currentPresetId;
  settings.modelPresets = modelPresets;
  return settings;
}

async function saveSettings(message) {
  await chrome.storage.sync.set(readFormSettings());
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1600);
}

function renderPresetOptions() {
  presetSelect.innerHTML = '<option value="">No preset</option>';
  modelPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name || preset.textModel || "Unnamed";
    presetSelect.append(option);
  });
}

function renderProviderTemplates() {
  providerTemplate.innerHTML = '<option value="">Choose a provider template</option>';
  PROVIDER_TEMPLATES.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    providerTemplate.append(option);
  });
}

function getSelectedProviderTemplate() {
  return PROVIDER_TEMPLATES.find((template) => template.id === providerTemplate.value);
}

function applyProviderTemplate(template) {
  form.elements.provider.value = template.provider;
  form.elements.apiBaseUrl.value = template.apiBaseUrl;
  form.elements.textModel.value = template.textModel;
  form.elements.visionModel.value = template.visionModel;
  form.elements.enableThinking.checked = Boolean(template.enableThinking);
  form.elements.thinkingEffort.value = normalizeThinkingEffort(template.thinkingEffort);
  form.elements.thinkingBudgetTokens.value = clampInteger(template.thinkingBudgetTokens, 0, 128000, 0);
  form.elements.thinkingRequestFields.value = template.thinkingRequestFields || "";
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
