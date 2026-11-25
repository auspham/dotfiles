// The font comment threads draw their text in, and the advance width the wrap math counts for it. Pure: no herdr imports, so node can test it.

// A Consolas-style coding font reads code and prose alike in agent answers. Consolas and Cascadia Mono are not installed here and Fira Code is; to swap, change the name and re-measure ADVANCE_EM.
export const COMMENT_FONT = "Fira Code";
// Every glyph's advance in em, measured from a screenshot (see the layout test). Monospace, so a run's width is its length times this; it errs slightly wide so text never clips.
export const ADVANCE_EM = 0.625;
export const BODY_PX = 13;
