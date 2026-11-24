// What an agent has been doing, read from the tail of its transcript (JSON lines). Pure.

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const base = (path) => String(path ?? "").split("/").filter(Boolean).pop() ?? "";

/** How each tool shows in one line: its name and the part of its input that says what it did. */
const SUMMARY = {
  Bash: (i) => clip(oneLine(i.command), 70),
  Read: (i) => base(i.file_path),
  Edit: (i) => base(i.file_path),
  Write: (i) => base(i.file_path),
  Grep: (i) => clip(oneLine(i.pattern), 50),
  Glob: (i) => clip(oneLine(i.pattern), 50),
  WebSearch: (i) => clip(oneLine(i.query), 60),
  WebFetch: (i) => clip(oneLine(i.url), 60),
  Agent: (i) => clip(oneLine(i.description), 60),
  SendMessage: (i) => `to ${oneLine(i.to)}`,
};

/** `Edit Editor.tsx`, `Bash pnpm test`, or just the tool's name when nothing useful is in its input. */
export function toolSummary(name, input) {
  const detail = SUMMARY[name]?.(input ?? {}) ?? "";
  return detail ? `${name} ${detail}` : name;
}

const parseLine = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

/** The last tool call, the last thing said, and every message sent to a peer, from a transcript's tail. */
export function readTail(text) {
  const result = { lastTool: null, lastText: "", sent: [] };
  for (const line of String(text ?? "").split("\n")) {
    const record = line ? parseLine(line) : null;
    if (record?.type !== "assistant") continue;
    for (const part of record.message?.content ?? []) {
      if (part.type === "text" && part.text?.trim()) result.lastText = clip(oneLine(part.text), 140);
      if (part.type !== "tool_use") continue;
      result.lastTool = toolSummary(part.name, part.input);
      if (part.name === "SendMessage" && part.input?.to) {
        result.sent.push({ at: Date.parse(record.timestamp) || 0, to: part.input.to, text: clip(String(part.input.message ?? "").trim(), 600) });
      }
    }
  }
  return result;
}

/** Messages between agents of one space, newest first, each as who sent it, who got it and the text. */
export function messageFeed(tails, limit = 12) {
  return tails
    .flatMap(({ name, tail }) => tail.sent.map((m) => ({ ...m, from: name })))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

/** The pairs of agents that exchanged more than `max` messages in the last `windowMs`: a sign of a loop. */
export function chattyPairs(feed, now, { max = 6, windowMs = 10 * 60 * 1000 } = {}) {
  const counts = new Map();
  for (const m of feed.filter((x) => now - x.at <= windowMs)) {
    const pair = [m.from, m.to].sort().join(" and ");
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > max).map(([pair]) => pair);
}

/** The first line of a message's text: all that shows until the message is expanded. */
export const firstLine = (text) => String(text ?? "").trim().split("\n")[0];

/** A message's identity across refreshes, for remembering which ones are expanded. */
export const messageKey = (m) => `${m.at}:${m.from}:${m.to}`;

/** The header count, such as "12 messages". */
export const feedCount = (n) => `${n} message${n === 1 ? "" : "s"}`;
