// The small marks on a team card: who is the coordinator and where a child's review stands.

import { div } from "gpui-kit";

const REVIEW = { pending: ["Review", "working"], approved: ["Approved", "done"], changes: ["Changes", "blocked"] };

const chip = (text, color) =>
  div().flex_none().px(6).h(18).rounded(5).bg(color + "26").text_size(10.5).font_semibold().text_color(color).flex().items_center().child(text);

/** The coordinator's mark, shown next to its name. */
export const coordinatorBadge = (t) => chip("Coordinator", t.working);

/** A child's review state; the note is its tooltip. */
export function reviewChip(t, card) {
  const [text, tone] = REVIEW[card.review] ?? REVIEW.pending;
  return chip(text, t[tone] ?? t.dim).tooltip(card.reviewNote || text);
}

/** What a child works on, such as "login-fix on agent/login-fix", or "" for anyone else. */
export const taskLine = (card) => (card.role === "child" && card.task ? `${card.task} on ${card.branch || "its branch"}` : "");
