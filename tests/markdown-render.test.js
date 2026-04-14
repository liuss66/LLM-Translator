const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "src", "markdown.js"), "utf8");
const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context);

const { renderMarkdown } = context.LLMTranslatorMarkdown;
const tests = [];

test("renders nested bullet lists", () => {
  const html = renderMarkdown(
    [
      "- Parent",
      "  - Child",
      "  - Another child",
      "- Sibling"
    ].join("\n")
  );
  assertIncludes(html, "<ul><li>Parent<ul><li>Child</li><li>Another child</li></ul></li><li>Sibling</li></ul>");
});

test("renders GFM task lists and strikethrough", () => {
  const html = renderMarkdown("- [x] done\n- [ ] todo\n- ~~old~~ new");
  assertIncludes(html, 'type="checkbox" disabled checked');
  assertIncludes(html, 'type="checkbox" disabled>');
  assertIncludes(html, "<del>old</del>");
});

test("renders pipe tables with alignment and escaped pipes", () => {
  const html = renderMarkdown("| A | B |\n| --- | ---: |\n| a\\|b | $\\alpha$ |");
  assertIncludes(html, "<table>");
  assertIncludes(html, "text-align: right");
  assertIncludes(html, "a|b");
  assertIncludes(html, "\\alpha");
});

test("renders horizontal rules and safe sup/sub tags", () => {
  const html = renderMarkdown("---\n\n<sup>6</sup> x <sub>i</sub>");
  assertIncludes(html, "<hr>");
  assertIncludes(html, "<sup>6</sup>");
  assertIncludes(html, "<sub>i</sub>");
});

test("escapes unsupported raw HTML", () => {
  const html = renderMarkdown("<script>alert(1)</script>");
  assertIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertNotIncludes(html, "<script>");
});

test("renders blockquotes recursively", () => {
  const html = renderMarkdown("> Quote\n> - item\n>   - child");
  assertIncludes(html, "<blockquote>");
  assertIncludes(html, "<p>Quote</p>");
  assertIncludes(html, "<ul><li>item<ul><li>child</li></ul></li></ul>");
});

test("autolinks bare URLs outside inline code", () => {
  const html = renderMarkdown("Read https://example.com/a?b=1 and `https://example.com/code`.");
  assertIncludes(html, '<a href="https://example.com/a?b=1" target="_blank" rel="noreferrer noopener">https://example.com/a?b=1</a>');
  assertIncludes(html, "<code>https://example.com/code</code>");
});

test("highlights fenced code blocks and keeps code escaped", () => {
  const html = renderMarkdown("```c\n#include <stdio.h>\nint main(void) { return 0; }\n```");
  assertIncludes(html, 'data-language="c"');
  assertIncludes(html, "llmt-token--keyword");
  assertIncludes(html, "&lt;stdio.h&gt;");
  assertNotIncludes(html, "<stdio.h>");
});

test("renders footnote references and definitions", () => {
  const html = renderMarkdown("Text with note[^a].\n\n[^a]: Footnote with **bold** text.");
  assertIncludes(html, '<sup class="llmt-footnote-ref" id="llmt-footnote-a-ref">');
  assertIncludes(html, '<section class="llmt-footnotes"><hr><ol>');
  assertIncludes(html, '<li id="llmt-footnote-a">Footnote with <strong>bold</strong> text.');
  assertNotIncludes(html, "[^a]:");
});

test("does not leak footnote state between renders", () => {
  renderMarkdown("First[^x].\n\n[^x]: one");
  const html = renderMarkdown("Second[^x].");
  assertIncludes(html, "Second[^x].");
  assertNotIncludes(html, "llmt-footnotes");
});

function test(name, run) {
  tests.push({ name, run });
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Expected output to include ${JSON.stringify(expected)}.\nActual: ${value}`);
  }
}

function assertNotIncludes(value, expected) {
  if (value.includes(expected)) {
    throw new Error(`Expected output not to include ${JSON.stringify(expected)}.\nActual: ${value}`);
  }
}

let failed = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`${tests.length} markdown render tests passed`);
}
