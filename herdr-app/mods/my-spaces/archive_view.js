// The archived section, the "needs you" marker and the archive commands of the Spaces list.
// `view` is the Spaces view: it holds `archived` (ids), `archFolded` and `hidden` (archived rows).

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, run, spaces } from "herdr";
import { nextAfter, setArchived } from "./archive.js";
import { readArchive, writeArchive } from "./archive_store.js";

const FOLD_KEY = "archived.folded";

/** @returns {boolean} folded unless the user opened it */
export function readFolded() {
  try { return localStorage.getItem(FOLD_KEY) !== "0"; } catch { return true; }
}

/** @param {any} view @param {any} cx */
export async function loadArchive(view, cx) {
  const ids = await readArchive();
  if (JSON.stringify(ids) === JSON.stringify(view.archived)) return;
  view.archived = ids;
  cx.notify();
}

/**
 * Handles "archive:<id>" and "resume:<id>" (what the menu runs as my-spaces.<command>).
 * @param {any} view @param {string} command @param {any} cx
 */
export async function applyCommand(view, command, cx) {
  const [verb, id] = command.split(/:(.*)/s);
  if (!id || (verb !== "archive" && verb !== "resume")) return;
  const on = verb === "archive";
  view.archived = setArchived(view.archived, id, on);
  const sp = spaces();
  const next = on && sp.find((s) => s.id === id)?.active ? nextAfter(sp, view.archived, id) : null;
  if (next) run("space.select", { id: next });
  cx.notify();
  await writeArchive(view.archived);
}

/** @param {any} view @param {string} id @param {any} cx */
export function resume(view, id, cx) {
  applyCommand(view, `resume:${id}`, cx);
  run("space.select", { id });
}

/** @param {any} view @param {any} t the theme @returns {any | null} */
export function needsYou(view, t) {
  const blocked = agents().some((a) => a.status === "blocked" && view.archived.includes(a.space));
  return blocked ? div().flex_none().size(7).mx(4).rounded(4).bg(t.blocked).tooltip("An archived space needs you") : null;
}

/** @param {any} view @param {any} t @param {boolean} collapsed @returns {any[]} */
export function archivedSection(view, t, collapsed) {
  if (collapsed || !view.hidden.length) return [];
  const head = h_flex().id("archived-head").h(26).flex_none().px(8).mt(6).gap(7).items_center().text_size(11).text_color(t.dim)
    .cursor_pointer().hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => {
      view.archFolded = !view.archFolded;
      try { localStorage.setItem(FOLD_KEY, view.archFolded ? "1" : "0"); } catch {}
      cx.notify();
    })
    .child(div().flex_1().truncate().child(`Archived · ${view.hidden.length}`))
    .child(svg(`mods/workspace-chrome/chevron-${view.archFolded ? "right" : "down"}.svg`).size(11).flex_none());
  return [head, ...(view.archFolded ? [] : view.hidden.map((r) => view.row({ ...r, tree: null }, t)))];
}
