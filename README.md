# LLM Translator Chrome Extension

一个无构建步骤的 Chrome Manifest V3 扩展，用大模型完成网页/PDF 选中文本翻译，并支持框选当前页面区域后做图像识别与翻译。

## 功能

- 右键翻译选中的文本。
- 快捷键 `Alt+T` 翻译当前选中文本。
- 快捷键 `Alt+S` 或弹窗按钮进入截图框选模式。
- 将截图区域发送给 OpenAI-compatible 多模态模型，先识别文字再翻译。
- 支持 OpenAI-compatible、Anthropic API 与本地 llama.cpp server。
- 翻译结果支持 Markdown 展示。
- 支持 Markdown 中的行内公式 `$...$`、`\(...\)` 和公式块 `$$...$$`、`\[...\]` 展示。
- 支持自定义 API Base URL、API Key、文本模型、多模态模型、目标语言。
- 支持开关控制截图翻译是否显示 OCR 原文。
- 支持模型连通性测试按钮。
- 支持常驻 Chrome 侧边栏；侧边栏开启后不再显示页面悬浮窗。
- 支持截图翻译后的追问对话。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `G:\project\translate-plug`。
5. 打开扩展详情或右键扩展图标，进入“选项”，填写模型服务配置，并点击 `Test model` 验证。

## 使用

- 网页文字：选中文本后右键选择 `Translate selected text`，或按 `Alt+T`。
- Chrome PDF 查看器：选中 PDF 中的文字后使用右键菜单；如果浏览器没有把 PDF 选区暴露给扩展，可使用截图框选模式。
- 图像/PDF 扫描件：点击扩展图标中的 `Screenshot`，或按 `Alt+S`，拖拽框选要识别的区域。
- 侧边栏：点击扩展弹窗中的 `Open side panel`，或使用快捷键 `Alt+Shift+Y`。截图翻译后可以在侧边栏底部继续提问。
- 快捷键：在选项页点击 `Keyboard shortcuts`，或打开 `chrome://extensions/shortcuts` 自定义。

## 接口要求

OpenAI-compatible 模式调用 `POST {baseUrl}/chat/completions`，请求格式兼容 OpenAI Chat Completions：

- 文本翻译使用普通 `user` 文本消息。
- 截图翻译使用 `image_url` data URL 作为多模态输入。

Anthropic 模式调用 `POST {baseUrl}/messages`，默认 `baseUrl` 是 `https://api.anthropic.com/v1`。切换到 Anthropic 时，选项页会填入 `claude-sonnet-4-20250514` 作为默认模型。由于插件在浏览器端直连 Anthropic API，请确认你接受 API Key 保存在 Chrome 同步存储中的风险。

llama.cpp server 模式调用 `POST {baseUrl}/chat/completions`，默认 `baseUrl` 是 `http://127.0.0.1:8080/v1`，API Key 可以留空。截图翻译需要你启动的 llama.cpp server 使用支持图像输入的多模态模型。

如果你的服务只支持其他协议，需要调整 `src/background.js` 中的 `callModel`。
