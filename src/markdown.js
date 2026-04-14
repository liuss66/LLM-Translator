(function () {
  function renderMarkdown(markdown) {
    const text = String(markdown || "");
    const blocks = [];
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const mathBlock = readMathBlock(lines, index);
      if (mathBlock) {
        blocks.push(
          `<div class="llmt-math llmt-math--block">${renderMathExpression(mathBlock.content, true)}</div>${
            mathBlock.trailing ? `<p>${renderInline(mathBlock.trailing)}</p>` : ""
          }`
        );
        index = mathBlock.nextIndex;
        continue;
      }

      if (line.startsWith("```")) {
        const language = normalizeCodeLanguage(line.slice(3).trim());
        const code = [];
        index += 1;
        while (index < lines.length && !lines[index].startsWith("```")) {
          code.push(lines[index]);
          index += 1;
        }
        index += index < lines.length ? 1 : 0;
        blocks.push(renderCodeBlock(code.join("\n"), language));
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (isHorizontalRule(line)) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      const tableBlock = readTableBlock(lines, index);
      if (tableBlock) {
        blocks.push(renderTable(tableBlock));
        index = tableBlock.nextIndex;
        continue;
      }

      const listBlock = readListBlock(lines, index);
      if (listBlock) {
        blocks.push(listBlock.html);
        index = listBlock.nextIndex;
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !lines[index].startsWith("```") &&
        !isMathBlockStart(lines[index]) &&
        !/^(#{1,6})\s+/.test(lines[index]) &&
        !isHorizontalRule(lines[index]) &&
        !readTableBlock(lines, index) &&
        !parseListMarker(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      blocks.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    }

    return blocks.join("");
  }

  function renderCodeBlock(code, language) {
    const highlighted = highlightCode(code, language);
    return `<pre class="llmt-code-block">${
      language ? `<span class="llmt-code-language">${escapeHtml(language)}</span>` : ""
    }<code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${highlighted}</code></pre>`;
  }

  function normalizeCodeLanguage(rawLanguage) {
    const language = String(rawLanguage || "").trim().split(/\s+/)[0].toLowerCase();
    const aliases = {
      javascript: "js",
      typescript: "ts",
      shell: "bash",
      sh: "bash",
      zsh: "bash",
      cxx: "cpp",
      "c++": "cpp",
      h: "c",
      hpp: "cpp",
      html: "markup",
      xml: "markup",
      svg: "markup",
      yml: "yaml"
    };
    return aliases[language] || language;
  }

  function highlightCode(code, language) {
    const value = String(code || "");
    if (language === "json") return highlightJson(value);
    if (language === "markup") return highlightMarkup(value);
    if (language === "css") return highlightCss(value);
    if (language === "python" || language === "py") return highlightLanguage(value, PYTHON_KEYWORDS);
    if (language === "bash") return highlightBash(value);
    if (language === "c" || language === "cpp" || language === "cc") return highlightCLike(value);
    if (language === "js" || language === "ts" || language === "jsx" || language === "tsx") {
      return highlightLanguage(value, JS_KEYWORDS);
    }
    return escapeHtml(value);
  }

  function highlightLanguage(code, keywords) {
    return highlightByRules(code, [
      { type: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/y },
      { type: "string", pattern: /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/y },
      { type: "number", pattern: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/y },
      { type: "keyword", pattern: new RegExp(`\\b(?:${keywords.join("|")})\\b`, "y") },
      { type: "function", pattern: /\b[A-Za-z_$][\w$]*(?=\s*\()/y }
    ]);
  }

  function highlightJson(code) {
    return highlightByRules(code, [
      { type: "key", pattern: /"([^"\\]|\\.)*"(?=\s*:)/y },
      { type: "string", pattern: /"([^"\\]|\\.)*"/y },
      { type: "number", pattern: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy },
      { type: "keyword", pattern: /\b(?:true|false|null)\b/y }
    ]);
  }

  function highlightCss(code) {
    return highlightByRules(code, [
      { type: "comment", pattern: /\/\*[\s\S]*?\*\//y },
      { type: "string", pattern: /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/y },
      { type: "keyword", pattern: /@[A-Za-z-]+/y },
      { type: "property", pattern: /[A-Za-z-]+(?=\s*:)/y },
      { type: "number", pattern: /#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b/y },
      { type: "function", pattern: /\b[A-Za-z-]+(?=\()/y }
    ]);
  }

  function highlightMarkup(code) {
    return highlightByRules(code, [
      { type: "comment", pattern: /<!--[\s\S]*?-->/y },
      { type: "keyword", pattern: /<\/?[A-Za-z][\w:-]*/y },
      { type: "property", pattern: /\s[A-Za-z_:][\w:.-]*(?=\=)/y },
      { type: "string", pattern: /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/y },
      { type: "keyword", pattern: /\/?>/y }
    ]);
  }

  function highlightBash(code) {
    return highlightByRules(code, [
      { type: "comment", pattern: /#[^\n]*/y },
      { type: "string", pattern: /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/y },
      { type: "keyword", pattern: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|export|local|return|set)\b/y },
      { type: "function", pattern: /\b(?:git|npm|pnpm|yarn|node|python|pip|curl|cd|mkdir|rm|cp|mv|echo|cat|grep|sed|awk)\b/y },
      { type: "number", pattern: /\B-\w+\b/y }
    ]);
  }

  function highlightCLike(code) {
    return highlightByRules(code, [
      { type: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
      { type: "keyword", pattern: /^\s*#[ \t]*(?:include|define|ifdef|ifndef|endif|if|elif|else|pragma|undef|error|warning)\b/my },
      { type: "string", pattern: /L?("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')/y },
      { type: "number", pattern: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*\b/y },
      { type: "keyword", pattern: new RegExp(`\\b(?:${C_KEYWORDS.join("|")})\\b`, "y") },
      { type: "function", pattern: /\b[A-Za-z_]\w*(?=\s*\()/y }
    ]);
  }

  function highlightByRules(code, rules) {
    let html = "";
    let index = 0;
    while (index < code.length) {
      const match = matchHighlightRule(code, index, rules);
      if (match) {
        html += `<span class="llmt-token llmt-token--${match.type}">${escapeHtml(match.text)}</span>`;
        index += match.text.length;
        continue;
      }
      html += escapeHtml(code[index]);
      index += 1;
    }
    return html;
  }

  function matchHighlightRule(code, index, rules) {
    for (const rule of rules) {
      rule.pattern.lastIndex = index;
      const match = rule.pattern.exec(code);
      if (match?.index === index && match[0]) {
        return { type: rule.type, text: match[0] };
      }
    }
    return null;
  }

  function isHorizontalRule(line) {
    return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(String(line || ""));
  }

  function readListBlock(lines, startIndex) {
    const marker = parseListMarker(lines[startIndex]);
    if (!marker) return null;
    return parseList(lines, startIndex, marker.indent, marker.type, marker.delimiter);
  }

  function parseList(lines, startIndex, baseIndent, type, delimiter) {
    const tagName = type === "ordered" ? "ol" : "ul";
    const items = [];
    let index = startIndex;
    let startNumber = null;

    while (index < lines.length) {
      const marker = parseListMarker(lines[index]);
      if (
        !marker ||
        marker.indent !== baseIndent ||
        marker.type !== type ||
        marker.delimiter !== delimiter
      ) {
        break;
      }

      if (startNumber === null && type === "ordered") {
        startNumber = marker.number;
      }

      const itemParts = [];
      const itemContent = renderListItemContent(marker.content);
      if (itemContent) itemParts.push(itemContent);
      index += 1;

      while (index < lines.length) {
        const nextLine = lines[index];
        if (!nextLine.trim()) {
          index += 1;
          if (itemParts.length > 0) itemParts.push("");
          continue;
        }

        const nextMarker = parseListMarker(nextLine);
        if (nextMarker) {
          if (nextMarker.indent > baseIndent) {
            const nested = parseList(
              lines,
              index,
              nextMarker.indent,
              nextMarker.type,
              nextMarker.delimiter
            );
            itemParts.push(nested.html);
            index = nested.nextIndex;
            continue;
          }
          break;
        }

        const nextIndent = countIndent(nextLine);
        if (nextIndent > baseIndent) {
          const continuation = stripIndent(nextLine, Math.min(nextIndent, baseIndent + 4)).trim();
          if (continuation) itemParts.push(renderInline(continuation));
          index += 1;
          continue;
        }
        break;
      }

      items.push(`<li>${joinListItemParts(itemParts)}</li>`);
    }

    const startAttr = type === "ordered" && startNumber && startNumber !== 1 ? ` start="${startNumber}"` : "";
    return {
      html: `<${tagName}${startAttr}>${items.join("")}</${tagName}>`,
      nextIndex: index
    };
  }

  function parseListMarker(line) {
    const match = /^([ \t]*)(?:(([-+*])|(\d{1,9})([.)]))[ \t]+)(.*)$/.exec(String(line || ""));
    if (!match) return null;
    const indent = countIndent(match[1]);
    const bullet = match[3];
    const number = match[4] ? Number.parseInt(match[4], 10) : null;
    const orderedDelimiter = match[5] || "";
    return {
      indent,
      type: bullet ? "bullet" : "ordered",
      delimiter: bullet || orderedDelimiter,
      number,
      content: match[6] || ""
    };
  }

  function renderListItemContent(content) {
    const task = /^\s*\[([ xX])\]\s+(.+)$/.exec(content);
    if (!task) return renderInline(content);
    const checked = task[1].toLowerCase() === "x";
    return `<input class="llmt-task-checkbox" type="checkbox" disabled${
      checked ? " checked" : ""
    }> ${renderInline(task[2])}`;
  }

  function joinListItemParts(parts) {
    return parts
      .filter((part, index, list) => part || (index > 0 && index < list.length - 1))
      .map((part) => part || "<br>")
      .join("");
  }

  function countIndent(line) {
    let indent = 0;
    for (const char of String(line || "")) {
      if (char === " ") indent += 1;
      else if (char === "\t") indent += 4;
      else break;
    }
    return indent;
  }

  function stripIndent(line, indent) {
    let removed = 0;
    let index = 0;
    const text = String(line || "");
    while (index < text.length && removed < indent) {
      if (text[index] === " ") {
        removed += 1;
        index += 1;
      } else if (text[index] === "\t") {
        removed += 4;
        index += 1;
      } else {
        break;
      }
    }
    return text.slice(index);
  }

  function readTableBlock(lines, startIndex) {
    if (startIndex + 1 >= lines.length) return null;

    const header = splitTableRow(lines[startIndex]);
    const alignments = parseTableSeparator(lines[startIndex + 1]);
    if (!header || !alignments || header.length < 1) return null;

    const rows = [];
    let index = startIndex + 2;
    while (index < lines.length && isTableDataLine(lines[index])) {
      rows.push(splitTableRow(lines[index]) || []);
      index += 1;
    }

    const columnCount = Math.max(header.length, alignments.length, ...rows.map((row) => row.length));
    return {
      header: normalizeTableCells(header, columnCount),
      alignments: normalizeTableCells(alignments, columnCount),
      rows: rows.map((row) => normalizeTableCells(row, columnCount)),
      nextIndex: index
    };
  }

  function renderTable(tableBlock) {
    const header = tableBlock.header
      .map((cell, index) => renderTableCell("th", cell, tableBlock.alignments[index]))
      .join("");
    const body = tableBlock.rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell, index) => renderTableCell("td", cell, tableBlock.alignments[index]))
            .join("")}</tr>`
      )
      .join("");

    return `<div class="llmt-table-wrap"><table><thead><tr>${header}</tr></thead>${
      body ? `<tbody>${body}</tbody>` : ""
    }</table></div>`;
  }

  function renderTableCell(tagName, value, alignment) {
    const alignStyle = alignment ? ` style="text-align: ${alignment}"` : "";
    return `<${tagName}${alignStyle}>${renderInline(value)}</${tagName}>`;
  }

  function parseTableSeparator(line) {
    const cells = splitTableRow(line);
    if (!cells || cells.length < 1) return null;

    const alignments = [];
    for (const cell of cells) {
      const marker = cell.trim();
      if (!/^:?-{3,}:?$/.test(marker)) return null;
      const left = marker.startsWith(":");
      const right = marker.endsWith(":");
      alignments.push(left && right ? "center" : right ? "right" : left ? "left" : "");
    }
    return alignments;
  }

  function splitTableRow(line) {
    let text = String(line || "").trim();
    if (!text.includes("|")) return null;
    if (text.startsWith("|")) text = text.slice(1);
    if (endsWithUnescapedPipe(text)) text = text.slice(0, -1);

    const cells = [];
    let current = "";
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\\") {
        const next = text[index + 1];
        if (next === "|") {
          current += "|";
          index += 1;
        } else {
          current += char;
        }
        continue;
      }
      if (char === "|") {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  }

  function endsWithUnescapedPipe(value) {
    if (!value.endsWith("|")) return false;
    let backslashes = 0;
    for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
      backslashes += 1;
    }
    return backslashes % 2 === 0;
  }

  function isTableDataLine(line) {
    const trimmed = String(line || "").trim();
    return Boolean(trimmed && trimmed.includes("|") && !parseTableSeparator(trimmed));
  }

  function normalizeTableCells(cells, columnCount) {
    const normalized = cells.slice(0, columnCount);
    while (normalized.length < columnCount) normalized.push("");
    return normalized;
  }

  function renderInline(value) {
    const htmlTokens = [];
    const withInlineHtml = String(value).replace(
      /<(sup|sub)>([\s\S]*?)<\/\1>/gi,
      (_match, tagName, content) => {
        const tag = tagName.toLowerCase();
        const token = `@@LLMT_HTML_${htmlTokens.length}@@`;
        htmlTokens.push(`<${tag}>${renderInline(content)}</${tag}>`);
        return token;
      }
    );

    const mathTokens = [];
    const tokenized = withInlineHtml.replace(
      /\\\((.+?)\\\)|(?<!\$)\$([^$\n]+?)\$(?!\$)/g,
      (_match, parenMath, dollarMath) => {
        const token = `@@LLMT_MATH_${mathTokens.length}@@`;
        mathTokens.push(
          `<span class="llmt-math llmt-math--inline">${renderMathExpression(
            parenMath || dollarMath
          )}</span>`
        );
        return token;
      }
    );

    let html = escapeHtml(tokenized)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>'
      );

    mathTokens.forEach((math, index) => {
      html = html.replace(`@@LLMT_MATH_${index}@@`, math);
    });

    htmlTokens.forEach((inlineHtml, index) => {
      html = html.replace(`@@LLMT_HTML_${index}@@`, inlineHtml);
    });

    return html;
  }

  function readMathBlock(lines, startIndex) {
    const trimmed = lines[startIndex].trim();
    const delimiter = trimmed.startsWith("$$") ? "$$" : trimmed.startsWith("\\[") ? "\\]" : null;
    if (!delimiter) return null;

    const openLength = delimiter === "$$" ? 2 : 2;
    const closing = delimiter;
    const firstContent = trimmed.slice(openLength);
    const sameLineEnd = firstContent.indexOf(closing);
    if (sameLineEnd >= 0 && sameLineEnd < firstContent.length) {
      return {
        content: firstContent.slice(0, sameLineEnd).trim(),
        trailing: firstContent.slice(sameLineEnd + closing.length).trim(),
        nextIndex: startIndex + 1
      };
    }

    const content = [firstContent];
    let index = startIndex + 1;
    while (index < lines.length) {
      const line = lines[index];
      const endIndex = line.indexOf(closing);
      if (endIndex >= 0) {
        content.push(line.slice(0, endIndex));
        return {
          content: content.join("\n").trim(),
          trailing: line.slice(endIndex + closing.length).trim(),
          nextIndex: index + 1
        };
      }
      content.push(line);
      index += 1;
    }

    return {
      content: content.join("\n").trim(),
      trailing: "",
      nextIndex: index
    };
  }

  function isMathBlockStart(line) {
    const trimmed = line.trim();
    return trimmed.startsWith("$$") || trimmed.startsWith("\\[");
  }

  function renderMathExpression(value, displayBlock = false) {
    const tex = String(value || "").trim();
    if (globalThis.katex?.renderToString) {
      return globalThis.katex.renderToString(tex, {
        displayMode: displayBlock,
        throwOnError: false,
        strict: false,
        trust: false,
        output: "html"
      });
    }
    return escapeHtml(tex);
  }

  function replaceCommonMathSymbols(value) {
    const symbols = {
      "\\alpha": "α",
      "\\beta": "β",
      "\\gamma": "γ",
      "\\delta": "δ",
      "\\epsilon": "ε",
      "\\theta": "θ",
      "\\lambda": "λ",
      "\\mu": "μ",
      "\\pi": "π",
      "\\sigma": "σ",
      "\\phi": "φ",
      "\\omega": "ω",
      "\\Gamma": "Γ",
      "\\Delta": "Δ",
      "\\Theta": "Θ",
      "\\Lambda": "Λ",
      "\\Pi": "Π",
      "\\Sigma": "Σ",
      "\\Phi": "Φ",
      "\\Omega": "Ω",
      "\\times": "×",
      "\\cdot": "·",
      "\\pm": "±",
      "\\leq": "≤",
      "\\geq": "≥",
      "\\neq": "≠",
      "\\approx": "≈",
      "\\infty": "∞",
      "\\sum": "∑",
      "\\prod": "∏",
      "\\int": "∫",
      "\\partial": "∂",
      "\\nabla": "∇",
      "\\rightarrow": "→",
      "\\leftarrow": "←",
      "\\Rightarrow": "⇒",
      "\\Leftarrow": "⇐"
    };

    return Object.entries(symbols).reduce(
      (result, [command, symbol]) => result.replaceAll(command, symbol),
      value
    );
  }

  class TexParser {
    constructor(input) {
      this.input = input
        .replace(/\\left/g, "")
        .replace(/\\right/g, "");
      this.index = 0;
    }

    parse(stopChar = "") {
      const nodes = [];
      while (this.index < this.input.length) {
        if (stopChar && this.input[this.index] === stopChar) break;
        if (this.input.startsWith("\\frac", this.index)) {
          nodes.push(this.parseFraction());
          continue;
        }
        if (this.input.startsWith("\\sqrt", this.index)) {
          nodes.push(this.parseSqrt());
          continue;
        }

        const base = this.parseAtom();
        if (!base) continue;
        nodes.push(this.parseScripts(base));
      }
      return nodes.join("");
    }

    parseFraction() {
      this.index += "\\frac".length;
      const numerator = this.parseGroup();
      const denominator = this.parseGroup();
      return `<mfrac>${wrapRow(numerator)}${wrapRow(denominator)}</mfrac>`;
    }

    parseSqrt() {
      this.index += "\\sqrt".length;
      return `<msqrt>${wrapRow(this.parseGroup())}</msqrt>`;
    }

    parseScripts(base) {
      let node = base;
      let sub = "";
      let sup = "";

      while (this.input[this.index] === "_" || this.input[this.index] === "^") {
        const marker = this.input[this.index];
        this.index += 1;
        const value = this.parseScriptValue();
        if (marker === "_") sub = value;
        if (marker === "^") sup = value;
      }

      if (sub && sup) return `<msubsup>${node}${wrapRow(sub)}${wrapRow(sup)}</msubsup>`;
      if (sub) return `<msub>${node}${wrapRow(sub)}</msub>`;
      if (sup) return `<msup>${node}${wrapRow(sup)}</msup>`;
      return node;
    }

    parseScriptValue() {
      if (this.input[this.index] === "{") return this.parseGroup();
      return this.parseAtom();
    }

    parseGroup() {
      this.skipSpaces();
      if (this.input[this.index] === "\\") {
        const next = this.input[this.index + 1];
        if (next === "{" || next === "}") {
          this.index += 2;
          return next === "{" ? this.parse("\\}") : "";
        }
      }
      if (this.input[this.index] !== "{") return this.parseAtom();
      this.index += 1;
      const content = this.parse("}");
      if (this.input[this.index] === "}") this.index += 1;
      return content;
    }

    parseAtom() {
      this.skipSpaces();
      const char = this.input[this.index];
      if (!char) return "";

      if (char === "{") {
        return this.parseGroup();
      }

      if (char === "\\") {
        const escaped = this.input[this.index + 1];
        if (escaped === "{" || escaped === "}") {
          this.index += 2;
          return `<mo>${escaped}</mo>`;
        }
        if (escaped === "," || escaped === ";" || escaped === ":") {
          this.index += 2;
          return mathSpacing(`\\${escaped}`);
        }
        const command = this.readCommand();
        const spacing = mathSpacing(command);
        if (spacing) {
          return spacing;
        }
        if (command === "\\exp") {
          return `<mi mathvariant="normal">exp</mi>`;
        }
        const symbol = mathSymbol(command);
        if (symbol) {
          return symbol.operator
            ? `<mo>${escapeHtml(symbol.value)}</mo>`
            : `<mi>${escapeHtml(symbol.value)}</mi>`;
        }
        return `<mi>${escapeHtml(command.replace(/^\\/, ""))}</mi>`;
      }

      if (/[A-Za-z]/.test(char)) {
        this.index += 1;
        return `<mi>${escapeHtml(char)}</mi>`;
      }

      if (/[0-9.]/.test(char)) {
        return `<mn>${escapeHtml(this.readWhile(/[0-9.]/))}</mn>`;
      }

      this.index += 1;
      if (/[+\-*/=(),[\]|<>']/.test(char)) {
        return `<mo>${escapeHtml(normalizeOperator(char))}</mo>`;
      }
      return `<mtext>${escapeHtml(char)}</mtext>`;
    }

    readCommand() {
      const start = this.index;
      this.index += 1;
      while (/[A-Za-z]/.test(this.input[this.index] || "")) {
        this.index += 1;
      }
      return this.input.slice(start, this.index);
    }

    readWhile(pattern) {
      const start = this.index;
      while (pattern.test(this.input[this.index] || "")) {
        this.index += 1;
      }
      return this.input.slice(start, this.index);
    }

    skipSpaces() {
      while (/\s/.test(this.input[this.index] || "")) {
        this.index += 1;
      }
    }
  }

  function wrapRow(content) {
    return `<mrow>${content}</mrow>`;
  }

  function mathSymbol(command) {
    const symbol = replaceCommonMathSymbols(command);
    if (symbol === command) return null;
    return {
      value: symbol,
      operator: /^(\\times|\\cdot|\\pm|\\leq|\\geq|\\neq|\\approx|\\sum|\\prod|\\int|\\partial|\\nabla|\\rightarrow|\\leftarrow|\\Rightarrow|\\Leftarrow)$/.test(command)
    };
  }

  function mathSpacing(command) {
    const spaces = {
      "\\,": "0.167em",
      "\\;": "0.278em",
      "\\:": "0.222em",
      "\\quad": "1em",
      "\\qquad": "2em"
    };
    return spaces[command] ? `<mspace width="${spaces[command]}"></mspace>` : "";
  }

  function normalizeOperator(operator) {
    if (operator === "*") return "×";
    if (operator === "-") return "−";
    return operator;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const JS_KEYWORDS = [
    "await",
    "async",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "of",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "yield"
  ];

  const PYTHON_KEYWORDS = [
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "False",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "None",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "True",
    "try",
    "while",
    "with",
    "yield"
  ];

  const C_KEYWORDS = [
    "_Alignas",
    "_Alignof",
    "_Atomic",
    "_Bool",
    "_Complex",
    "_Generic",
    "_Imaginary",
    "_Noreturn",
    "_Static_assert",
    "_Thread_local",
    "alignas",
    "alignof",
    "asm",
    "auto",
    "bool",
    "break",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "constexpr",
    "const_cast",
    "continue",
    "decltype",
    "default",
    "delete",
    "do",
    "double",
    "dynamic_cast",
    "else",
    "enum",
    "explicit",
    "export",
    "extern",
    "false",
    "float",
    "for",
    "friend",
    "goto",
    "if",
    "inline",
    "int",
    "long",
    "mutable",
    "namespace",
    "new",
    "noexcept",
    "nullptr",
    "operator",
    "private",
    "protected",
    "public",
    "register",
    "reinterpret_cast",
    "restrict",
    "return",
    "short",
    "signed",
    "sizeof",
    "static",
    "static_assert",
    "static_cast",
    "struct",
    "switch",
    "template",
    "this",
    "thread_local",
    "throw",
    "true",
    "try",
    "typedef",
    "typename",
    "union",
    "unsigned",
    "using",
    "virtual",
    "void",
    "volatile",
    "while"
  ];

  globalThis.LLMTranslatorMarkdown = { renderMarkdown, escapeHtml };
})();
