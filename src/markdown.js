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
        const language = line.slice(3).trim();
        const code = [];
        index += 1;
        while (index < lines.length && !lines[index].startsWith("```")) {
          code.push(lines[index]);
          index += 1;
        }
        index += index < lines.length ? 1 : 0;
        blocks.push(
          `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(
            code.join("\n")
          )}</code></pre>`
        );
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
          index += 1;
        }
        blocks.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
          index += 1;
        }
        blocks.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
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
        !/^\s*[-*]\s+/.test(lines[index]) &&
        !/^\s*\d+\.\s+/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      blocks.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    }

    return blocks.join("");
  }

  function renderInline(value) {
    const mathTokens = [];
    const tokenized = String(value).replace(
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
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>'
      );

    mathTokens.forEach((math, index) => {
      html = html.replace(`@@LLMT_MATH_${index}@@`, math);
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

  globalThis.LLMTranslatorMarkdown = { renderMarkdown, escapeHtml };
})();
