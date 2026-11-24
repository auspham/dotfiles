// Archived spaces: the file my-spaces writes and the pure rules for hiding their agents. No herdr imports, so node can test it.

export const ARCHIVE_FILE = "archived-spaces.json";

/**
 * The archived space ids in the file text. A missing or damaged file archives nothing.
 * @param {string | null | undefined} text
 * @returns {Set<string>}
 */
export function parseArchived(text) {
  try {
    const spaces = JSON.parse(text ?? "")?.spaces;
    return new Set(Array.isArray(spaces) ? spaces.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Agents split by whether their space is archived.
 * @template {{ space: string }} A
 * @param {A[]} list
 * @param {Set<string>} archived
 * @returns {{ live: A[], hidden: A[] }}
 */
export function splitArchived(list, archived) {
  return { live: list.filter((a) => !archived.has(a.space)), hidden: list.filter((a) => archived.has(a.space)) };
}

/**
 * @param {number} count
 * @returns {string}
 */
export function archivedLabel(count) {
  return `Archived · ${count} agent${count === 1 ? "" : "s"}`;
}
