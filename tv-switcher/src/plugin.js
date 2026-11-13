import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import streamDeck, { SingletonAction } from "@elgato/streamdeck";

const ACTION_UUID = "com.hoowan.tv-switcher.toggle";
const DEFAULT_TITLE = "TV Switcher:";

// uv installs the CLI here; fall back to PATH lookup if it has moved.
const UV_EXE = join(homedir(), ".local", "bin", "tv-switcher.exe");
const EXE = existsSync(UV_EXE) ? UV_EXE : "tv-switcher";

const TV_DISPLAY_ID = "GSM82CD"; // DISPLAY_B in tv_switcher/__init__.py
const POLL_MS = 20_000; // pick up switches made outside the Stream Deck

const MODES = {
	0: { label: "Desktop", color: "#4fc3f7" },
	1: { label: "TV", color: "#ffb74d" },
};

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

function run(args) {
	return new Promise((resolve, reject) => {
		execFile(EXE, args, { windowsHide: true, timeout: 30_000 }, (err, stdout, stderr) => {
			if (err) reject(new Error(stderr.trim() || err.message));
			else resolve(stdout);
		});
	});
}

/** Reads the current mode (0 or 1) from which display is primary in `tv-switcher status`. */
async function readMode() {
	const primary = (await run(["status"])).split(/\r?\n/).find((l) => l.includes("[primary]"));
	if (!primary) throw new Error("no primary display in tv-switcher status output");
	return primary.includes(TV_DISPLAY_ID) ? 1 : 0;
}

function escapeXml(s) {
	return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}

function keyImage(top, bottom, color) {
	const font = 'font-family="Segoe UI, Arial, sans-serif" text-anchor="middle"';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#111"/>
<text x="72" y="54" ${font} font-size="${fitFont(top, 22)}" font-weight="600" fill="#ddd">${escapeXml(top)}</text>
<text x="72" y="104" ${font} font-size="${fitFont(bottom, 36)}" font-weight="700" fill="${color}">${escapeXml(bottom)}</text>
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

class TvSwitcherToggle extends SingletonAction {
	manifestId = ACTION_UUID;
	busy = false;
	mode = undefined;
	timer = undefined;

	draw(action, bottom) {
		const m = MODES[this.mode];
		if (bottom) return action.setImage(keyImage(topText(action.id), bottom, "#999"));
		return action.setImage(m ? keyImage(topText(action.id), m.label, m.color) : keyImage(topText(action.id), "?", "#e57373"));
	}

	async refresh() {
		if (this.busy) return;
		if ([...this.actions].length === 0) {
			// No key visible any more; stop polling until one reappears.
			clearInterval(this.timer);
			this.timer = undefined;
			return;
		}
		try {
			this.mode = await readMode();
		} catch (e) {
			streamDeck.logger.warn(`status failed: ${e.message}`);
		}
		await Promise.all(this.actions.map((a) => this.draw(a)));
	}

	async onWillAppear(ev) {
		if (!titles.has(ev.action.id)) titles.set(ev.action.id, { text: ev.payload.settings.title ?? "", shown: false });
		if (this.mode !== undefined) await this.draw(ev.action);
		this.timer ??= setInterval(() => this.refresh(), POLL_MS);
		await this.refresh();
	}

	async onTitleParametersDidChange(ev) {
		const { title, titleParameters, settings } = ev.payload;
		titles.set(ev.action.id, { text: title.replace(/\s*\n\s*/g, " ").trim(), shown: titleParameters.showTitle });
		if (settings.title !== title) await ev.action.setSettings({ ...settings, title });
		if (!this.busy) await this.draw(ev.action);
	}

	async onKeyDown(ev) {
		if (this.busy) return;
		this.busy = true;
		try {
			const current = this.mode ?? (await readMode());
			const next = current === 1 ? 0 : 1;
			await Promise.all(this.actions.map((a) => this.draw(a, "...")));
			await run([String(next)]);
			this.mode = next;
		} catch (e) {
			streamDeck.logger.error(`switch failed: ${e.message}`);
			await ev.action.showAlert();
		} finally {
			this.busy = false;
		}
		await this.refresh();
	}
}

streamDeck.actions.registerAction(new TvSwitcherToggle());
streamDeck.connect();
