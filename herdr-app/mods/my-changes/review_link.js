// Links the Changes side panel to its tab's review pane through shared state: the panel opens the pane and says which file to show, the pane asks the panel to tick a file reviewed.

import { panes, focused, run, shared, setShared, props } from "herdr";
import { REVIEW_MOD, TOGGLE_KEY, reviewKey, findReviewPane, followFocus, splitTarget, reviewRecord, parseRecord, toggleToApply } from "./review_pane.js";
import { threadsKey, parseShared } from "./comment_share.js";
import { JUMP_KEY, listKey, listRow, parseList } from "./comment_list.js";

/** True in the copy of the mod that runs as a review pane (opened with props {review, tab}). */
export const isReviewPane = () => Boolean(props()?.review);

/** The record the review pane shows, read for its own tab, or null. */
export const paneRecord = () => parseRecord(shared(reviewKey(String(props()?.tab ?? ""))));

/** The review pane's folder: the one its record names, so a focus change never resets it. */
export function paneLocation() {
  const record = paneRecord();
  return { cwd: record?.root ?? null, on: record?.on ?? null };
}

let lastTerminal = null;
/** The focused terminal's address as the side panel follows it: kept while the review pane, which has no terminal, has focus. */
export function followedTerminal() {
  const f = focused(), pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  lastTerminal = followFocus(pane, f?.terminal ?? null, lastTerminal);
  return lastTerminal;
}

/** True when the focused tab has a review pane, so the side panel can leave the diff to it. */
export const paneShown = () => Boolean(findReviewPane(panes(), focused()?.tab));

/** Opens the tab's review pane right of the focused terminal, once. False when there is no terminal pane to split or the split fails, so the panel keeps showing the diff itself. */
export function openReviewPane() {
  const focus = focused(), tab = focus?.tab;
  if (!tab) return false;
  if (findReviewPane(panes(), tab)) return true;
  const pane = splitTarget(focus, panes());
  if (!pane) return false;
  try { run("pane.split", { direction: "right", pane, mod: REVIEW_MOD, props: { review: true, tab } }); } catch { return false; }
  // run returns null either way; the pane list says whether the split landed.
  return Boolean(findReviewPane(panes(), tab));
}

/** Tells the tab's review pane which file the panel has open. An unchanged record is not written again, since every setShared redraws every mod. @param {any} host the side panel's Changes view */
export function publishReview(host) {
  const tab = focused()?.tab, file = host.files.find((f) => f.path === host.open);
  if (isReviewPane() || !tab || !file || !host.root || !findReviewPane(panes(), tab)) return;
  const record = reviewRecord({ tab, root: host.root, on: host.on, against: host.against ?? "HEAD", hasHead: host.hasHead, file, reviewed: host.reviewed(file), stale: host.stale(file) });
  share(reviewKey(tab), record);
  publishThreads(host);
}

/** From the review pane: asks the side panel, which owns the marks, to toggle a file reviewed. @param {string} root @param {string} path */
export const requestToggle = (root, path) => setShared(TOGGLE_KEY, { root, path, ts: Date.now() });

/** In the side panel: the path the pane's newest request asks to toggle, or null. Remembers the request so it applies once. @param {any} host the side panel's Changes view */
export function takeToggle(host) {
  const { path, seen } = toggleToApply(shared(TOGGLE_KEY), host.toggleSeen ?? null, host.root, Date.now());
  host.toggleSeen = seen;
  return path;
}

/** Writes a shared value unless it is unchanged, since every setShared redraws every mod. @param {string} key @param {unknown} value */
function share(key, value) {
  if (JSON.stringify(value) !== JSON.stringify(shared(key))) setShared(key, value);
}

/** Gives the tab's review pane the open file's comment threads, and a row for every thread in the folder for its comment list. @param {any} host the side panel's Changes view */
export function publishThreads(host) {
  const tab = focused()?.tab;
  if (isReviewPane() || !tab || !host.root || !findReviewPane(panes(), tab)) return;
  const paths = host.files.map((f) => f.path);
  share(listKey(tab), { root: host.root, rows: host.comments.threads.map((t) => listRow(t, paths)) });
  if (host.open) share(threadsKey(tab), { root: host.root, path: host.open, threads: host.comments.forFile(host.open), drafts: host.comments.drafts() });
}

/** In the review pane: the panel's threads for the file it shows and its draft count, or null. @param {string | null} root @param {string | null} path */
export const paneThreads = (root, path) => (root && path ? parseShared(shared(threadsKey(String(props()?.tab ?? ""))), root, path) : null);

/** In the review pane: a row for every thread in its folder. @param {string | null} root */
export const paneList = (root) => parseList(shared(listKey(String(props()?.tab ?? ""))), root);

/** From the review pane's comment list: asks the side panel, which owns the open file, to open another one. @param {string} root @param {string} path */
export const requestJump = (root, path) => setShared(JUMP_KEY, { root, path, ts: Date.now() });

/** In the side panel: the path the comment list's newest request asks to open, or null. Remembers the request so it applies once. @param {any} host the side panel's Changes view */
export function takeJump(host) {
  const { path, seen } = toggleToApply(shared(JUMP_KEY), host.jumpSeen ?? null, host.root, Date.now());
  host.jumpSeen = seen;
  return path;
}
