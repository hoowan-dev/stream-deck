import { SingletonAction } from "@elgato/streamdeck";

export const FONT = 'font-family="Segoe UI, Arial, sans-serif" text-anchor="middle"';

export function escapeXml(s) {
	return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}

/** Largest font size (up to `max`) at which `text` roughly fits across a 144px key. */
export const fitFont = (text, max) => Math.max(10, Math.min(max, Math.floor(128 / (text.length * 0.56))));

export const svgImage = (body) =>
	`data:image/svg+xml;charset=utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#111"/>${body}</svg>`,
	)}`;

export const topLine = (text) =>
	`<text x="72" y="36" ${FONT} font-size="${fitFont(text, 22)}" font-weight="600" fill="#ddd">${escapeXml(text)}</text>`;

/**
 * An action whose key image starts with a top line taken from the key's Title field.
 *
 * The manifest hides Stream Deck's own title rendering. If the user turns "Show Title" back on,
 * Stream Deck draws their title itself and the top line is left blank so it isn't drawn twice.
 * The title is mirrored into the action's settings so it is known as soon as the key reappears.
 * Subclasses implement `draw(action)` using `this.topText(action)`.
 */
export class TitledAction extends SingletonAction {
	titles = new Map(); // action id -> { text, shown }

	constructor(manifestId, defaultTitle) {
		super();
		this.manifestId = manifestId;
		this.defaultTitle = defaultTitle;
	}

	topText(action) {
		const t = this.titles.get(action.id);
		if (t?.shown && t.text) return "";
		return t?.text || this.defaultTitle;
	}

	async onWillAppear(ev) {
		if (!this.titles.has(ev.action.id)) {
			this.titles.set(ev.action.id, { text: ev.payload.settings.title ?? "", shown: false });
		}
		await this.draw(ev.action);
	}

	async onTitleParametersDidChange(ev) {
		const { title, titleParameters, settings } = ev.payload;
		this.titles.set(ev.action.id, {
			text: title.replace(/\s*\n\s*/g, " ").trim(),
			shown: titleParameters.showTitle,
		});
		if (settings.title !== title) await ev.action.setSettings({ ...settings, title });
		await this.draw(ev.action);
	}
}
