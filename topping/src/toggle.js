import streamDeck from "@elgato/streamdeck";

import { device } from "./device.js";
import { escapeXml, FONT, svgImage, TitledAction, topLine } from "./titled-action.js";

const ON = "#66bb6a";
const PARTIAL = "#ffb74d";
const OFF = "#666";
const ERROR = "#ef5350";

export const GLYPHS = {
	mic: (c) =>
		`<g fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"><rect x="61" y="46" width="22" height="34" rx="11" fill="${c}"/><path d="M51 68a21 21 0 0 0 42 0M72 89v9M62 98h20"/></g>`,
};

/**
 * A key that toggles one or more on/off settings of an E2x2 input together.
 * It shows ON when all of them are on; pressing it turns them all off, otherwise all on.
 */
export class ToggleAction extends TitledAction {
	constructor({ manifestId, defaultTitle, channel, settings, glyph }) {
		super(manifestId, defaultTitle);
		this.channel = channel;
		this.settings = settings; // [{ id, label }]
		this.glyph = glyph;
		device.on("change", () => Promise.all(this.actions.map((a) => this.draw(a))));
	}

	states() {
		return this.settings.map((s) => device.get(this.channel, s.id) === true);
	}

	draw(action) {
		const top = topLine(this.topText(action));
		if (!device.connected) {
			return action.setImage(
				svgImage(`${top}${GLYPHS[this.glyph](OFF)}<text x="72" y="128" ${FONT} font-size="18" font-weight="600" fill="${ERROR}">offline</text>`),
			);
		}
		const states = this.states();
		const all = states.every(Boolean);
		const color = all ? ON : states.some(Boolean) ? PARTIAL : OFF;
		const labels = this.settings
			.map((s, i) => `<tspan fill="${states[i] ? ON : OFF}">${escapeXml(s.label)}</tspan>`)
			.join(`<tspan fill="${OFF}"> · </tspan>`);
		const ring = all ? `<rect x="3" y="3" width="138" height="138" rx="14" fill="none" stroke="${ON}" stroke-width="6"/>` : "";
		return action.setImage(
			svgImage(`${ring}${top}${GLYPHS[this.glyph](color)}<text x="72" y="128" ${FONT} font-size="18" font-weight="700">${labels}</text>`),
		);
	}

	async onKeyDown(ev) {
		try {
			const target = !this.states().every(Boolean);
			for (const s of this.settings) device.set(this.channel, s.id, target);
		} catch (e) {
			streamDeck.logger.error(`toggle failed: ${e.message}`);
			await ev.action.showAlert();
		}
	}
}
