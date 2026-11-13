import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { svgImage, TitledAction, topLine } from "./titled-action.js";

// Native installer location; fall back to PATH lookup.
const LOCAL_EXE = join(homedir(), ".local", "bin", "claude.exe");
const CLAUDE = existsSync(LOCAL_EXE) ? LOCAL_EXE : "claude";

// Windows Terminal's app-execution alias. (fs.existsSync reports false for these reparse points,
// but CreateProcess launches them fine, so use the full path unconditionally.)
const WT = process.env.LOCALAPPDATA
	? join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "wt.exe")
	: "wt.exe";

const ICON =
	'<g transform="translate(44 56) scale(2)" fill="none"><path d="M14 3.5v21M3.5 14h21M6.6 6.6l14.8 14.8M21.4 6.6 6.6 21.4" stroke="#d97757" stroke-width="2.6" stroke-linecap="round"/></g>';

/** A key that opens a new Windows Terminal window in the home folder running Claude Code. */
export class OpenClaudeAction extends TitledAction {
	draw(action) {
		return action.setImage(svgImage(topLine(this.topText(action)) + ICON));
	}

	onKeyDown(ev) {
		const child = spawn(WT, ["-d", homedir(), CLAUDE], { cwd: homedir(), detached: true, stdio: "ignore" });
		child.on("error", (e) => {
			streamDeck.logger.error(`launch failed: ${e.message}`);
			ev.action.showAlert();
		});
		child.unref();
	}
}
