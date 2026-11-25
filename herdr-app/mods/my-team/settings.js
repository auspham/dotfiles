// The per-space coordinator settings the Team panel writes and the hook and hcoord read. Pure: no herdr imports.

/** Where the settings live, relative to $HOME. The hook and hcoord read the same file. */
export const SETTINGS_PATH = ".config/herdr-team/coordinator.json";

/** The models a child can run on; "" lets Claude pick its own default. */
export const MODELS = [
  { id: "", label: "Default" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-fable-5-2", label: "Fable 5.2" },
];

/** How hard a child thinks, as `claude --effort` takes it; "" lets Claude use its own default. */
export const EFFORTS = [
  { id: "", label: "Default" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
  { id: "max", label: "Max" },
];

/** What a space with nothing saved gets; the role hook and hcoord's picked() keep the same defaults in bash. */
const DEFAULTS = { enabled: true, model: "claude-sonnet-5-5", effort: "medium" };

const allowed = (options, id) => (options.some((o) => o.id === id) ? id : "");

/** The settings stored in the file's text. Anything unreadable means no space has saved settings. */
export function parseSettings(text) {
  try {
    const spaces = JSON.parse(text)?.spaces;
    return spaces && typeof spaces === "object" ? spaces : {};
  } catch {
    return {};
  }
}

/** One space's settings; a key nobody saved takes its default, while a saved off or "" (Default) is kept. */
export function settingsFor(spaces, spaceId) {
  const found = { ...DEFAULTS, ...spaces[spaceId] };
  return { enabled: found.enabled === true, model: allowed(MODELS, found.model), effort: allowed(EFFORTS, found.effort) };
}

/** The file's new text after changing one space's settings. */
export function withSetting(spaces, spaceId, patch) {
  const next = { ...spaces, [spaceId]: { ...settingsFor(spaces, spaceId), ...patch } };
  return JSON.stringify({ spaces: next }, null, 2) + "\n";
}

/**
 * The label changes for switching the mode: on makes every agent without a role a coordinator, off takes the role
 * from coordinators only. Children keep their labels, so switching back on never turns a child into a coordinator.
 */
export function labelChanges(cards, on) {
  if (!on) return cards.filter((c) => c.role === "coordinator").flatMap((c) => [[c.address, "role="], [c.address, "coord="]]);
  return cards.filter((c) => !c.role).map((c) => [c.address, "role=coordinator"]);
}
