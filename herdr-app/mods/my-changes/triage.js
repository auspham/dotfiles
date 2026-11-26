// Review triage: which changed files deserve the closest read. Rules here are cheap and certain;
// the model's verdict (asked for elsewhere) adds a reason. Nothing is ever hidden, only ordered.

/** @typedef {"high" | "normal" | "skim"} Level */
/** @typedef {{ level: Level, text: string }} Flag */
/** @typedef {{ path: string, status: string, add: number, del: number, binary?: boolean }} ChangedFile */
/** @typedef {{ level: Level, reason: string, sig: string }} Verdict */

/** @type {Level[]} */
export const LEVELS = ["high", "normal", "skim"];
export const LEVEL_LABEL = { high: "Look closely", normal: "Normal", skim: "Skim" };
const RANK = { high: 2, normal: 1, skim: 0 };

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|Gemfile\.lock|composer\.lock|flake\.lock)$/;
const GENERATED = /(^|\/)(__snapshots__\/|dist\/|build\/|vendor\/|node_modules\/)|\.(snap|min\.js|min\.css|map)$|(_generated|\.generated|\.pb)\.\w+$/;
const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements[\w.-]*\.txt|setup\.py|setup\.cfg|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?)$/;
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|(^|\/)test_[^/]+\.py$|_test\.(py|go)$|\.(test|spec)\.[cm]?[jt]sx?$|_spec\.rb$/;
// Whole words of a path ("user_auth.py", "src/auth/"), so "author.md" or "tokenizer.py" stay out.
const SENSITIVE_WORD = /(?:^|[^a-z])(auth|authn|authz|authenticat\w*|authoriz\w*|oauth|login|sessions?|tokens?|secrets?|passwords?|passwd|crypto|encrypt\w*|decrypt\w*|permissions?|acl|security|payments?|billing|migrations?|schema)(?=[^a-z]|$)/i;
// Styles, docs and assets borrow these words for other things ("tokens.css" holds design tokens).
const NOT_LOGIC = /\.(css|scss|sass|less|md|mdx|rst|txt|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i;
const SENSITIVE_FILE = /\.sql$|(^|\/)Dockerfile|docker-compose|\.github\/workflows\/|\.gitlab-ci|(^|\/)\.env/;
const CODE = /\.(py|[cm]?[jt]sx?|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|ex|exs|lua|sh|bash|zsh)$/;

const ASSERTION = /\b(assert\w*|expect|should|t\.(Error|Errorf|Fatal|Fatalf)|pytest\.raises|toBe\w*|toEqual|toThrow\w*|toMatch\w*)\b/;
const SKIPPED = /@pytest\.mark\.(skip|xfail)|pytest\.skip\(|\b(it|test|describe)\.(skip|only|todo)\b|\bx(it|describe|test)\(|#\[ignore\]|\bt\.Skip(Now)?\(|@unittest\.skip|@Disabled\b/;
const SILENCERS = [
  [/^\s*except\s*:/, "a bare except"],
  [/^\s*except\s+(Base)?Exception\b[^:]*:\s*(pass)?\s*$/, "a catch-all except"],
  [/catch\s*(\([^)]*\))?\s*\{\s*\}/, "an empty catch"],
  [/#\s*type:\s*ignore|@ts-ignore|@ts-expect-error|\bas any\b/, "a type check switched off"],
  [/eslint-disable|#\s*noqa|\/\/\s*nolint|#\[allow\(|#\s*pragma:\s*no cover/, "a linter switched off"],
  [/\b_\s*=\s*err\b|\.unwrap_or_default\(\)/, "an ignored error"],
  [/\|\|\s*true\b/, "an ignored failure (|| true)"],
];
const DEPENDENCY = [
  /^\s*"(@?[\w.-]+(\/[\w.-]+)?)"\s*:\s*"[\^~>=<*]?\s*\d/,
  /^\s*"?([A-Za-z][\w.-]*)\s*(\[[\w,]+\])?\s*[<>=~!]=?\s*\d/,
  /^\s*([A-Za-z][\w-]*)\s*=\s*(\{|"[\^~>=<*]?\d)/,
  /^\s*(?:require\s+)?([\w.-]+\.[a-z]{2,}\/[\w./-]+)\s+v\d/,
];

export const isTest = (path) => TEST_FILE.test(path);
export const isCode = (path) => CODE.test(path) && !isTest(path);

/** What the path alone says. @param {ChangedFile} f @returns {Flag[]} */
export function pathFlags(f) {
  if (LOCKFILE.test(f.path)) return [{ level: "skim", text: "lockfile" }];
  if (GENERATED.test(f.path)) return [{ level: "skim", text: "generated or vendored" }];
  if (f.binary) return [{ level: "skim", text: "binary file" }];
  const flags = [];
  if (isTest(f.path) && f.status === "D") flags.push({ level: "high", text: "deletes a test file" });
  const word = NOT_LOGIC.test(f.path) ? undefined : SENSITIVE_WORD.exec(f.path)?.[1], file = SENSITIVE_FILE.test(f.path);
  if (word || file) flags.push({ level: "high", text: word ? `sensitive area (${word.toLowerCase()})` : "build, deploy or database file" });
  if (MANIFEST.test(f.path)) flags.push({ level: "normal", text: "dependency manifest" });
  return flags;
}

/** What the changed lines say. @param {ChangedFile} f @param {string} diff unified diff of this file @param {boolean} withCode the code it tests changed too @returns {Flag[]} */
export function diffFlags(f, diff, withCode) {
  const added = [], removed = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line[0] === "+") added.push(line.slice(1));
    else if (line[0] === "-") removed.push(line.slice(1));
  }
  const flags = [];
  if (isTest(f.path)) {
    const lost = removed.filter((l) => ASSERTION.test(l)).length - added.filter((l) => ASSERTION.test(l)).length;
    if (lost > 0) flags.push({ level: "high", text: `removes ${lost} assertion${lost === 1 ? "" : "s"}` });
    if (added.some((l) => SKIPPED.test(l))) flags.push({ level: "high", text: "skips or narrows tests" });
    if (withCode && removed.length > 0 && lost <= 0) flags.push({ level: "normal", text: "existing test edited along with its code" });
  }
  const silenced = new Set(added.flatMap((l) => SILENCERS.filter(([re]) => re.test(l)).map(([, what]) => what)));
  for (const what of silenced) flags.push({ level: "high", text: `adds ${what}` });
  if (MANIFEST.test(f.path)) {
    const before = new Set(removed.map(dependencyName).filter(Boolean));
    const fresh = [...new Set(added.map(dependencyName).filter((n) => n && !before.has(n)))];
    if (fresh.length) flags.push({ level: "high", text: `adds dependenc${fresh.length === 1 ? "y" : "ies"}: ${fresh.slice(0, 3).join(", ")}${fresh.length > 3 ? "…" : ""}` });
  }
  return flags;
}

// Manifest keys that look like a pinned package but describe the project itself.
const NOT_DEPENDENCY = new Set(["name", "version", "description", "license", "main", "type", "node", "npm", "pnpm", "yarn", "bun", "python", "requires-python", "edition", "rust-version", "go", "packageManager"]);

function dependencyName(line) {
  for (const re of DEPENDENCY) { const m = re.exec(line); if (m) return NOT_DEPENDENCY.has(m[1]) ? null : m[1]; }
  return null;
}

/** Whether a test file's subject changed in the same diff: a code file whose name stem the test's name contains. */
export function testsChangedCode(testPath, files) {
  const stem = testPath.split("/").pop().replace(/\.(test|spec)(?=\.)/, "").replace(/^test_|_test(?=\.)|_spec(?=\.)/g, "").replace(/\.\w+$/, "");
  return stem.length > 1 && files.some((f) => isCode(f.path) && f.path.split("/").pop().replace(/\.\w+$/, "") === stem);
}

/** The level a file sorts under: the highest of its flags and the model's verdict, else normal. */
export function levelOf(flags, verdict) {
  const all = [...flags.map((f) => f.level), ...(verdict ? [verdict.level] : [])];
  return all.length ? all.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : "normal";
}

/**
 * The Risk view's groups: files by level; within a level the most high flags first, then the biggest change, then by path.
 * It takes each file's flags and level already worked out, so sorting a big diff does no rule matching per comparison. Pure.
 * @param {{ f: ChangedFile, flags: Flag[], level: Level }[]} scored @returns {{ level: Level, files: ChangedFile[] }[]}
 */
export function riskGroups(scored) {
  const by = { high: [], normal: [], skim: [] };
  for (const { f, flags, level } of scored) by[level].push({ f, weight: flags.filter((x) => x.level === "high").length, size: f.add + f.del });
  const order = (a, b) => b.weight - a.weight || b.size - a.size || a.f.path.localeCompare(b.f.path);
  return LEVELS.map((level) => ({ level, files: by[level].sort(order).map((x) => x.f) }));
}

/** Splits `git diff` output into one text per file (new-side path; old side for a deletion). @returns {Map<string, string>} */
export function splitDiff(text) {
  const out = new Map();
  let path = null, buf = [];
  const flush = () => { if (path) out.set(path, buf.join("\n")); };
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) { flush(); path = null; buf = []; continue; }
    if (line.startsWith("--- a/") && !path) path = line.slice(6).replace(/\t$/, "");
    else if (line.startsWith("+++ b/")) path = line.slice(6).replace(/\t$/, "");
    buf.push(line);
  }
  flush();
  return out;
}

export const VERDICT_SCHEMA = JSON.stringify({
  type: "object",
  properties: { files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, level: { enum: LEVELS }, reason: { type: "string" } }, required: ["path", "level", "reason"] } } },
  required: ["files"],
});

