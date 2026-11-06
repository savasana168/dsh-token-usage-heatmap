// Per-session usage fold: reads a DSH session log (plain .jsonl or .jsonl.zstd)
// and reduces it to per-day buckets in the shape the stats panel consumes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as zlib from "node:zlib";

// zstd support arrived in Node 22.15/23.8; an older host runtime has no
// zstdDecompressSync at all. Resolve it defensively so importing this module
// never fails on such a runtime -- compressed logs then simply stay unread
// instead of taking the whole plugin down.
const zstdDecompressSync = typeof zlib.zstdDecompressSync === "function" ? zlib.zstdDecompressSync : null;

export const ZSTD_SUPPORTED = zstdDecompressSync !== null;

const SESSION_LOG = /^session(?:\.v([1-9][0-9]*))?\.jsonl(?:\.zstd)?$/i;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function pad2(value) {
	return String(value).padStart(2, "0");
}

export function dayKey(time) {
	const date = new Date(time);
	if (!Number.isFinite(date.getTime())) return null;
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function hourOf(time) {
	const date = new Date(time);
	if (!Number.isFinite(date.getTime())) return null;
	return date.getHours();
}

// A DSH `.jsonl.zstd` log is a multi-frame stream: a header frame, the event
// log frame, then small tail records. Decompressing the whole buffer only
// yields the first frame, so scan for every zstd magic and decode each one.
function decodeLog(buffer) {
	if (buffer.length < 4 || buffer.indexOf(ZSTD_MAGIC) < 0) return buffer.toString("utf8");
	if (zstdDecompressSync === null) return "";
	const parts = [];
	let pos = 0;
	for (;;) {
		const at = buffer.indexOf(ZSTD_MAGIC, pos);
		if (at < 0) break;
		try {
			parts.push(zstdDecompressSync(buffer.subarray(at)).toString("utf8"));
		} catch {
			// A truncated or trailing frame must not lose what already decoded.
		}
		pos = at + 4;
	}
	return parts.join("\n");
}

export function readEvents(file) {
	const text = decodeLog(readFileSync(file));
	const events = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		try {
			events.push(JSON.parse(trimmed));
		} catch {
			// Skip a torn line rather than dropping the whole log.
		}
	}
	return events;
}

