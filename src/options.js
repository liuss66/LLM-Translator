const DEFAULT_SETTINGS = {
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  textModel: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  targetLanguage: "中文",
  showOcrResult: false,
  enableThinking: false,
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
  "systemPrompt"
];

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const presetSelect = document.querySelector("#preset-select");
const presetName = document.querySelector("#preset-name");
let saveTimer;
let modelPresets = [];
let currentPresetId = "";
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
    ...pickModelSettings(preset),
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
}

function readFormSettings() {
  const data = new FormData(form);
  const settings = Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS)
      .filter(
        (key) =>
          key !== "showOcrResult" &&
          key !== "enableThinking" &&
          key !== "currentPresetId" &&
          key !== "modelPresets"
      )
      .map((key) => [key, String(data.get(key) || "").trim()])
  );
  settings.showOcrResult = form.elements.showOcrResult.checked;
  settings.enableThinking = form.elements.enableThinking.checked;
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

function pickModelSettings(source) {
  return Object.fromEntries(
    MODEL_SETTING_KEYS.map((key) => [key, source[key] ?? DEFAULT_SETTINGS[key]])
  );
}

function createPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPresetControl(target) {
  return target?.id === "preset-select" || target?.id === "preset-name";
}
