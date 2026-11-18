import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import streamDeck from "@elgato/streamdeck";

// ../helper/vscode.ps1 relative to bin/plugin.js.
const SCRIPT = fileURLToPath(new URL("../helper/vscode.ps1", import.meta.url));

/** Talks to the long-running PowerShell helper (VS Code window focus, keystrokes) over stdin/stdout. */
class Helper {
	proc = undefined;
	nextId = 1;
	pending = new Map(); // id -> { resolve, reject, timer }
	buffer = "";

	start() {
		const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT], {
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
		});
		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (chunk) => {
			this.buffer += chunk;
			let nl;
			while ((nl = this.buffer.indexOf("\n")) >= 0) {
				this.onLine(this.buffer.slice(0, nl).trim());
				this.buffer = this.buffer.slice(nl + 1);
			}
		});
		proc.stderr.on("data", (d) => streamDeck.logger.warn(`helper: ${String(d).trim()}`));
		proc.on("exit", (code) => {
			streamDeck.logger.warn(`helper exited (${code})`);
			if (this.proc === proc) this.proc = undefined;
			for (const p of this.pending.values()) p.reject(new Error("helper exited"));
			this.pending.clear();
		});
		this.proc = proc;
	}

	onLine(line) {
		const m = /^(\d+) (ok|err)(?: (.*))?$/.exec(line);
		if (!m) return; // "ready" and anything else
		const p = this.pending.get(Number(m[1]));
		if (!p) return;
		this.pending.delete(Number(m[1]));
		clearTimeout(p.timer);
		if (m[2] === "ok") p.resolve();
		else p.reject(new Error(m[3] || "helper error"));
	}

	/** Runs one command, e.g. { cmd: "keys", keys: [...] }; resolves when the helper has done it. */
	call(command, timeoutMs = 30_000) {
		if (!this.proc) this.start();
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`helper timed out on ${command.cmd}`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			this.proc.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
		});
	}
}

export const helper = new Helper();
