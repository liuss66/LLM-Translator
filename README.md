# LLM Translator Chrome Extension

一个无构建步骤的 Chrome Manifest V3 扩展，用大模型完成网页/PDF 文本翻译、截图 OCR 翻译和当前页识别翻译。

## v0.6.5 更新亮点

- 为本地模型服务恢复最小本地主机权限：`http://127.0.0.1/*` 和 `http://localhost/*`。
- 继续避免 `<all_urls>`，不请求所有网站访问权限。

## v0.6.4 更新亮点

- 移除宽泛的 `<all_urls>` 主机权限和全站静态内容脚本声明，改为用户触发后通过 `activeTab` 动态注入。
- 降低 Chrome Web Store 深入审核风险，同时保留选中文本翻译、截图翻译、当前页翻译和侧边栏功能。

## v0.6.3 更新亮点

- 移除 Chrome Web Store 判定为冗余的 `tabs` 权限，保留现有 `activeTab`、`scripting` 和用户触发流程。
- 更新权限说明，避免商店审核误判为请求非必要权限。

## v0.6.2 更新亮点

- 侧边栏、主页和设置页的模型思考模式、主题色、语言和模型预设状态同步更稳定。
- 停止按钮现在会取消正在读取的流式响应，思考模式输出期间也能停止。
- 连续触发翻译/停止/再次翻译时，旧请求的流式片段或最终结果不会覆盖新结果。
- 侧边栏流式输出会自动跟随到底部；如果用户手动向上滚动查看内容，会暂停自动跟随。
- 设置页自动保存状态更清晰，显示 `Saving...` / `Saved` / `Save failed`。
- 新增共享设置模块和配置规范化测试，减少默认值、模型字段和 thinking 配置逻辑重复。

## v0.6.1 更新亮点

- 修复扩展重启后主页和侧边栏首次打开时主题色没有立即同步的问题。
- 主题色在 Options 调整时会单独保存，避免关闭页面过快导致颜色未落盘。

## v0.6.0 更新亮点

- 配置页改为左侧 Tab 导航，模型配置、应用配置、提示词、快捷键和配置备份分区展示。
- 设置项改为自动保存，系统提示词与模型预设解耦，并支持一键恢复默认提示词。
- 新增显示语言和主题色配置，Options、主页、侧边栏和悬浮窗统一同步主题色。
- 主页和侧边栏布局进一步压缩，压缩参数移入 Options，主页仅保留常用开关。
- 侧边栏参数区和提问区支持折叠，状态栏常驻；状态栏默认显示耗时和总 token，悬停显示 TTFT、TPS、上下行 token 和思考 token。

## 演示视频

<video src="assets/demo.mp4" controls muted playsinline></video>

[查看演示视频](assets/demo.mp4)

## 功能

- 右键翻译选中的文本。
- 快捷键 `Alt+T` 翻译当前选中文本。
- 快捷键 `Alt+S` 或弹窗按钮进入截图框选模式。
- 快捷键 `Alt+A` 或 `Page` 按钮翻译当前可见页，适合 PDF 当前页和扫描件。
- 将截图区域或当前页发送给 OpenAI-compatible 多模态模型，先识别文字再翻译。
- 支持流式输出、耗时显示、token 统计和悬停展开的性能指标。
- 支持 OpenAI-compatible、Anthropic API 与本地 llama.cpp server。
- 翻译结果支持 Markdown 展示。
- 支持 Markdown 中的行内公式 `$...$`、`\(...\)` 和公式块 `$$...$$`、`\[...\]` 展示。
- 支持自定义 API Base URL、API Key、模型、目标语言、显示语言和主题色；同一个模型字段用于文本翻译、截图 OCR 和当前页识别。
- 支持开关控制 OCR 原文、输入图片显示、截图压缩、当前页边距裁剪和思考模式。
- 支持配置图片压缩参数：最大边长和 JPEG 质量。
- 支持模型预设切换，切换前会测试模型连通性。
- 支持模型列表获取和模型连通性测试按钮；llama.cpp server 可留空模型字段。
- 支持常驻 Chrome 侧边栏；侧边栏开启后不再显示页面悬浮窗。
- 侧边栏将参数区、回复区、状态栏和提问框分区固定展示，参数区和提问区可折叠，截图翻译后可继续追问。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本仓库目录。
5. 打开扩展详情或右键扩展图标，进入“选项”，填写模型服务配置，并点击 `Test model` 验证。

