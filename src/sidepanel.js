const title = document.querySelector("#result-title");
const image = document.querySelector("#result-image");
const source = document.querySelector("#result-source");
const translation = document.querySelector("#result-translation");
const status = document.querySelector("#status");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const showOcrResult = document.querySelector("#show-ocr-result");
const enableThinking = document.querySelector("#enable-thinking");
const modelPreset = document.querySelector("#model-preset");
let chatHistory = [];
let hasScreenshotContext = false;

chrome.runtime.connect({ name: "sidepanel" });
setChatEnabled(false);
loadSettings();
loadLastResult();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "last-result-updated") {
    renderResult(message.result);
  }
});

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

document.querySelector("#translate-selection").addEventListener("click", async () => {
  await sendAction({ type: "translate-active-selection" }, "Translating selected text...");
});

document.querySelector("#translate-region").addEventListener("click", async () => {
  await sendAction({ type: "start-region-selection" }, "Select an area in the active tab.");
});

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
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
    status.textContent = "Run screenshot translation first.";
    return;
  }

  chatInput.value = "";
  const historyForRequest = chatHistory.slice();
  appendChatMessage("user", question);
  status.textContent = "Asking model...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ask-last-screenshot",
      question,
      history: historyForRequest
    });
    if (!response?.ok) throw new Error(response?.error || "Question failed.");
    appendChatMessage("assistant", response.answer || "");
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message || "Question failed.";
  }
});

async function loadLastResult() {
  const response = await chrome.runtime.sendMessage({ type: "get-last-result" });
  if (response?.result) {
    renderResult(response.result);
  }
}

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

async function sendAction(message, pendingText) {
  status.textContent = pendingText;
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Action failed.");
  } catch (error) {
    status.textContent = error.message || "Action failed.";
    return;
  }
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

function renderResult(result) {
  title.textContent = result?.title || "Translation";
  source.textContent = result?.source || "";
  translation.innerHTML = globalThis.LLMTranslatorMarkdown.renderMarkdown(result?.translation || "");

  image.innerHTML = "";
  hasScreenshotContext = Boolean(result?.imageUrl);
  setChatEnabled(hasScreenshotContext);

  if (result?.imageUrl) {
    const img = document.createElement("img");
    img.src = result.imageUrl;
    img.alt = "Selected region";
    image.append(img);
    chatHistory = [];
    chatLog.innerHTML = "";
    status.textContent = "You can ask follow-up questions about this screenshot.";
  } else {
    chatHistory = [];
    chatLog.innerHTML = "";
  }
}

function appendChatMessage(role, content) {
  chatHistory.push({ role, content });
  const message = document.createElement("article");
  message.className = `chat-message chat-message--${role}`;
  message.innerHTML = `
    <div class="chat-message__role">${role}</div>
    <div class="chat-message__content">${globalThis.LLMTranslatorMarkdown.renderMarkdown(
      content
    )}</div>
  `;
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setChatEnabled(enabled) {
  chatForm.setAttribute("aria-disabled", enabled ? "false" : "true");
  chatInput.disabled = !enabled;
  chatForm.querySelector("button").disabled = !enabled;
}
