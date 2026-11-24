// Reads and writes the archived-spaces file. Only my-spaces writes it.

import { exec, home, readTextFile } from "herdr";
import { parseArchive, serializeArchive } from "./archive.js";

const DIR = "/.config/herdr-app";
const FILE = `${DIR}/archived-spaces.json`;

/** @returns {Promise<string[]>} */
export async function readArchive() {
  return parseArchive(await readTextFile(home() + FILE).catch(() => null));
}

/** Atomic: a temp file, then mv.
 * @param {string[]} ids
 */
export async function writeArchive(ids) {
  const script = 'mkdir -p "$1" && printf %s "$2" > "$3.tmp" && mv "$3.tmp" "$3"';
  await exec("sh", ["-c", script, "sh", home() + DIR, serializeArchive(ids), home() + FILE]);
}
