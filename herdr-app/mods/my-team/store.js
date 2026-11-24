// Reads and writes the coordinator settings file, and applies label changes to agents.

import { exec } from "herdr";
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
