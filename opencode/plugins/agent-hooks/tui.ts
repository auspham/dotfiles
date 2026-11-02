import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin/tui"

// Drives the shared tmux window spinner/marker hooks in ~/.config/agent-hooks from OpenCode
// session events. Runs inside the TUI process, so $TMUX_PANE is the pane showing this TUI.

type Action = "working" | "input" | "answered" | "done" | "cancelled" | "title"

const hookScript = join(homedir(), ".config", "agent-hooks", "opencode.sh")

export default Plugin.define({
  id: "agent-hooks.tmux",
  setup(context) {
    if (!process.env.TMUX_PANE) return

    const { session } = context.data
    const pendingInputs = new Map<string, Set<string>>()
    // Roots this TUI started spinning for, so closing a tab mid-turn still delivers its end.
    const workingRoots = new Set<string>()
    let queue: Promise<void> = Promise.resolve()
    // Root session the window currently shows, so renaming a background tab leaves it alone.
    let windowRootID: string | undefined

    // Hook calls run one at a time in event order: a quick succeeded -> started pair
    // must never land as working -> done.
    const run = (action: Action, rootID: string, title?: string): void => {
      windowRootID = rootID
      const payload = JSON.stringify({
        session_id: rootID,
        session_name: title ?? session.get(rootID)?.title ?? "",
      })
      queue = queue.then(
        () =>
          new Promise<void>((resolve) => {
            const child = spawn(hookScript, [action], {
              env: { ...process.env, HOOK_AGENT: "opencode" },
              stdio: ["pipe", "ignore", "ignore"],
            })
            child.once("error", () => resolve())
            child.once("close", () => resolve())
            child.stdin.once("error", () => {})
            child.stdin.end(payload)
          }),
      )
    }

    // The background service broadcasts every session to every TUI; only react to roots
    // open in this one.
    const owns = (rootID: string): boolean => {
      if (workingRoots.has(rootID)) return true
      if (context.ui.tabs.enabled()) return context.ui.tabs.list().some((tab) => tab.sessionID === rootID)
      const route = context.ui.router.current()
      return route.type === "session" && session.root(route.sessionID) === rootID
    }

    const ownedRoot = (sessionID: string): string | undefined => {
      const rootID = session.root(sessionID)
      return owns(rootID) ? rootID : undefined
    }

    const ownedRootSession = (sessionID: string): string | undefined =>
      session.root(sessionID) === sessionID ? ownedRoot(sessionID) : undefined

    // Same rule as the built-in opencode.notifications plugin: a running direct subagent will
    // wake its parent again with its report, so the parent is not done yet.
    const hasRunningChild = (rootID: string): boolean =>
      session
        .family(rootID)
        .some((id) => id !== rootID && session.get(id)?.parentID === rootID && session.status(id) === "running")

    const addInput = (sessionID: string, inputID: string): void => {
      const rootID = ownedRoot(sessionID)
      if (!rootID) return
      const inputs = pendingInputs.get(rootID) ?? new Set<string>()
      inputs.add(inputID)
      pendingInputs.set(rootID, inputs)
      run("input", rootID)
    }

    const resolveInput = (sessionID: string, inputID: string): void => {
      const rootID = session.root(sessionID)
      const inputs = pendingInputs.get(rootID)
      if (!inputs?.delete(inputID) || inputs.size > 0) return
      pendingInputs.delete(rootID)
      if (session.status(rootID) === "running") run("answered", rootID)
    }

    const end = (sessionID: string, action: "done" | "cancelled"): void => {
      const rootID = ownedRootSession(sessionID)
      if (!rootID) return
      workingRoots.delete(rootID)
      pendingInputs.delete(rootID)
      run(action, rootID)
    }

    const dispose = [
      context.data.on("session.execution.started", (event) => {
        const rootID = ownedRootSession(event.data.sessionID)
        if (!rootID) return
        workingRoots.add(rootID)
        run("working", rootID)
      }),
      context.data.on("session.execution.succeeded", (event) => {
        if (hasRunningChild(event.data.sessionID)) return
        end(event.data.sessionID, "done")
      }),
      context.data.on("session.execution.interrupted", (event) => {
        if (event.data.reason === "superseded") return
        end(event.data.sessionID, "cancelled")
      }),
      context.data.on("session.execution.failed", (event) => end(event.data.sessionID, "cancelled")),
      context.data.on("permission.asked", (event) => addInput(event.data.sessionID, event.data.id)),
      context.data.on("permission.replied", (event) => resolveInput(event.data.sessionID, event.data.requestID)),
      context.data.on("form.created", (event) => addInput(event.data.form.sessionID, event.data.form.id)),
      context.data.on("form.replied", (event) => resolveInput(event.data.sessionID, event.data.id)),
      context.data.on("form.cancelled", (event) => resolveInput(event.data.sessionID, event.data.id)),
      context.data.on("session.renamed", (event) => {
        if (event.data.sessionID === windowRootID) run("title", event.data.sessionID, event.data.title)
      }),
    ]

    return () => dispose.reverse().forEach((stop) => stop())
  },
})
