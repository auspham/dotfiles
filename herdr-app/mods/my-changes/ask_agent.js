// An Ask question sent to the live agent working in this folder, and how its hreview replies join the chat. Pure: no herdr imports, so node can test it.

/** @typedef {import("./comment_replies.js").Reply} Reply */
/** @typedef {{ address: string, name: string }} Agent */
/** @typedef {{ id: string, path: string | null, label: string, q: string, a: string, status: string, at: number, to?: Agent }} ChatMessage */

const INSTRUCTIONS = (id) => `Answer with: hreview reply ${id} "<answer>". If it asks for a change, make it in your worktree, commit, and say what you changed in the reply.`;

/** Where the question is written; the message id keeps each question in its own file. @param {string} stateHome @param {string} id */
export const askPath = (stateHome, id) => `${stateHome}/herdr-review/asks/ask-${id}.md`;

/** The question file: the instructions, then the question with its file, range and diff. @param {string} id @param {string} prompt */
export const askNote = (id, prompt) => `A question from the user, asked in the Changes panel. ${INSTRUCTIONS(id)}\n\n${prompt}\n`;

/** The one line typed into the agent. hc send turns every newline into Enter, so the question goes in the file and the line carries none. @param {string} id @param {string} path */
export const askLine = (id, path) => `[Ask ${id}] Read ${path.replace(/[\r\n]+/g, " ")}. ${INSTRUCTIONS(id)}`;

/** Sets each agent-sent message's answer to every reply for its id from the terminal it went to; a reply from another terminal is passed over. @param {ChatMessage[]} messages @param {Reply[]} replies @returns {{ messages: ChatMessage[], changed: boolean }} */
export function applyChatReplies(messages, replies) {
  let changed = false;
  const next = messages.map((m) => {
    if (!m.to || (m.status !== "sent" && m.status !== "done")) return m;
    const a = replies.filter((r) => r.id === m.id && r.from === m.to?.address).map((r) => r.text).join("\n\n");
    if (!a || (a === m.a && m.status === "done")) return m;
    changed = true;
    return { ...m, a, status: "done" };
  });
  return { messages: next, changed };
}

/** Whether to keep reading the replies file for the chat: some message went to an agent, which may answer more than once. @param {ChatMessage[]} messages */
export const chatListening = (messages) => messages.some((m) => Boolean(m.to) && (m.status === "sent" || m.status === "done"));

/** After a reload: a question still being delivered or answered by claude -p is cut off; one already sent to an agent keeps waiting for its reply. @param {ChatMessage[]} messages */
export const settleChat = (messages) => messages.map((m) => (m.status === "pending" ? { ...m, status: "error", a: "Interrupted: the panel reloaded before the answer arrived." } : m));
