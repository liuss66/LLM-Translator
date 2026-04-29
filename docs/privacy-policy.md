# LLM Translator Privacy Policy

Last updated: 2026-04-29

This Privacy Policy explains how the LLM Translator Chrome extension ("LLM Translator", "the extension", "we") collects, uses, stores, and shares user data.

## Scope

This policy applies to the Chrome extension published as `LLM Translator`. The extension translates selected webpage text, screenshots, PDF pages, and user follow-up questions by sending user-provided content to a model service chosen and configured by the user.

## Summary

The extension does not operate its own cloud backend for translation requests. Instead, it sends user-selected content directly from the user's browser to the model API endpoint configured by the user, such as OpenAI-compatible services, Anthropic, OpenRouter, a self-hosted local service, or another custom endpoint chosen by the user.

## Data We Collect

The extension may collect and process the following categories of user data:

### 1. User content submitted for translation

This includes:

- Text the user selects on a webpage or in a PDF.
- Screenshot images or current-page images captured when the user uses Screenshot or Page translation features.
- OCR source text extracted by the model service from submitted images.
- Follow-up questions entered by the user in the side panel about a previous screenshot or translation result.
- Translation results and reasoning text returned by the selected model service.

This data is collected only when the user explicitly triggers a translation-related action.

### 2. Model service configuration data

This includes:

- API Base URL.
- API Key.
- Provider type.
- Model name and model preset settings.
- Thinking-related request settings.

This data is entered by the user in the extension options page.

### 3. Application preferences and usage state

This includes:

- Target language.
- Display language.
- Theme color.
- OCR display toggle.
- Input image display toggle.
- Image compression settings.
- Current-page crop setting.
- Saved model presets.
- Most recent translation result stored for display continuity inside the extension session.

### 4. Limited clipboard data

When webpage or PDF selection access fails, the extension may read clipboard text to help retrieve the text the user intended to translate. The extension may also write translated text to the clipboard when the user uses a copy action.

## How We Collect Data

The extension collects data from the following sources:

- Directly from user input in the options page, popup, and side panel.
- From the currently active tab when the user explicitly requests translation of selected text.
- From screenshots of the visible tab when the user explicitly requests screenshot or current-page translation.
- From the clipboard only when required for selection fallback or when the user copies output.
- From responses returned by the user-configured model service.

The extension does not continuously monitor browsing activity and does not automatically scrape page contents in the background.

## How We Use Data

We use collected data only to provide the extension's functionality:

- To send user-selected text or images to the user-configured model service for translation or OCR.
- To render translation results, OCR output, reasoning content, and performance metrics in the popup, floating panel, or side panel.
- To save user settings and presets so the extension works as configured across browser sessions.
- To remember the most recent translation result during the current extension session.
- To request optional host permission for the specific API host configured by the user when the user clicks `Fetch` or `Test model`.
- To validate model connectivity and fetch the list of available models from the configured service when the user requests those actions.

We do not use collected data for advertising, profiling, or sale to data brokers.

## How Data Is Shared

The extension shares user data only as needed to provide the feature requested by the user.

### 1. Shared with the user-configured model service

When the user triggers translation, OCR, or model testing features, the extension sends relevant data directly to the API endpoint configured by the user. Depending on the feature, shared data may include:

- Selected text.
- Screenshot or page image data.
- Follow-up chat questions.
- System prompt and request parameters.
- Model name and thinking configuration.
- Authentication headers such as the user's API key.

The identity of the recipient depends on the endpoint chosen by the user. This may be:

- A third-party API provider such as OpenAI, Anthropic, OpenRouter, or another compatible service.
- A self-hosted or local network model server operated by the user.
- A custom enterprise or private endpoint designated by the user.

The extension does not control how those external endpoints process data. Users should review the privacy terms of the service they configure.

### 2. Shared with Chrome storage provided by the user's browser

Settings and certain extension state are stored using Chrome extension storage APIs:

- `chrome.storage.sync` stores configuration and preferences, including API Base URL, API Key, model settings, and presets, so they can persist across browser sessions and may sync across the user's signed-in Chrome profile according to Chrome's own sync behavior.
- `chrome.storage.session` stores temporary in-session state such as whether the side panel is open and the latest translation result used for extension UI continuity.

### 3. No sale of personal data

We do not sell user data.

### 4. No advertising sharing

We do not share user data with advertisers, analytics networks, or data resellers.

## Data Storage and Retention

Data is stored as follows:

- Persistent settings and configuration remain in `chrome.storage.sync` until the user changes them, clears them, removes them, or uninstalls the extension.
- Temporary session state and the most recent translation result remain in `chrome.storage.session` until the browser session ends, the extension clears or replaces that state, or the extension is reloaded.
- Data sent to the user-configured external model service is retained by that service according to that service's own policies, which are outside our control.

## User Control and Choices

Users control what data is processed:

- Translation, screenshot capture, page capture, model testing, and model list fetching occur only after explicit user action.
- Users choose which API endpoint receives their data by configuring the API Base URL.
- Users may avoid sending data to third-party services by using a local or self-hosted model endpoint.
- Users may edit or remove settings in the extension options page.
- Users may remove the extension to stop all future data processing by the extension.

## Access, Correction, and Deletion

Users can:

- Edit saved settings at any time in the extension options page.
- Restore defaults from the options page, which clears saved API Key and presets from extension storage.
- Remove the extension to delete extension-managed local data from the browser, subject to browser behavior.
- Clear Chrome sync data through Chrome account and browser controls if they want to remove data synchronized by Chrome.

Because translation requests are sent directly to the user-configured external endpoint, deletion of data already sent to that endpoint must be requested from the operator of that endpoint.

## Security

We use Chrome extension storage APIs and Chrome permission controls to limit access. However:

- API keys stored in `chrome.storage.sync` may sync through the user's Chrome account if Chrome Sync is enabled.
- Data transmitted to user-configured external APIs is subject to the transport security and data handling practices of those endpoints.
- Users should only configure API endpoints they trust.

## Children's Privacy

The extension is not directed to children, and we do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy when the extension's data practices change. The updated version will be published at the same policy URL with a revised "Last updated" date.

## Contact

For privacy questions about this extension, use the contact method or repository listed on the extension's public listing or source repository.
