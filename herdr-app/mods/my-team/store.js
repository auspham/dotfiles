// Reads and writes the coordinator settings file, applies label changes to agents, and reads the knowledge space.

import { exec, readTextFile } from "herdr";
import { capNotes, foldLedger, spaceDir } from "./knowledge.js";
import { SETTINGS_PATH, parseSettings } from "./settings.js";

const READ = `cat "$HOME/${SETTINGS_PATH}" 2>/dev/null`;
const WRITE = `mkdir -p "$(dirname "$HOME/$1")" && printf %s "$2" > "$HOME/$1"`;
const none = () => ({ stdout: "" });

export async function readSettings() {
  return parseSettings((await exec("sh", ["-c", READ]).catch(none)).stdout);
}

/** Writes the file text from withSetting. A failed write is dropped: the next read shows the truth. */
export async function writeSettings(text) {
  await exec("sh", ["-c", WRITE, "sh", SETTINGS_PATH, text]).catch(none);
}

export async function applyLabels(changes) {
  for (const [address, label] of changes) await exec("hc", ["label", address, label]).catch(none);
}

let home = null;

/** The focused space's knowledge folder with its capped notes and folded ledger; each is null when missing. */
export async function readKnowledge(spaceId) {
  home ??= (await exec("sh", ["-c", 'printf %s "$HOME"']).catch(none)).stdout;
  const dir = spaceDir(home, spaceId);
  const read = (name) => (dir ? readTextFile(`${dir}/${name}`).catch(() => null) : null);
  const [notes, ledger] = await Promise.all([read("notes.md"), read("ledger.jsonl")]);
  return { dir, notes: capNotes(notes), children: ledger === null ? null : foldLedger(ledger) };
}

const ZED = 'if command -v zed-nightly >/dev/null; then exec zed-nightly "$@"; else exec zed "$@"; fi';

/** Opens the folder in Zed (the nightly build when installed). Returns a short failure note, or "". */
export async function openInZed(dir) {
  const r = await exec("sh", ["-c", ZED, "sh", dir]).catch((e) => ({ code: 1, stderr: String(e) }));
  return r.code === 0 ? "" : `Could not open Zed: ${(r.stderr || "").trim() || `exit ${r.code}`}`;
}
