const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");
const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);

const {
  DEFAULT_SETTINGS,
  MODEL_SETTING_KEYS,
  normalizeSettings,
  normalizeThemeColor,
  normalizeThinkingEffort,
  pickModelSettings
} = context.LLMT_SETTINGS;

const tests = [];

test("normalizes invalid scalar settings to safe defaults", () => {
  const settings = normalizeSettings({
    provider: "bad-provider",
    displayLanguage: "fr",
    themeColor: "red",
    imageMaxEdge: 999999,
    imageJpegQuality: 2,
    thinkingEffort: "turbo",
    thinkingBudgetTokens: -5,
    thinkingFieldPreset: "unknown"
  });

  assertEqual(settings.provider, DEFAULT_SETTINGS.provider);
  assertEqual(settings.displayLanguage, DEFAULT_SETTINGS.displayLanguage);
  assertEqual(settings.themeColor, DEFAULT_SETTINGS.themeColor);
  assertEqual(settings.imageMaxEdge, 4096);
  assertEqual(settings.imageJpegQuality, 1);
  assertEqual(settings.thinkingEffort, DEFAULT_SETTINGS.thinkingEffort);
  assertEqual(settings.thinkingBudgetTokens, 0);
  assertEqual(settings.thinkingFieldPreset, DEFAULT_SETTINGS.thinkingFieldPreset);
});

test("keeps valid thinking and theme values", () => {
  assertEqual(normalizeThemeColor("#ABCDEF"), "#abcdef");
  assertEqual(normalizeThinkingEffort("HIGH"), "high");
});

test("picks only model preset fields", () => {
  const picked = pickModelSettings({
    provider: "anthropic",
    apiKey: "secret",
    textModel: "claude",
    targetLanguage: "English"
  });

  assertEqual(Object.keys(picked).length, MODEL_SETTING_KEYS.length);
  assertEqual(picked.provider, "anthropic");
  assertEqual(picked.apiKey, "secret");
  assertEqual(picked.textModel, "claude");
  assertEqual(picked.targetLanguage, undefined);
});

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`${tests.length} settings tests passed`);
}

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