// The prompt travels as one program argument, which Linux caps at 128 KiB.
const PER_FILE_LINES = 200, TOTAL_CHARS = 60000;

/** The question for the model: every changed path for context, the diffs of the files to judge. */
export function triagePrompt(all, judge, diffs, flagsOf) {
  let budget = TOTAL_CHARS;
  const parts = judge.map((f) => {
    const flags = flagsOf(f).map((x) => x.text).join("; ");
    const head = `### ${f.path} (${f.status}, +${f.add} -${f.del})${flags ? ` [rule flags: ${flags}]` : ""}`;
    const lines = (diffs.get(f.path) ?? "").split("\n");
    let body = lines.slice(0, PER_FILE_LINES).join("\n") + (lines.length > PER_FILE_LINES ? `\n… ${lines.length - PER_FILE_LINES} more lines` : "");
    if (body.length > budget) body = budget > 400 ? body.slice(0, budget) + "\n… (cut)" : "(diff left out: too long)";
    budget = Math.max(0, budget - body.length);
    return `${head}\n${body}`;
  });
  return [
    "Coding agents wrote these changes. Triage them for a human reviewer, who will still read every file: you only set the order and the depth.",
    "For each file under \"Files to judge\" give a level and a reason.",
    "- high: can change behaviour in a way that breaks things: logic, data, security, public interfaces, concurrency, error handling, config that ships, tests that got weaker.",
    "- normal: real changes with limited reach.",
    "- skim: formatting, renames, comments, docs wording, generated output.",
    "The reason is at most 12 words, says what the change does that matters, and is concrete enough to check at a glance (\"retries now swallow the last error\", not \"changes error handling\"). Rule flags come from simple pattern checks: confirm or correct them in your reason.",
    "",
    `All changed files: ${all.map((f) => f.path).join(", ")}`,
    "",
    "Files to judge:",
    ...parts,
  ].join("\n");
}
