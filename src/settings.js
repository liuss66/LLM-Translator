(function initSharedSettings(global) {
  const DEFAULT_SETTINGS = Object.freeze({
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
  });

  const MODEL_SETTING_KEYS = Object.freeze([
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
  ]);

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

  function normalizeSettings(rawSettings = {}) {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(rawSettings && typeof rawSettings === "object" ? rawSettings : {})
    };
    settings.provider = ["openai", "anthropic", "llamacpp"].includes(settings.provider)
      ? settings.provider
      : DEFAULT_SETTINGS.provider;
    settings.apiBaseUrl = String(settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).trim().replace(/\/+$/, "");
    settings.apiKey = String(settings.apiKey || "");
    settings.textModel = String(settings.textModel || "");
    settings.visionModel = String(settings.visionModel || "");
    settings.targetLanguage = String(settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage).trim() || DEFAULT_SETTINGS.targetLanguage;
    settings.displayLanguage = normalizeDisplayLanguage(settings.displayLanguage);
    settings.themeColor = normalizeThemeColor(settings.themeColor);
    settings.showOcrResult = Boolean(settings.showOcrResult);
    settings.showInputImage = Boolean(settings.showInputImage);
    settings.compressInputImage = Boolean(settings.compressInputImage);
    settings.cropPageMargins = settings.cropPageMargins !== false;
    settings.imageMaxEdge = clampInteger(settings.imageMaxEdge, 320, 4096, DEFAULT_SETTINGS.imageMaxEdge);
    settings.imageJpegQuality = clampNumber(settings.imageJpegQuality, 0.5, 1, DEFAULT_SETTINGS.imageJpegQuality);
    settings.enableThinking = Boolean(settings.enableThinking);
    settings.thinkingEffort = normalizeThinkingEffort(settings.thinkingEffort);
    settings.thinkingBudgetTokens = clampInteger(settings.thinkingBudgetTokens, 0, 128000, DEFAULT_SETTINGS.thinkingBudgetTokens);
    settings.thinkingFieldPreset = normalizeThinkingFieldPreset(settings.thinkingFieldPreset);
    settings.thinkingRequestFields =
      typeof settings.thinkingRequestFields === "string"
        ? settings.thinkingRequestFields.trim()
        : DEFAULT_SETTINGS.thinkingRequestFields;
    settings.currentPresetId = String(settings.currentPresetId || "");
    settings.modelPresets = Array.isArray(settings.modelPresets) ? settings.modelPresets : [];
    settings.systemPrompt = String(settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt);
    return settings;
  }

  async function readStoredSettings(storageArea) {
    const stored = await storageArea.get(Object.keys(DEFAULT_SETTINGS));
    return normalizeSettings(stored);
  }

  function apiPermissionPattern(apiBaseUrl) {
    try {
      const url = new URL(apiBaseUrl);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "";
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return "";
    }
  }

  function pickModelSettings(source) {
    return Object.fromEntries(
      MODEL_SETTING_KEYS.map((key) => [key, source?.[key] ?? DEFAULT_SETTINGS[key]])
    );
  }

  global.LLMT_SETTINGS = Object.freeze({
    DEFAULT_SETTINGS,
    MODEL_SETTING_KEYS,
    clampInteger,
    clampNumber,
    normalizeDisplayLanguage,
    normalizeSettings,
    normalizeThemeColor,
    normalizeThinkingEffort,
    normalizeThinkingFieldPreset,
    apiPermissionPattern,
    pickModelSettings,
    readStoredSettings
  });
})(globalThis);
