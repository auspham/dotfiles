// Pure helpers for archived spaces (the file is ~/.config/herdr-app/archived-spaces.json).

/**
 * @param {string | null | undefined} text the file's contents
 * @returns {string[]} the archived space ids; a missing or damaged file archives nothing
 */
export function parseArchive(text) {
  try {
    const spaces = JSON.parse(text ?? "").spaces;
    return Array.isArray(spaces) ? [...new Set(spaces.filter((id) => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

/** @param {string[]} ids @returns {string} */
export function serializeArchive(ids) {
  return JSON.stringify({ spaces: ids });
}

/**
 * @param {string[]} ids archived ids
 * @param {string} id the space to change
 * @param {boolean} archived whether it should end up archived
 * @returns {string[]}
 */
export function setArchived(ids, id, archived) {
  const rest = ids.filter((x) => x !== id);
  return archived ? [...rest, id] : rest;
}

/**
 * @template {{ id: string }} S
 * @param {S[]} spaces in list order
 * @param {string[]} ids archived ids
 * @returns {{ active: S[], archived: S[] }}
 */
export function splitSpaces(spaces, ids) {
  const set = new Set(ids);
  return { active: spaces.filter((s) => !set.has(s.id)), archived: spaces.filter((s) => set.has(s.id)) };
}

/**
 * The space to select once `id` is archived: the next non-archived one, else the one before.
 * @param {{ id: string }[]} spaces in list order
 * @param {string[]} ids archived ids, `id` included
 * @param {string} id
 * @returns {string | null}
 */
export function nextAfter(spaces, ids, id) {
  const at = spaces.findIndex((s) => s.id === id);
  const open = (s) => s.id !== id && !ids.includes(s.id);
  return (spaces.slice(at + 1).find(open) ?? spaces.slice(0, Math.max(at, 0)).reverse().find(open))?.id ?? null;
}