## 使用

- 网页文字：选中文本后右键选择 `Translate selected text`，或按 `Alt+T`。
- Chrome PDF 查看器：选中 PDF 中的文字后使用右键菜单；如果浏览器没有把 PDF 选区暴露给扩展，可使用截图框选模式或 `Page` 当前页翻译。
- 图像/PDF 扫描件：点击扩展图标中的 `Screenshot`，或按 `Alt+S`，拖拽框选要识别的区域。
- 当前页识别：点击 `Page`，或按 `Alt+A`，直接翻译当前可见页。默认会尝试裁掉阅读器左右空白，可用 `Crop` 开关关闭。
- 侧边栏：点击扩展弹窗中的 `Open side panel`，或使用快捷键 `Alt+Shift+Y`。截图翻译后可以在侧边栏底部继续提问。
- 快捷键：在选项页点击 `Keyboard shortcuts`，或打开 `chrome://extensions/shortcuts` 自定义。

## 主要开关

- `OCR`：截图翻译时同时显示 OCR 原文。
- `Image`：显示实际送入模型的输入图片。
- `Think`：控制是否向兼容模型请求思考模式；不同模型服务字段可能不同，可在选项页配置。
- `Crop`：当前页识别时裁掉阅读器左右空白。
- `Compress`：发送图片前按 Options 中的 `Max edge` 和 `JPEG quality` 参数压缩。

## 配置建议

- `Model` 字段会同时用于网页文字翻译、Screenshot 和 Page 模式；如果要使用截图/OCR 功能，请选择支持图片输入的多模态模型。
- OpenAI-compatible 服务通常填写 `/v1` 结尾的 Base URL。
- Anthropic 服务使用 `https://api.anthropic.com/v1`。
- 本地 llama.cpp server 可使用 `http://127.0.0.1:8080/v1`，API Key 和 `Model` 可以留空。`Model` 为空时插件不会发送 `model` 字段，由 llama.cpp server 使用启动时加载的模型。若希望插件开关能控制思考模式，建议启动 server 时使用 `--jinja --reasoning auto`，插件会通过 `chat_template_kwargs.enable_thinking` 传递开关；如果 server 已用 `--reasoning off` 或 `--reasoning on` 固定策略，单次 API 请求通常不能可靠覆盖该全局设置。`--reasoning-budget` 属于 server 侧预算参数，插件侧不默认发送。
- 思考模式不是所有模型都能控制：DeepSeek Reasoner 这类模型通常由模型名决定是否思考；OpenAI/OpenRouter 使用 `reasoning_effort` 或 `reasoning.*`；Anthropic 使用 `thinking.budget_tokens`；豆包/火山方舟使用 `thinking.type`。默认 `Field preset` 为 Auto，会根据 API Base URL、provider 和模型名推导字段；Custom 可手动填写字段路径覆盖自动结果。
- `Thinking effort` 用于支持 `reasoning_effort` / `reasoning.effort` 的服务，常见值为 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`，具体可用值取决于模型服务。
- `Thinking token budget` 用于支持 token 预算的服务，例如 Anthropic 的 `thinking.budget_tokens` 或 OpenRouter 的 `reasoning.max_tokens`。填 `0` 表示不发送预算字段。
- `Custom thinking fields` 只在 `Field preset` 选择 Custom 时生效，支持按行填写字段路径：`thinking.type` 会自动映射为 `enabled` / `disabled`，`reasoning_effort` 和 `reasoning.effort` 会使用 `Thinking effort`，`reasoning.max_tokens` 和 `thinking.budget_tokens` 会使用 `Thinking token budget`，其他字段按布尔值发送。Qwen / 本地兼容服务可使用 `enable_thinking`、`chat_template_kwargs.enable_thinking`、`extra_body.enable_thinking`、`extra_body.chat_template_kwargs.enable_thinking`。
- 如果模型仍然返回思考内容，插件会把 `<think>...</think>` 或 API 返回的 reasoning 字段放入默认折叠的 `Thinking` 区块，并在状态栏中用 `R:` 显示思考 token 估算。
- `Display language` 控制插件界面语言，`Theme color` 会同步到 Options、主页、侧边栏、悬浮窗和框选区域。

## Markdown 展示

翻译结果会渲染常见 Markdown/GFM 内容：

- 多级标题、段落、粗体、斜体、删除线和链接。
- 有序列表、无序列表、嵌套列表和 task list。
- 表格、分隔线、blockquote、上标、下标。
- 行内代码和 fenced code block。
- 常见语言代码块的本地轻量高亮，不依赖外部 CDN。
- KaTeX 公式：`$...$`、`\(...\)`、`$$...$$`、`\[...\]`。

## 权限说明

- `activeTab`：在用户触发翻译、截图或侧边栏操作时访问当前标签页。
- `contextMenus`：提供右键翻译入口。
- `clipboardRead` / `clipboardWrite`：在部分 PDF 文本选择读取失败时辅助获取选中文本，并提供复制按钮。
- `sidePanel`：显示常驻侧边栏。
- `scripting`：在用户触发翻译、截图或侧边栏操作后，向当前活动页面动态注入内容脚本，用于读取选中文本、框选区域和展示悬浮窗。
- `storage`：保存模型配置、界面开关和最近一次翻译结果。
- `http://127.0.0.1/*` / `http://localhost/*`：连接用户本机运行的 OpenAI-compatible 或 llama.cpp API 服务。

