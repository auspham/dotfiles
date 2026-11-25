// Links the Changes side panel to its tab's review pane through shared state: the panel opens the pane and says which file to show, the pane asks the panel to tick a file reviewed.

import { panes, focused, run, shared, setShared, props } from "herdr";
import { REVIEW_MOD, TOGGLE_KEY, reviewKey, findReviewPane, splitTarget, reviewRecord, parseRecord, toggleToApply } from "./review_pane.js";

/** True in the copy of the mod that runs as a review pane (opened with props {review, tab}). */
export const isReviewPane = () => Boolean(props()?.review);

/** The record the review pane shows, read for its own tab, or null. */
export const paneRecord = () => parseRecord(shared(reviewKey(String(props()?.tab ?? ""))));

/** The review pane's folder: the one its record names, so a focus change never resets it. */
export function paneLocation() {
  const record = paneRecord();
  return { cwd: record?.root ?? null, on: record?.on ?? null };
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
  if (JSON.stringify(record) !== JSON.stringify(shared(reviewKey(tab)))) setShared(reviewKey(tab), record);
}

/** From the review pane: asks the side panel, which owns the marks, to toggle a file reviewed. @param {string} root @param {string} path */
export const requestToggle = (root, path) => setShared(TOGGLE_KEY, { root, path, ts: Date.now() });

/** In the side panel: the path the pane's newest request asks to toggle, or null. Remembers the request so it applies once. @param {any} host the side panel's Changes view */
export function takeToggle(host) {
  const { path, seen } = toggleToApply(shared(TOGGLE_KEY), host.toggleSeen ?? null, host.root, Date.now());
  host.toggleSeen = seen;
  return path;
}
