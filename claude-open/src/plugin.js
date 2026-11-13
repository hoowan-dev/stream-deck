import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import streamDeck, { SingletonAction } from "@elgato/streamdeck";

const ACTION_UUID = "com.hoowan.claude-open.launch";
const DEFAULT_TITLE = "Open Claude";

// Native installer location; fall back to PATH lookup.
const LOCAL_EXE = join(homedir(), ".local", "bin", "claude.exe");
const CLAUDE = existsSync(LOCAL_EXE) ? LOCAL_EXE : "claude";

// Windows Terminal's app-execution alias. (fs.existsSync reports false for these reparse points,
// but CreateProcess launches them fine, so use the full path unconditionally.)
const WT = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps", "wt.exe") : "wt.exe";

// --- Title field -> top line -------------------------------------------------
// The key's Title field sets the top line. The manifest hides Stream Deck's own title rendering;
// if the user turns "Show Title" back on, Stream Deck draws their title itself and we leave the
// top line blank so it isn't drawn twice. The title is mirrored into settings so it survives restarts.
const titles = new Map(); // action id -> { text, shown }

function topText(id) {
	const t = titles.get(id);
	if (t?.shown && t.text) return "";
	return t?.text || DEFAULT_TITLE;
}

const fitFont = (text, max) => Math.max(10, Math.min(max, Math.floor(128 / (text.length * 0.56))));
// -----------------------------------------------------------------------------

function escapeXml(s) {
	return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}

function keyImage(top) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#111"/>
<text x="72" y="36" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle" font-size="${fitFont(top, 22)}" font-weight="600" fill="#ddd">${escapeXml(top)}</text>
<g transform="translate(44 56) scale(2)" fill="none"><path d="M14 3.5v21M3.5 14h21M6.6 6.6l14.8 14.8M21.4 6.6 6.6 21.4" stroke="#d97757" stroke-width="2.6" stroke-linecap="round"/></g>
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

class OpenClaude extends SingletonAction {
	manifestId = ACTION_UUID;

	draw(action) {
		return action.setImage(keyImage(topText(action.id)));
	}

	async onWillAppear(ev) {
		if (!titles.has(ev.action.id)) titles.set(ev.action.id, { text: ev.payload.settings.title ?? "", shown: false });
		await this.draw(ev.action);
	}

	async onTitleParametersDidChange(ev) {
		const { title, titleParameters, settings } = ev.payload;
		titles.set(ev.action.id, { text: title.replace(/\s*\n\s*/g, " ").trim(), shown: titleParameters.showTitle });
		if (settings.title !== title) await ev.action.setSettings({ ...settings, title });
		await this.draw(ev.action);
	}

	onKeyDown(ev) {
		// New Windows Terminal window in the home folder, running claude.
		const child = spawn(WT, ["-d", homedir(), CLAUDE], { cwd: homedir(), detached: true, stdio: "ignore" });
		child.on("error", (e) => {
			streamDeck.logger.error(`launch failed: ${e.message}`);
			ev.action.showAlert();
		});
		child.unref();
	}
}

streamDeck.actions.registerAction(new OpenClaude());
streamDeck.connect();
