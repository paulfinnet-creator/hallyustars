// Fails if a source file uses physical left/right Tailwind classes. Layout must
// use logical utilities (ms-, me-, ps-, pe-, start-, end-, text-start…) so
// Arabic (RTL) mirrors correctly. See CLAUDE.md › Internationalization.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

// Matches ml-4, -mr-2, md:pl-3, left-0, right-[2px], text-left, rounded-l-lg,
// border-r, scroll-ml-…, inside class strings.
const PHYSICAL =
  /(?<![\w-])(?:[a-z0-9]+:)*-?(?:m[lr]|p[lr]|scroll-[mp][lr]|left|right|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right)|rounded-[lr]|rounded-[tb][lr]|border-[lr])(?:-[^\s"'`]*)?(?![\w-])/g;

/** Only look inside string literals that plausibly hold class names. */
const CLASS_STRING = /(?:className|class)=\{?\s*(["'`])([\s\S]*?)\1|(?:clsx|cn|cva)\(([\s\S]*?)\)/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(tsx|jsx)$/.test(name)) yield path;
  }
}

const problems = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(CLASS_STRING)) {
    const classes = match[2] ?? match[3] ?? "";
    for (const hit of classes.matchAll(PHYSICAL)) {
      const line = text.slice(0, (match.index ?? 0) + classes.indexOf(hit[0])).split("\n").length;
      problems.push(`${relative(ROOT, file)}:${line}  "${hit[0]}"`);
    }
  }
}

if (problems.length > 0) {
  console.error("Physical left/right classes found; use logical ones (ms-/me-/ps-/pe-/start-/end-):");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("Logical-class check passed.");
