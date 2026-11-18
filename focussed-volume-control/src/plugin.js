import streamDeck from "@elgato/streamdeck";

import { helper } from "./helper.js";
import { fitFont, FONT, escapeXml, svgImage, TitledAction, topLine } from "./titled-action.js";

const ACCENT = "#4dd0e1";
const MUTED = "#ef5350";
const DIM = "#666";
const DEFAULT_STEP = 10;
const POLL_MS = 1500;

// 28x28 line icons, drawn at 2x in the middle of the key.
const SPEAKER = `<path d="M3 10.5h4.5L13 6v16l-5.5-4.5H3z"/>`;
export const GLYPHS = {
	up: `${SPEAKER}<path d="M17.5 14h7M21 10.5v7"/>`,
	down: `${SPEAKER}<path d="M17.5 14h7"/>`,
	sound: `${SPEAKER}<path d="M17 10.5a5 5 0 0 1 0 7M20.5 7.5a9.5 9.5 0 0 1 0 13"/>`,
	muted: `${SPEAKER}<path d="M18 11l6 6M24 11l-6 6"/>`,
};

const keyGlyph = (g, color) =>
	`<g transform="translate(44 44) scale(2)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${g}</g>`;

const bottomLine = (text, color) =>
	`<text x="72" y="130" ${FONT} font-size="${fitFont(text, 18)}" font-weight="700" fill="${color}">${escapeXml(text)}</text>`;

const shorten = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// --- Focused app's volume, shared by every key ---------------------------------------
// While any key is visible the helper is asked every POLL_MS, so the keys show which app
// (and volume) a press will change before you press it.
let state; // { found, app, volume, muted } or undefined before the first answer
const visible = new Set(); // action ids
const redraws = new Set(); // () => Promise, one per action class
let timer;

function setState(next) {
	const changed = JSON.stringify(next) !== JSON.stringify(state);
	state = next;
	if (changed) for (const r of redraws) r();
}

async function poll() {
	try {
		setState(await helper.call({ cmd: "get" }));
	} catch (e) {
		streamDeck.logger.warn(`poll failed: ${e.message}`);
	}
}

function startPolling() {
	if (timer) return;
	poll();
	timer = setInterval(poll, POLL_MS);
}

function stopPolling() {
	clearInterval(timer);
	timer = undefined;
}
// ----------------------------------------------------------------------------------

/** Base for the three keys: tracks visibility and redraws when the focused app's state changes. */
class VolumeAction extends TitledAction {
	constructor(manifestId, defaultTitle) {
		super(manifestId, defaultTitle);
		redraws.add(() => Promise.all(this.actions.map((a) => this.draw(a))));
	}

	async onWillAppear(ev) {
		visible.add(ev.action.id);
		startPolling();
		await super.onWillAppear(ev);
	}

	onWillDisappear(ev) {
		visible.delete(ev.action.id);
		if (visible.size === 0) stopPolling();
	}

	/** Bottom line: "<app> 40%", "<app> muted" or "no audio". */
	status() {
		if (!state) return bottomLine("…", DIM);
		if (!state.found) return bottomLine(state.app ? `${shorten(state.app, 10)}: no audio` : "no audio", DIM);
		const app = shorten(state.app, 12);
		return state.muted ? bottomLine(`${app} muted`, MUTED) : bottomLine(`${app} ${state.volume}%`, ACCENT);
	}

	async run(ev, command) {
		try {
			const next = await helper.call(command);
			setState(next);
			if (!next.found) await ev.action.showAlert();
		} catch (e) {
			streamDeck.logger.error(`${command.cmd} failed: ${e.message}`);
			await ev.action.showAlert();
		}
	}
}

/** Volume up or down by the key's step setting (percentage points, default 10). */
class StepAction extends VolumeAction {
	steps = new Map(); // action id -> step

	constructor(manifestId, sign) {
		super(manifestId, "");
		this.sign = sign;
	}

	topText(action) {
		// Default title shows the step, e.g. "Vol +10%".
		const t = this.titles.get(action.id);
		if (t?.shown && t.text) return "";
		return t?.text || `Vol ${this.sign > 0 ? "+" : "−"}${this.step(action.id)}%`;
	}

	step(id) {
		return this.steps.get(id) ?? DEFAULT_STEP;
	}

	readStep(id, settings) {
		const n = Math.round(Number(settings.step));
		this.steps.set(id, n >= 1 && n <= 100 ? n : DEFAULT_STEP);
	}

	async onWillAppear(ev) {
		this.readStep(ev.action.id, ev.payload.settings);
		await super.onWillAppear(ev);
	}

	async onDidReceiveSettings(ev) {
		this.readStep(ev.action.id, ev.payload.settings);
		await this.draw(ev.action);
	}

	draw(action) {
		const color = state?.found ? ACCENT : DIM;
		return action.setImage(
			svgImage(topLine(this.topText(action)) + keyGlyph(this.sign > 0 ? GLYPHS.up : GLYPHS.down, color) + this.status()),
		);
	}

	onKeyDown(ev) {
		return this.run(ev, { cmd: "adjust", delta: this.sign * this.step(ev.action.id) });
	}
}

/** Toggles mute for the focused app. */
class MuteAction extends VolumeAction {
	draw(action) {
		const glyph = state?.muted ? keyGlyph(GLYPHS.muted, MUTED) : keyGlyph(GLYPHS.sound, state?.found ? ACCENT : DIM);
		return action.setImage(svgImage(topLine(this.topText(action)) + glyph + this.status()));
	}

	onKeyDown(ev) {
		return this.run(ev, { cmd: "mute" });
	}
}

streamDeck.actions.registerAction(new StepAction("com.hoowan.focussed-volume-control.up", +1));
streamDeck.actions.registerAction(new StepAction("com.hoowan.focussed-volume-control.down", -1));
streamDeck.actions.registerAction(new MuteAction("com.hoowan.focussed-volume-control.mute", "Mute"));

await streamDeck.connect();
helper.start(); // compile the helper's C# now so the first key press is quick
