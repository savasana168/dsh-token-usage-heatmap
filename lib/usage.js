// Host-side usage roll-up: folds every session log on disk into per-day
// buckets, keeps an incremental cache, and serves one snapshot for the panel.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { foldSession, listSessionLogs, readEvents, tokensOf } from "./fold.js";

const RECORD_VERSION = 1;
const REFRESH_TTL_MS = 30 * 1000;
const BUCKETS = ["input", "output", "cacheRead", "cacheWrite"];

export function dshHome(ctx) {
	try {
		const resolver = ctx.get("dshHomePath");
		if (typeof resolver === "function") {
			const value = resolver();
			if (typeof value === "string" && value !== "") return value;
		}
	} catch {
		// Fall through to the environment.
	}
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
	return join(homedir(), ".dsh");
}

function cacheFile(ctx) {
	return join(dshHome(ctx), "cache", "token-usage-heatmap", `usage.${process.pid}.json`);
}

function emptyCell(day) {
	return { date: day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, hours: new Array(24).fill(0), models: {} };
}

function readCache(ctx, logger) {
	const file = cacheFile(ctx);
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (parsed === null || typeof parsed !== "object") return { version: RECORD_VERSION, sessions: {} };
		if (parsed.version !== RECORD_VERSION || parsed.sessions === null || typeof parsed.sessions !== "object") {
			return { version: RECORD_VERSION, sessions: {} };
		}
		return parsed;
	} catch (error) {
		if (error !== null && typeof error === "object" && error.code !== "ENOENT") {
			logger.warn?.(`token-usage-heatmap: ignoring unusable usage cache: ${String(error.message ?? error)}`);
		}
		return { version: RECORD_VERSION, sessions: {} };
	}
}

function writeCache(ctx, record, logger) {
	const file = cacheFile(ctx);
	try {
		mkdirSync(dirname(file), { recursive: true });
		const temporary = `${file}.${process.pid}.tmp`;
		writeFileSync(temporary, JSON.stringify(record), "utf8");
		renameSync(temporary, file);
	} catch (error) {
		logger.warn?.(`token-usage-heatmap: could not save usage cache: ${String(error?.message ?? error)}`);
	}
}

function mergeInto(days, folded, sessionId) {
	for (const [day, cell] of Object.entries(folded)) {
		let target = days.get(day);
		if (target === undefined) {
			target = { ...emptyCell(day), sessionIds: new Set(), models: new Map() };
			days.set(day, target);
		}
		for (const key of BUCKETS) target[key] += cell[key] || 0;
		target.calls += cell.calls || 0;
		target.sessionIds.add(sessionId);
		const hours = Array.isArray(cell.hours) ? cell.hours : [];
		for (let hour = 0; hour < 24; hour += 1) target.hours[hour] += Number(hours[hour]) || 0;
		for (const [model, entry] of Object.entries(cell.models ?? {})) {
			let bucket = target.models.get(model);
			if (bucket === undefined) {
				bucket = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
				target.models.set(model, bucket);
			}
			for (const key of BUCKETS) bucket[key] += entry[key] || 0;
			bucket.calls += entry.calls || 0;
		}
	}
}

function summarize(days) {
	const list = [...days.values()]
		.map((cell) => ({
			date: cell.date,
			input: cell.input,
			output: cell.output,
			cacheRead: cell.cacheRead,
			cacheWrite: cell.cacheWrite,
			calls: cell.calls,
			sessions: cell.sessionIds.size,
			sessionIds: [...cell.sessionIds].sort(),
			hours: cell.hours,
			models: Object.fromEntries(
				[...cell.models.entries()].map(([name, bucket]) => [name, { ...bucket, tokens: tokensOf(bucket) }]).sort((a, b) => b[1].tokens - a[1].tokens),
			),
		}))
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, activeDays: list.length, sessions: 0 };
	const hours = new Array(24).fill(0);
	const models = new Map();
	const sessions = new Set();
	for (const day of list) {
		for (const key of BUCKETS) totals[key] += day[key];
		totals.calls += day.calls;
		for (let hour = 0; hour < 24; hour += 1) hours[hour] += day.hours[hour];
		for (const id of day.sessionIds) sessions.add(id);
		for (const [name, bucket] of Object.entries(day.models)) {
			let entry = models.get(name);
			if (entry === undefined) {
				entry = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, tokens: 0, sessions: 0 };
				models.set(name, entry);
			}
			for (const key of BUCKETS) entry[key] += bucket[key];
			entry.calls += bucket.calls;
			entry.tokens += bucket.tokens;
			entry.sessions += 1;
		}
	}
	totals.sessions = sessions.size;
	totals.tokens = tokensOf(totals);

	return {
		days: list,
		hours,
		totals,
		models: [...models.entries()].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.tokens - a.tokens),
		firstDay: list.length === 0 ? null : list[0].date,
		lastDay: list.length === 0 ? null : list[list.length - 1].date,
	};
}

function loggerOf(ctx) {
	const logger = ctx.logger;
	const warn = (message) => {
		try {
			if (logger !== undefined && typeof logger.warn === "function") logger.warn(message);
			else console.warn(message);
		} catch {
			// Logging must never break a fold.
		}
	};
	return { warn };
}

export function createUsage(ctx) {
	const logger = loggerOf(ctx);
	let value = null;
	let computing = null;
	let computedAt = 0;
	let error = null;
	let lastFailure = 0;

	const pass = () => {
		const root = join(dshHome(ctx), "sessions");
		const files = listSessionLogs(root);
		const record = readCache(ctx, logger);
		const sessions = {};
		const days = new Map();
		let changed = false;

		for (const file of files) {
			const stored = record.sessions[file.id];
			const reusable = stored !== undefined && stored.size === file.size && stored.mtimeMs === file.mtimeMs && stored.days !== undefined;
			let folded;
			const size = file.size;
			const mtimeMs = file.mtimeMs;
			if (reusable) {
				folded = stored.days;
			} else {
				try {
					folded = foldSession(readEvents(file.file));
					changed = true;
				} catch (cause) {
					if (stored !== undefined && stored.days !== undefined) {
						folded = stored.days;
					} else {
						logger.warn?.(`token-usage-heatmap: could not read ${file.file}: ${String(cause?.message ?? cause)}`);
						continue;
					}
				}
			}
			sessions[file.id] = { size, mtimeMs, days: folded };
			mergeInto(days, folded, file.id);
		}

		if (changed || Object.keys(record.sessions).length !== Object.keys(sessions).length) {
			writeCache(ctx, { version: RECORD_VERSION, sessions }, logger);
		}
		return summarize(days);
	};

	const refresh = () => {
		if (computing !== null) return computing;
		computing = Promise.resolve()
			.then(() => {
				value = pass();
				computedAt = Date.now();
				error = null;
				lastFailure = 0;
			})
			.catch((cause) => {
				error = String(cause?.message ?? cause);
				lastFailure = Date.now();
			})
			.finally(() => {
				computing = null;
			});
		return computing;
	};

	return {
		snapshot() {
			return { value, computing: computing !== null, error };
		},
		refresh,
		ensure() {
			// A failure is retried at most once per TTL: a broken sessions
			// directory must not re-scan on every poll.
			if (lastFailure !== 0 && Date.now() - lastFailure < REFRESH_TTL_MS) return Promise.resolve();
			if (value !== null && Date.now() - computedAt < REFRESH_TTL_MS) return Promise.resolve();
			return refresh();
		},
		dispose() {
			computing = null;
		},
	};
}
