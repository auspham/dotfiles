// The small marks on a team card: who is the coordinator and where a child's review stands.

import { div, svg } from "gpui-kit";

const REVIEW = { pending: ["Awaiting review", "working"], approved: ["Approved", "done"], changes: ["Changes", "blocked"] };

const chip = (text, color, lead = null) =>
  div().flex_none().px(6).h(18).gap(4).rounded(5).bg(color + "26").text_size(10.5).font_semibold().text_color(color).flex().items_center()
    .when(lead !== null, (e) => e.child(lead)).child(text);

/** The coordinator's mark, shown next to its name. */
export const coordinatorBadge = (t) => chip("Coordinator", t.working);

/** A child's review state; the note is its tooltip. */
export function reviewChip(t, card) {
  if (card.review === "yours") return chip("Your turn", t.blocked).tooltip(card.reviewNote || "The coordinator approved this and handed the review to you");
  if (card.review === "reviewed") return chip("Reviewed by you", t.done).tooltip(card.reviewNote || "You finished reviewing this");
  if (card.review === "reviewing") {
    return chip("Reviewing", t.working, svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)).tooltip(card.reviewNote || "The coordinator is reading the diff");
  }
  const [text, tone] = REVIEW[card.review] ?? REVIEW.pending;
  return chip(text, t[tone] ?? t.dim).tooltip(card.reviewNote || text);
}

/** What a child works on, such as "login-fix on agent/login-fix", or "" for anyone else. */
export const taskLine = (card) => (card.role === "child" && card.task ? `${card.task} on ${card.branch || "its branch"}` : "");

/** The small note on a lent child, such as "lent by api-lead"; it says who borrowed it on hover. */
export const lentNote = (t, card) =>
  div().id(`lent-${card.address}`).min_w(0).truncate().text_size(10.5).text_color(t.dim)
    .tooltip(`Lent by ${card.ownerName} to ${card.coordName}; it goes back when returned`).child(`lent by ${card.ownerName}`);
