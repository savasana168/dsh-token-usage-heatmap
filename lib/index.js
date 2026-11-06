// Token stats bundle: one loopback-fenced JSON route that serves the per-day
// usage roll-up of every session log under DSH_HOME/sessions.
import { createUsage, dshHome } from "./usage.js";

export const name = "token-usage-heatmap";

const ROUTE_PREFIX = "/token-usage-heatmap";
const USAGE_PATH = `${ROUTE_PREFIX}/usage`;

function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("content-length", Buffer.byteLength(body));
	res.setHeader("cache-control", "no-store");
	res.end(body);
}

function loopbackName(hostname) {
	if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

// The usage route only answers this machine's own Web GUI: a cross-site page
// must not be able to read the user's whole token history. The checks mirror
// the host's own /api fence (loopback Host, same-origin markers).
// `connection.requestRejection` is deliberately NOT used here: it also demands
// an authenticated browser Peer, so it rejects the GUI's own plain fetch.
function fenceRefused(req, res) {
	const host = req.headers?.host;
	let hostname;
	try {
		hostname = new URL(`http://${host}`).hostname;
	} catch {
		hostname = null;
	}
	if (typeof hostname !== "string" || !loopbackName(hostname)) {
		sendJson(res, 403, { ok: false, error: "forbidden" });
		return true;
	}
	if (req.headers?.["sec-fetch-site"] === "cross-site") {
		sendJson(res, 403, { ok: false, error: "forbidden" });
		return true;
	}
	const origin = req.headers?.origin;
	if (typeof origin === "string" && origin !== "") {
		let originHost;
		try {
			originHost = new URL(origin).host;
		} catch {
			sendJson(res, 403, { ok: false, error: "forbidden" });
			return true;
		}
		if (originHost !== host) {
			sendJson(res, 403, { ok: false, error: "forbidden" });
			return true;
		}
	}
	return false;
}

export function apply(ctx, config) {
	const usage = createUsage(ctx);

	ctx.effect(() => () => usage.dispose(), "token-usage-heatmap: usage");

	// Warm the roll-up as soon as the host mounts, so the very first poll from a
	// freshly loaded page usually already finds a value instead of `computing`.
	void usage.ensure();

	ctx.inject(["webServer"], (scope) => {
		const disposer = scope.webServer.register({
			kind: "exact",
			path: USAGE_PATH,
			handler: (req, res) => {
				if (req.method !== "GET" && req.method !== "HEAD") {
					res.setHeader("allow", "GET, HEAD");
					sendJson(res, 405, { ok: false, error: "method not allowed" });
					return;
				}
				if (fenceRefused(req, res)) return;
				// AWAIT the scan when there is no value yet: answering the caller
				// with `value:null` used to leave the UI blank on a cold start.
				// `ensure()` is a no-op while a fresh snapshot is already in hand,
				// so a warm poll still returns immediately.
				const reply = () => {
					const snapshot = usage.snapshot();
					const payload = { ok: true, value: snapshot.value, computing: snapshot.computing, home: dshHome(ctx) };
					if (snapshot.error !== null) payload.error = snapshot.error;
					sendJson(res, 200, payload);
				};
				if (usage.snapshot().value === null) {
					usage
						.ensure()
						.then(reply)
						.catch(reply);
					return;
				}
				void usage.ensure();
				reply();
			},
		});
		ctx.effect(() => disposer, "token-usage-heatmap: usage route");
	});
}