本扩展不再请求 `<all_urls>` 主机权限，也不再默认在所有网页上运行内容脚本；只有在用户明确触发翻译相关操作时，才通过 `activeTab` 获得当前标签页的临时访问能力。

## 排错

- 选中文本后仍提示没有文本：Chrome PDF 查看器有时不会把 PDF 选区暴露给扩展，改用 Screenshot 或 Page 模式。
- 截图翻译输出不完整：打开 `Image` 查看实际输入图片，必要时关闭 `Compress` 或调大 `Edge`。
- 当前页翻译带入左右空白：确认 `Crop` 已开启；如果页面背景或水印复杂，裁剪会保守跳过。
- 模型返回英文：优先检查目标语言设置；截图 OCR 场景会在提示词中要求先识别再翻译。
- `sidePanel.open()` 用户手势报错：通过扩展弹窗、右键菜单或快捷键打开侧边栏，避免页面脚本主动拉起。
- 401/403/429：检查 API Key、模型权限、额度和服务商限流。

## 开发验证

- 运行 `npm test` 检查 Markdown 渲染回归。
- 运行 `node --check src/background.js`、`node --check src/options.js`、`node --check src/sidepanel.js`、`node --check src/content.js`、`node --check src/markdown.js` 检查脚本语法。

## 接口要求

OpenAI-compatible 模式调用 `POST {baseUrl}/chat/completions`，请求格式兼容 OpenAI Chat Completions：

- 文本翻译使用普通 `user` 文本消息。
- 截图翻译使用 `image_url` data URL 作为多模态输入。

Anthropic 模式调用 `POST {baseUrl}/messages`，默认 `baseUrl` 是 `https://api.anthropic.com/v1`。切换到 Anthropic 时，选项页会填入 `claude-sonnet-4-20250514` 作为默认模型。由于插件在浏览器端直连 Anthropic API，请确认你接受 API Key 保存在 Chrome 同步存储中的风险。

llama.cpp server 模式调用 `POST {baseUrl}/chat/completions`，默认 `baseUrl` 是 `http://127.0.0.1:8080/v1`，API Key 可以留空。截图翻译需要你启动的 llama.cpp server 使用支持图像输入的多模态模型。

如果你的服务只支持其他协议，需要调整 `src/background.js` 中的 `callModel`。
