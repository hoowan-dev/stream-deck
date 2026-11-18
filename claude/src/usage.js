import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { escapeXml, FONT, fitFont, svgImage, TitledAction, topLine } from "./titled-action.js";

const CREDENTIALS = join(homedir(), ".claude", ".credentials.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const POLL_MS = 180_000;
const MIN_FETCH_MS = 30_000; // key-press refreshes are throttled to this

// --- Shared usage store -------------------------------------------------------
// The 5h and weekly keys read the same response, so it's fetched once for both. The endpoint
// rate-limits hard (429 with a multi-minute Retry-After), which is honored before trying again.
let data;
let fetchedAt = 0;
let blockedUntil = 0;
let inflight;
const listeners = new Set();

// --- Token refresh --------------------------------------------------------------
// Claude Code only refreshes the token while it's running, so the plugin refreshes it itself when
// it's (nearly) expired. It takes the same lock Claude Code uses (~/.claude/.oauth_refresh.lock, a
// proper-lockfile directory: stale after 60s, mtime touched every 5s) so the two never refresh at
// once, re-reads the file under the lock, and writes atomically, keeping every other field.
const REFRESH_LOCK = join(homedir(), ".claude", ".oauth_refresh.lock");
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"; // Claude Code's OAuth client
const REFRESH_MARGIN_MS = 2 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readCreds() {
	return JSON.parse(await readFile(CREDENTIALS, "utf8"));
}

async function withRefreshLock(fn) {
	const deadline = Date.now() + 30_000;
	for (;;) {
		try {
			await mkdir(REFRESH_LOCK);
			break;
		} catch (e) {
			if (e.code !== "EEXIST") throw e;
			const st = await stat(REFRESH_LOCK).catch(() => undefined);
			if (st && Date.now() - st.mtimeMs > 60_000) {
				await rm(REFRESH_LOCK, { recursive: true, force: true }).catch(() => {});
				continue;
			}
			if (Date.now() > deadline) throw new Error("refresh busy");
			await sleep(1000 + Math.random() * 1000);
		}
	}
	const keepAlive = setInterval(() => {
		const t = new Date();
		utimes(REFRESH_LOCK, t, t).catch(() => {});
	}, 5_000);
	try {
		return await fn();
	} finally {
		clearInterval(keepAlive);
		await rm(REFRESH_LOCK, { recursive: true, force: true }).catch(() => {});
	}
}

const needsRefresh = (o) => !!o.expiresAt && o.expiresAt - REFRESH_MARGIN_MS < Date.now();

let refreshing;
/** Refreshes the token unless (under the lock) it turns out someone else already did. */
function refreshToken(force = false) {
	refreshing ??= withRefreshLock(async () => {
		const creds = await readCreds();
		const oauth = creds.claudeAiOauth;
		if (!oauth?.refreshToken) throw new Error("not logged in");
		if (!force && !needsRefresh(oauth)) return oauth.accessToken; // Claude Code beat us to it
		if (oauth.refreshTokenExpiresAt && oauth.refreshTokenExpiresAt < Date.now()) throw new Error("log in again");
		const body = { grant_type: "refresh_token", refresh_token: oauth.refreshToken, client_id: CLIENT_ID };
		if (Array.isArray(oauth.scopes) && oauth.scopes.length) body.scope = oauth.scopes.join(" ");
		const res = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) {
			streamDeck.logger.warn(`token refresh failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
			throw new Error(res.status === 400 || res.status === 401 ? "log in again" : "refresh failed");
		}
		const r = await res.json();
		const now = Date.now();
		const updated = {
			...creds,
			claudeAiOauth: {
				...oauth,
				accessToken: r.access_token,
				refreshToken: r.refresh_token ?? oauth.refreshToken,
				expiresAt: now + r.expires_in * 1000,
				...(r.refresh_token_expires_in ? { refreshTokenExpiresAt: now + r.refresh_token_expires_in * 1000 } : {}),
				...(r.scope ? { scopes: r.scope.split(" ").filter(Boolean) } : {}),
			},
		};
		const tmp = `${CREDENTIALS}.${process.pid}.tmp`;
		await writeFile(tmp, JSON.stringify(updated), "utf8");
		await rename(tmp, CREDENTIALS);
		streamDeck.logger.info("token refreshed");
		return r.access_token;
	}).finally(() => {
		refreshing = undefined;
	});
	return refreshing;
}

/** Reads the OAuth token Claude Code keeps in ~/.claude/.credentials.json, refreshing it if needed. */
async function accessToken() {
	const { claudeAiOauth: oauth } = await readCreds();
	if (!oauth?.accessToken) throw new Error("not logged in");
	if (needsRefresh(oauth)) return refreshToken();
	return oauth.accessToken;
}

async function load(force) {
	const now = Date.now();
	if (data && now - fetchedAt < (force ? MIN_FETCH_MS : POLL_MS - 5_000)) return;
	if (blockedUntil > now) {
		if (data) return;
		throw new Error("rate limited");
	}
	const get = (token) =>
		fetch(USAGE_URL, {
			headers: {
				Authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(15_000),
		});
	let res = await get(await accessToken());
	if (res.status === 401) res = await get(await refreshToken(true)); // revoked early; refresh once
	if (res.status === 429) {
		blockedUntil = now + (Number(res.headers.get("retry-after")) || 300) * 1000;
		if (data) return;
		throw new Error("rate limited");
	}
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	data = await res.json();
	fetchedAt = now;
	for (const fn of listeners) fn(data);
}

/** Refreshes the shared usage data if it's stale; listeners are notified when new data arrives. */
function refreshUsage(force = false) {
	inflight ??= load(force).finally(() => {
		inflight = undefined;
	});
	return inflight;
}
// -----------------------------------------------------------------------------

const color = (pct) => (pct >= 80 ? "#ef5350" : pct >= 50 ? "#ffb74d" : "#66bb6a");

function keyImage(top, state) {
	if (!state) return svgImage(topLine(top));
	if (state.error) {
		return svgImage(
			`${topLine(top)}<text x="72" y="86" ${FONT} font-size="${fitFont(state.error, 20)}" font-weight="600" fill="#ef5350">${escapeXml(state.error)}</text>`,
		);
	}
	const { pct, reset } = state;
	const fill = color(pct);
	const width = Math.round((Math.min(Math.max(pct, 0), 100) / 100) * 112);
	return svgImage(`${topLine(top)}
<text x="72" y="86" ${FONT} font-size="40" font-weight="700" fill="${fill}">${Math.round(pct)}%</text>
<rect x="16" y="98" width="112" height="8" rx="4" fill="#333"/>
<rect x="16" y="98" width="${width}" height="8" rx="4" fill="${fill}"/>
<text x="72" y="128" ${FONT} font-size="15" fill="#999">${escapeXml(reset)}</text>`);
}

/** A key showing one usage-limit window (e.g. `five_hour`) from the /api/oauth/usage response. */
export class UsageAction extends TitledAction {
	state = undefined; // { pct, reset } | { error }
	timer = undefined;

	constructor({ manifestId, defaultTitle, window, formatReset }) {
		super(manifestId, defaultTitle);
		this.window = window;
		this.formatReset = formatReset;
		listeners.add((d) => this.update(d));
	}

	update(d) {
		const w = d[this.window];
		this.state =
			w && typeof w.utilization === "number"
				? { pct: w.utilization, reset: w.resets_at ? `resets ${this.formatReset(new Date(w.resets_at))}` : "" }
				: { error: "no data" };
		return Promise.all(this.actions.map((a) => this.draw(a)));
	}

	draw(action) {
		return action.setImage(keyImage(this.topText(action), this.state));
	}

	async refresh(force = false) {
		if ([...this.actions].length === 0) {
			// No key visible any more; stop polling until one reappears.
			clearInterval(this.timer);
			this.timer = undefined;
			return;
		}
		try {
			await refreshUsage(force);
			if (data && (!this.state || this.state.error)) await this.update(data);
		} catch (e) {
			streamDeck.logger.warn(`usage fetch failed: ${e.message}`);
			// Keep showing the last good value on transient errors.
			if (!this.state || this.state.error) {
				this.state = { error: e.message };
				await Promise.all(this.actions.map((a) => this.draw(a)));
			}
		}
	}

	async onWillAppear(ev) {
		await super.onWillAppear(ev);
		this.timer ??= setInterval(() => this.refresh(), POLL_MS);
		await this.refresh();
	}

	// Press to refresh immediately.
	async onKeyDown() {
		await this.refresh(true);
	}
}