function count(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

export function bucketsOf(usage) {
	if (usage === null || typeof usage !== "object") return null;
	return {
		input: count(usage.inputTokens),
		output: count(usage.outputTokens),
		cacheRead: count(usage.cacheReadTokens),
		cacheWrite: count(usage.cacheWriteTokens),
	};
}

function usageOf(event) {
	const data = event.data;
	if (data === null || typeof data !== "object") return null;
	const direct = bucketsOf(data.usage);
	if (direct !== null) return direct;
	const stream = data.stream;
	if (!Array.isArray(stream)) return null;
	for (let i = stream.length - 1; i >= 0; i -= 1) {
		const record = stream[i];
		if (record !== null && typeof record === "object" && record.type === "chunk" && record.chunk && record.chunk.type === "usage") {
			return bucketsOf(record.chunk.usage);
		}
	}
	return null;
}

function modelOf(event) {
	const data = event.data;
	const message = data !== null && typeof data === "object" ? data.message : null;
	const source = message !== null && typeof message === "object" ? message.source : null;
	return source !== null && typeof source === "object" && typeof source.model === "string" ? source.model : null;
}

function add(into, buckets, sign) {
	into.input += sign * buckets.input;
	into.output += sign * buckets.output;
	into.cacheRead += sign * buckets.cacheRead;
	into.cacheWrite += sign * buckets.cacheWrite;
	into.calls += sign;
}

/**
 * Fold one session's events into `{ days: { "YYYY-MM-DD": { input, output,
 * cacheRead, cacheWrite, calls, hours: [24], models: { name: {..} } } } }`.
 *
 * A retried step reuses its turn/step pair: the replacement message is folded
 * once, so the previous attempt's buckets are subtracted before the new ones
 * are added. `llm/retry-started` clears the remembered attempt.
 */
export function foldSession(events) {
	const days = new Map();
	let last = null;

	const cell = (day) => {
		let current = days.get(day);
		if (current === undefined) {
			current = {
				date: day,
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				calls: 0,
				hours: new Array(24).fill(0),
				models: new Map(),
			};
			days.set(day, current);
		}
		return current;
	};

	const bump = (day, hour, model, buckets, sign) => {
		const current = cell(day);
		add(current, buckets, sign);
		if (hour !== null) current.hours[hour] += sign;
		if (model !== null) {
			let entry = current.models.get(model);
			if (entry === undefined) {
				if (sign < 0) return;
				entry = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
				current.models.set(model, entry);
			}
			add(entry, buckets, sign);
		}
	};

	for (const event of events) {
		if (event === null || typeof event !== "object") continue;
		if (event.type === "llm/retry-started") {
			if (last !== null && last.turn === event.data?.turn && last.step === event.data?.step) last = null;
			continue;
		}
		if (event.type !== "assistant/message" && event.type !== "assistant/attempt") continue;
		const buckets = usageOf(event);
		if (buckets === null) continue;
		const turn = event.data?.turn;
		const step = event.data?.step;
		const day = dayKey(event.time);
		if (day === null) continue;
		const hour = hourOf(event.time);
		const model = modelOf(event);
		// A retried step rewrites the same turn/step pair: the earlier attempt is
		// taken back when the pair repeats, so each settled step counts once.
		if (last !== null && last.turn === turn && last.step === step) {
			bump(last.day, last.hour, last.model, last.buckets, -1);
		}
		bump(day, hour, model, buckets, 1);
		last = { turn, step, buckets, day, hour, model };
	}

	const out = {};
	for (const [day, value] of days) {
		const models = {};
		for (const [name, entry] of value.models) models[name] = entry;
		out[day] = {
			date: day,
			input: value.input,
			output: value.output,
			cacheRead: value.cacheRead,
			cacheWrite: value.cacheWrite,
			calls: value.calls,
			hours: value.hours,
			models,
		};
	}
	return out;
}

function versionOf(name) {
	const match = SESSION_LOG.exec(name);
	if (match === null) return null;
	return { version: match[1] === undefined ? 1 : Number(match[1]), compressed: name.toLowerCase().endsWith(".zstd") };
}

export function newestLog(directory) {
	let best = null;
	let entries;
	try {
		entries = readdirSync(directory);
	} catch {
		return null;
	}
	for (const name of entries) {
		const info = versionOf(name);
		if (info === null) continue;
		const file = join(directory, name);
		if (best === null || info.version > best.version || (info.version === best.version && !info.compressed)) {
			best = { file, version: info.version };
		}
	}
	if (best === null) return null;
	try {
		const stats = statSync(best.file);
		if (!stats.isFile()) return null;
		return { file: best.file, size: stats.size, mtimeMs: stats.mtimeMs };
	} catch {
		return null;
	}
}

/** Every `root/<project>/<session>/<log>` pair, in directory order. */
export function listSessionLogs(root) {
	const found = [];
	let projects;
	try {
		projects = readdirSync(root, { withFileTypes: true });
	} catch {
		return found;
	}
	for (const project of projects) {
		if (!project.isDirectory()) continue;
		const projectDir = join(root, project.name);
		let sessions;
		try {
			sessions = readdirSync(projectDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const session of sessions) {
			if (!session.isDirectory()) continue;
			const log = newestLog(join(projectDir, session.name));
			if (log !== null) found.push({ id: session.name, ...log });
		}
	}
	return found;
}

export function tokensOf(bucket) {
	return (bucket.input || 0) + (bucket.output || 0) + (bucket.cacheRead || 0) + (bucket.cacheWrite || 0);
}
