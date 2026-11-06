window.__ModuleLoader__.load({
	id: "dsh-token-usage-heatmap",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;
		const { useEffect, useMemo, useRef, useState } = React;

		// The heat tooltip is rendered into document.body: inside the panel it was
		// clipped by the rounded card's `overflow:hidden` and by the composer dock,
		// so tips on the edge cells were cut off. A portal can never be clipped.
		let createPortal = null;
		try {
			const reactDom = require("react-dom");
			if (reactDom !== null && typeof reactDom.createPortal === "function") createPortal = reactDom.createPortal;
		} catch {
			createPortal = null;
		}

		// Settings namespace of the bundle's own Host entry: the same four
		// switches appear as rows in Settings → General and drive what mounts.
		const NS = "token-usage-heatmap";
		/** Shared with the host half: a package renamed in package.json only edits this file. */
		const PKG = "dsh-token-usage-heatmap";

		const ROUTE = "/token-usage-heatmap/usage";
		const WEEKS = 26;
		/**
		 * Heat steps are OPAQUE per-level colours, never an ink mixed with
		 * `transparent`. Compositing to alpha made low steps invisible on a dark
		 * card: 20% of #5b8ce8 over #151517 is #232d41, only 1.32:1 against that
		 * surface, so a light day rendered as a black square. Opaque values keep
		 * every step unmistakably blue in both themes.
		 *
		 * Light steps are the reference preview's sampled colours
		 * (#3b6ecf mixed 20/40/65/100 over the card). Dark steps are brighter
		 * blues chosen to hold a visible ladder on #151517.
		 */
		const HEAT_LIGHT = ["#ced8e9", "#a9bde3", "#7a9cdb", "#3b6ecf"];
		const HEAT_DARK = ["#2f5a9c", "#3a6cb8", "#4f8ade", "#86b4f8"];
		const HEAT_LEVELS = HEAT_LIGHT.length;
		/** Longest span the 模型 chart draws; 全部 falls back to it as well. */
		const CHART_DAYS = 30;
		/** Model rows shown before the "more" toggle, sized to the fixed view box. */
		const MODEL_ROWS = 2;
		const RANGES = [
			{ id: "all", days: 0 },
			{ id: "30d", days: 30 },
			{ id: "7d", days: 7 },
		];
		const MODEL_SERIES = ["#3b6ecf", "#d97757", "#4f9d69", "#a4621d", "#8a6ed8", "#3f9aa8"];
		const TTL_MS = 60000;
		const STORE_KEY = `${PKG}:panel-open`;
		const DEFAULT_FLAGS = { headerChip: true, newSessionPanel: true, sessionPanel: true };

		const BOOKS = [
			{ token: 7607, zh: "《道德经》", en: "Tao Te Ching" },
			{ token: 7778, zh: "《黄色壁纸》", en: "The Yellow Wallpaper" },
			{ token: 27557, zh: "《变形记》", en: "Metamorphosis" },
			{ token: 34713, zh: "《化身博士》", en: "The Strange Case of Dr Jekyll and Mr Hyde" },
			{ token: 37248, zh: "《爱丽丝漫游奇境》", en: "Alice's Adventures in Wonderland" },
			{ token: 39000, zh: "《动物农场》", en: "Animal Farm" },
			{ token: 51004, zh: "《绿野仙踪》", en: "The Wonderful Wizard of Oz" },
			{ token: 65763, zh: "《了不起的盖茨比》", en: "The Great Gatsby" },
			{ token: 100000, zh: "《哈利·波特与魔法石》", en: "Harry Potter and the Philosopher's Stone" },
			{ token: 115000, zh: "《活着》", en: "To Live" },
			{ token: 136278, zh: "《一九八四》", en: "Nineteen Eighty-Four" },
			{ token: 154263, zh: "《哈克贝利·费恩历险记》", en: "Adventures of Huckleberry Finn" },
			{ token: 202000, zh: "《三体》", en: "The Three-Body Problem" },
			{ token: 256179, zh: "《简·爱》", en: "Jane Eyre" },
			{ token: 306522, zh: "《白鲸》", en: "Moby-Dick" },
			{ token: 481659, zh: "《安娜·卡列尼娜》", en: "Anna Karenina" },
			{ token: 625000, zh: "《魔戒》", en: "The Lord of the Rings" },
			{ token: 638009, zh: "《三国演义》", en: "Romance of the Three Kingdoms" },
			{ token: 769001, zh: "《战争与和平》", en: "War and Peace" },
			{ token: 783200, zh: "《西游记》", en: "Journey to the West" },
			{ token: 903956, zh: "《红楼梦》", en: "Dream of the Red Chamber" },
			{ token: 958242, zh: "《水浒传》", en: "Water Margin" },
			{ token: 998000, zh: "《平凡的世界》", en: "Ordinary World" },
			{ token: 1409000, zh: "《哈利·波特》全集", en: "the whole Harry Potter series" },
			{ token: 1647000, zh: "《追忆似水年华》", en: "In Search of Lost Time" },
		];

		const zh = {
			tabOverview: "概览",
			tabModels: "模型",
			rangeAll: "全部",
			range30d: "30 天",
			range7d: "7 天",
			peakHour: "高峰时段",
			hourAm: "上午 {hour} 点",
			hourPm: "下午 {hour} 点",
			funBook: "你的 Token 用量相当于 {count} 本{book}。",
			modelSessions: "{count} 个会话",
			modelsEmpty: "暂无模型数据",
			modelsMore: "再显示 {count} 个",
			modelsLess: "收起",
			tokens: "Token 总量",
			calls: "消息数",
			sessions: "会话数",
			activeDays: "活跃天数",
			topModel: "最常用模型",
			heatTip: "{date} — {tokens} Token",
			chipNoData: "还没有用量记录",
			panelTitle: "Token 总用量",
			collapse: "收起用量面板",
			expand: "展开用量面板",
			settingsTitle: "Token 用量统计",
			settingsHeaderChip: "在顶栏显示用量概览",
			settingsHeaderChipHint: "顶栏左侧显示一个紧凑的 Token 总量提示。",
			settingsNewSessionPanel: "在新会话页显示统计面板",
			settingsNewSessionPanelHint: "在输入框上方显示完整的概览与模型面板。",
			settingsSessionPanel: "在对话中也显示统计面板",
			settingsSessionPanelHint: "关闭后只在空白的新会话页显示面板。",
		};
		const en = {
			tabOverview: "Overview",
			tabModels: "Models",
			rangeAll: "All",
			range30d: "30d",
			range7d: "7d",
			peakHour: "Peak hour",
			hourAm: "{hour} AM",
			hourPm: "{hour} PM",
			funBook: "You've used ~{count}× the tokens in {book}.",
			modelSessions: "{count} sessions",
			modelsEmpty: "No model data yet",
			modelsMore: "Show {count} more",
			modelsLess: "Show less",
			tokens: "Total tokens",
			calls: "Messages",
			sessions: "Sessions",
			activeDays: "Active days",
			topModel: "Favorite model",
			heatTip: "{date} — {tokens} tokens",
			chipNoData: "No usage recorded yet",
			panelTitle: "Total token usage",
			collapse: "Collapse the usage panel",
			expand: "Expand the usage panel",
			settingsTitle: "Token usage",
			settingsHeaderChip: "Show the usage chip in the header",
			settingsHeaderChipHint: "A compact token total sits at the left of the header.",
			settingsNewSessionPanel: "Show the statistics panel on a new session",
			settingsNewSessionPanelHint: "The full overview and model panel above the composer.",
			settingsSessionPanel: "Also show the statistics panel inside a conversation",
			settingsSessionPanelHint: "When off, the panel only appears on the blank new-session screen.",
		};

		function pad2(value) {
			return String(value).padStart(2, "0");
		}

		function dayOf(date) {
			return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
		}

		function tokensOf(bucket) {
			if (bucket === null || bucket === undefined) return 0;
			if (bucket.total !== undefined) return Number(bucket.total) || 0;
			return (Number(bucket.input) || 0) + (Number(bucket.output) || 0) + (Number(bucket.cacheRead) || 0) + (Number(bucket.cacheWrite) || 0);
		}

		function commas(value) {
			return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		function short(value) {
			const n = Number(value) || 0;
			if (n < 1000) return String(Math.round(n));
			if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, "")}k`;
			return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
		}

		/**
		 * Axis ticks get their own formatter: at most four glyphs ("197M", "49M",
		 * "980k"). `short()` may emit a decimal ("49.2M"), which is wide enough to
		 * crowd or wrap in the 34px axis gutter at 11px.
		 *
		 * Units keep escalating (k → M → B → T) instead of stopping at M, because a
		 * fixed suffix would turn a growing total into "9400M" — five glyphs, wide
		 * enough to collide with the label above and below it.
		 *
		 * One decimal below 100 ("9.4B", "12.5M"), integers at or above it ("214M"),
		 * and step up a unit the moment rounding would need a fifth glyph
		 * ("1000M" → "1B"). The decimal band has to reach 100, not 10: the middle
		 * tick is exactly half the top one, and half of 25M is 12.5M — rounding that
		 * to "13M" would put a gridline in the wrong place.
		 */
		function axisShort(value) {
			const n = Number(value) || 0;
			if (n < 1000) return String(Math.round(n));
			const units = ["k", "M", "B", "T"];
			let scaled = n / 1e3;
			let unit = 0;
			while (unit < units.length - 1 && Math.round(scaled) >= 1000) {
				scaled /= 1000;
				unit += 1;
			}
			const text = scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, "") : String(Math.round(scaled));
			return `${text}${units[unit]}`;
		}

		/** `2026-11-06` → `11/6`: the axis needs a date, not a full stamp. */
		function monthDay(date) {
			const parts = String(date).split("-");
			if (parts.length !== 3) return date;
			return `${Number(parts[1])}/${Number(parts[2])}`;
		}

		function hourLabel(hour, t) {
			const value = hour % 12 === 0 ? 12 : hour % 12;
			return t(hour < 12 ? "hourAm" : "hourPm", { hour: value });
		}

		// --- data -----------------------------------------------------------------

		// One shared snapshot for the chip and the panel. It is POLLED, not read
		// once at mount: a mount-only fetch left the header chip frozen on the
		// value it happened to see at page load, which is why it never updated
		// after the app started.
		let cache = { at: 0, value: null };
		let inflight = null;
		const listeners = new Set();
		/** Cold start: the host answers `computing` before its first scan ends. */
		const COLD_RETRY_MS = 1200;
		/** Stop chasing a scan that never finishes; the poll picks it up later. */
		const COLD_RETRIES = 8;
		let coldTimer = null;

		function publish(value) {
			cache = { at: Date.now(), value };
			for (const listener of listeners) {
				try {
					listener(value);
				} catch {
					// A broken subscriber must not stop the others.
				}
			}
		}

		function loadUsage(options) {
			const force = options?.force === true;
			const depth = options?.depth ?? 0;
			const now = Date.now();
			if (!force && cache.value !== null && now - cache.at < TTL_MS) return Promise.resolve(cache.value);
			if (inflight !== null) return inflight;
			inflight = fetch(ROUTE, { headers: { accept: "application/json" }, cache: "no-store" })
				.then((response) => (response.ok ? response.json() : null))
				.then((payload) => {
					if (payload === null || payload.ok !== true) return cache.value;
					if (payload.value !== undefined && payload.value !== null) {
						publish(payload.value);
						return payload.value;
					}
					// Still computing on the host: come back for the real numbers
					// instead of leaving the UI empty until the next poll.
					if (payload.computing === true && depth < COLD_RETRIES) {
						if (coldTimer !== null) clearTimeout(coldTimer);
						coldTimer = setTimeout(() => {
							coldTimer = null;
							void loadUsage({ force: true, depth: depth + 1 });
						}, COLD_RETRY_MS);
					}
					return cache.value;
				})
				.catch(() => cache.value)
				.finally(() => {
					inflight = null;
				});
			return inflight;
		}

		function useUsage() {
			const [value, setValue] = useState(cache.value);
			useEffect(() => {
				let live = true;
				const onUpdate = (next) => {
					if (live) setValue(next);
				};
				listeners.add(onUpdate);
				if (cache.value !== null) setValue(cache.value);
				void loadUsage();
				// Freshness: poll, and refetch the moment the window is shown again
				// (a tab restored from the background must not show stale totals).
				const timer = setInterval(() => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					void loadUsage({ force: true });
				}, TTL_MS);
				const wake = () => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					void loadUsage({ force: true });
				};
				window.addEventListener("focus", wake);
				document.addEventListener("visibilitychange", wake);
				return () => {
					live = false;
					listeners.delete(onUpdate);
					clearInterval(timer);
					if (coldTimer !== null) {
						clearTimeout(coldTimer);
						coldTimer = null;
					}
					window.removeEventListener("focus", wake);
					document.removeEventListener("visibilitychange", wake);
				};
			}, []);
			return value;
		}

		// --- math -----------------------------------------------------------------

		function windowStart(days) {
			if (days === 0) return null;
			const anchor = new Date();
			anchor.setHours(0, 0, 0, 0);
			anchor.setDate(anchor.getDate() - (days - 1));
			return dayOf(anchor);
		}

		function within(date, floor) {
			return floor === null || date >= floor;
		}

		/**
		 * The 模型 chart window: the chosen range, capped at CHART_DAYS. 全部 has no
		 * floor of its own, so it shows the same trailing 30 days the reference
		 * plugin uses — a 26-week axis would squeeze every bar to a hairline.
		 */
		function chartDates(days) {
			const span = days > 0 ? Math.min(days, CHART_DAYS) : CHART_DAYS;
			const dates = [];
			const cursor = new Date();
			cursor.setHours(0, 0, 0, 0);
			cursor.setDate(cursor.getDate() - (span - 1));
			for (let index = 0; index < span; index += 1) {
				dates.push(dayOf(cursor));
				cursor.setDate(cursor.getDate() + 1);
			}
			return dates;
		}

		/** Totals, trend and heat grid for the chosen range. */
		function summarize(usage, days) {
			const empty = {
				ready: false,
				since: null,
				tokens: 0,
				calls: null,
				sessions: null,
				activeDays: null,
				peakHour: null,
				topModel: null,
				grid: buildGrid([], null),
				modelDays: [],
				models: [],
				rankOf: new Map(),
			};
			if (usage === null || usage === undefined) return empty;
			const floor = windowStart(days);
			let tokens = 0;
			let calls = 0;
			let activeDays = 0;
			const seen = new Set();
			const hours = new Array(24).fill(0);
			const byDay = new Map();
			const models = new Map();
			const stacked = [];
			for (const day of Array.isArray(usage.days) ? usage.days : []) {
				byDay.set(day.date, tokensOf(day));
				if (!within(day.date, floor)) continue;
				tokens += tokensOf(day);
				calls += Number(day.calls) || 0;
				activeDays += 1;
				if (Array.isArray(day.sessionIds)) for (const id of day.sessionIds) seen.add(id);
				if (Array.isArray(day.hours)) for (let hour = 0; hour < 24; hour += 1) hours[hour] += Number(day.hours[hour]) || 0;
				const perModel = day.models !== null && typeof day.models === "object" ? day.models : {};
				for (const name of Object.keys(perModel)) {
					const bucket = perModel[name];
					// Per-day stacks for the 模型 tab chart.
					stacked.push({ date: day.date, model: name, tokens: tokensOf(bucket), input: Number(bucket.input) || 0, output: Number(bucket.output) || 0, calls: Number(bucket.calls) || 0 });
					let entry = models.get(name);
					if (entry === undefined) {
						entry = { model: name, tokens: 0, input: 0, output: 0, calls: 0, sessions: 0 };
						models.set(name, entry);
					}
					entry.tokens += tokensOf(bucket);
					entry.input += Number(bucket.input) || 0;
					entry.output += Number(bucket.output) || 0;
					entry.calls += Number(bucket.calls) || 0;
					entry.sessions += 1;
				}
			}
			let peakHour = null;
			let peakCount = 0;
			for (let hour = 0; hour < 24; hour += 1) {
				if (hours[hour] > peakCount) {
					peakCount = hours[hour];
					peakHour = hour;
				}
			}
			const ranked = [...models.values()].sort((a, b) => b.tokens - a.tokens);
			const rankOf = new Map(ranked.map((entry, index) => [entry.model, index]));
			return {
				ready: true,
				since: floor,
				tokens,
				calls,
				sessions: seen.size,
				activeDays,
				peakHour,
				topModel: ranked.length === 0 ? null : ranked[0].model,
				grid: buildGrid([...byDay.entries()], floor),
				modelDays: buildModelDays(stacked, rankOf, chartDates(days)),
				models: ranked,
				rankOf,
			};
		}

		/**
		 * Week columns × 7 rows. The grid is ALWAYS exactly WEEKS columns wide: the
		 * last column is the current week and the days after today are future
		 * placeholders. Ending the grid on "today" made its width depend on the
		 * weekday (182..188 cells), so the whole calendar crept sideways every
		 * single day; anchored to weeks it only advances one column on Sunday and
		 * its footprint never changes.
		 *
		 * With a range floor, the days before that floor are dimmed instead of
		 * removed, so 30 天 and 7 天 keep the same silhouette. A day without a
		 * record stays a zero cell: an empty square means "no usage", not "no
		 * data".
		 */
		function buildGrid(entries, floor) {
			const byDay = new Map(entries);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const head = new Date(today);
			head.setDate(head.getDate() - head.getDay());
			head.setDate(head.getDate() - (WEEKS - 1) * 7);
			const tail = new Date(head);
			tail.setDate(tail.getDate() + WEEKS * 7 - 1);
			const cells = [];
			let peak = 0;
			for (const cursor = new Date(head); cursor <= tail; cursor.setDate(cursor.getDate() + 1)) {
				const date = dayOf(cursor);
				const future = cursor > today;
				const inWindow = !future && within(date, floor);
				const tokens = inWindow ? byDay.get(date) ?? 0 : 0;
				if (tokens > peak) peak = tokens;
				cells.push({ date, tokens, level: 0, dim: future || !inWindow, future });
			}
			for (const cell of cells) {
				if (cell.tokens > 0 && peak > 0) cell.level = Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((cell.tokens / peak) * HEAT_LEVELS)));
			}
			return { cells, peak };
		}

		/**
		 * One stacked column per day for the 模型 tab: each day's tokens split by
		 * model, in the model's overall rank order so a colour keeps its slot.
		 * `dates` is the full window (empty days included), so the bar width and
		 * the x axis follow 全部 / 30 天 / 7 天 instead of only showing days that
		 * happen to have records.
		 */
		function buildModelDays(stacked, rankOf, dates) {
			const byDate = new Map();
			for (const entry of stacked) {
				if (!(entry.tokens > 0)) continue;
				let row = byDate.get(entry.date);
				if (row === undefined) {
					row = { date: entry.date, stack: [], tokens: 0 };
					byDate.set(entry.date, row);
				}
				row.stack.push(entry);
				row.tokens += entry.tokens;
			}
			const rows = (Array.isArray(dates) && dates.length > 0 ? dates : [...byDate.keys()].sort()).map((date) => byDate.get(date) ?? { date, stack: [], tokens: 0 });
			rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
			for (const row of rows) row.stack.sort((a, b) => (rankOf.get(a.model) ?? 99) - (rankOf.get(b.model) ?? 99));
			return rows;
		}

		function bookLine(tokens, lang) {
			if (!(tokens > 0)) return null;
			let index = Math.min(BOOKS.length - 1, Math.floor((tokens / BOOKS[BOOKS.length - 1].token) * BOOKS.length));
			while (index >= 0 && tokens < BOOKS[index].token) index -= 1;
			if (index < 0) return null;
			const book = BOOKS[index];
			return { count: commas(Math.round(tokens / book.token)), name: lang.startsWith("zh") ? book.zh : book.en };
		}

		// --- styles ---------------------------------------------------------------

		const STYLE_ID = "dsh-token-usage-heatmap-style";
		const CSS = `
.ts-root{--ts-cell:13px;--ts-gap:3px;--ts-axis:34px;--ts-view:156px;box-sizing:border-box;width:min(480px,calc(100% - 32px));margin:0 auto;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);overflow:hidden;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.35;min-width:0}
.ts-handle{appearance:none;display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;background:transparent;border:0;border-bottom:1px solid transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;padding:6px 12px;text-align:left;cursor:pointer;transition:background 120ms ease,color 120ms ease}
.ts-handle:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-primary)}
.ts-handle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ts-root[data-open="true"] .ts-handle{border-bottom-color:var(--dsw-alias-border-l2)}
.ts-handle-title{flex:0 0 auto;font-weight:500}
.ts-handle-value{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-handle-meta{flex:0 0 auto;color:var(--dsw-alias-label-tertiary);font-size:11px}
.ts-chev{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1}
/* Opaque step colours, one variable per level, so a level can never end up a
   near-background tint through alpha compositing. Light is the default; the
   dark ladder keys on the shell's own theme attribute, NOT prefers-color-scheme
   — the in-app switch can disagree with the OS setting. */
.ts-root{--ts-heat-1:${HEAT_LIGHT[0]};--ts-heat-2:${HEAT_LIGHT[1]};--ts-heat-3:${HEAT_LIGHT[2]};--ts-heat-4:${HEAT_LIGHT[3]};--ts-heat-ink:${HEAT_LIGHT[3]}}
body[data-ds-dark-theme] .ts-root{--ts-heat-1:${HEAT_DARK[0]};--ts-heat-2:${HEAT_DARK[1]};--ts-heat-3:${HEAT_DARK[2]};--ts-heat-4:${HEAT_DARK[3]};--ts-heat-ink:${HEAT_DARK[3]}}
.ts-body{display:flex;flex-direction:column;gap:9px;min-width:0;padding:10px 12px 11px}
/* Fixed-height view box: switching tab or range must never resize the panel,
   so the 26-week grid, the 30/7-day grid and the model chart all share one
   frame. Content taller than the frame scrolls inside it, never the panel.
   box-sizing:border-box lets the 模型 tab reserve a top gutter inside the
   frame — the 100% tick label is centred on the top gridline and hangs half a
   line ABOVE the plot, and block-start overflow is unreachable by scrolling. */
.ts-view{box-sizing:border-box;height:var(--ts-view);display:flex;flex-direction:column;gap:9px;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}
/* The heat grid fits inside the frame with slack, so it may overflow visibly
   and let the hover tip escape instead of being clipped. */
.ts-view[data-tab=overview]{justify-content:center;overflow:visible}
/* The 模型 tab never scrolls as a whole: the chart is a fixed block and only
   the model list below it scrolls. Scrolling the whole tab meant the peak bar
   and its 100% tick could be pushed past the frame's top edge — and block-start
   overflow cannot be scrolled back into view.
   No overflow here on purpose: the topmost tick is absolutely positioned at
   bottom:100%, so it hangs ABOVE the plot's border box. Any clipping wrapper
   between it and the gutter cuts that label in half — and because it overflows
   at the block start, scrolling can never reveal it. The wrapper therefore stays
   visible; only .ts-list (which clips its own rows, downwards) scrolls. */
.ts-view[data-tab=models]{padding-top:10px;overflow:visible}
.ts-head{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.ts-tabs{display:flex;align-items:center;gap:2px;flex:none}
.ts-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:3px 8px;border-radius:6px;cursor:pointer}
.ts-tab[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--dsw-alias-label-primary)}
.ts-ranges{display:flex;align-items:center;gap:2px;margin-left:auto;flex:none}
.ts-range{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;padding:3px 8px;border-radius:6px;cursor:pointer}
.ts-range[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--dsw-alias-label-primary)}
.ts-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.ts-stat{display:flex;flex-direction:column;gap:1px;padding:5px 7px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);min-width:0}
.ts-stat-label{font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-stat-value{font-size:12px;line-height:16px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-stat-value[data-empty=true]{color:var(--dsw-alias-label-tertiary);font-weight:400}
.ts-heat{position:relative;display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,var(--ts-cell));grid-auto-columns:var(--ts-cell);gap:var(--ts-gap);justify-content:center;align-content:start;padding-top:2px}
.ts-heat-cell{width:var(--ts-cell);height:var(--ts-cell);border-radius:2px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);cursor:default;transition:background-color 140ms ease}
/* Days outside the selected range stay in place as faint squares, so the grid
   silhouette is identical for 全部 / 30 天 / 7 天. */
.ts-heat-cell[data-dim=true]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent)}
.ts-heat-cell[data-dim=true]:hover{outline-color:var(--dsw-alias-border-l2)}
.ts-heat-cell:hover{outline:1.5px solid color-mix(in srgb, var(--ts-heat-ink) 55%, transparent);outline-offset:1px}
.ts-heat-cell[data-level="1"]{background:var(--ts-heat-1)}
.ts-heat-cell[data-level="2"]{background:var(--ts-heat-2)}
.ts-heat-cell[data-level="3"]{background:var(--ts-heat-3)}
.ts-heat-cell[data-level="4"]{background:var(--ts-heat-4)}
.ts-heat-cell[data-level="0"]:hover{outline-color:var(--dsw-alias-border-l2)}
.ts-tip{position:absolute;top:2px;transform:translate(-50%,0);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);border-radius:6px;padding:3px 7px;font-size:11px;line-height:14px;white-space:nowrap;pointer-events:none;z-index:2;box-shadow:0 4px 14px rgb(0 0 0 / 18%)}
/* Portalled tip: fixed to the viewport and above every shell layer, so a tip on
   an edge cell is never clipped by the card or covered by the composer dock. */
.ts-tip-float{position:fixed;top:auto;transform:translate(-50%,-100%);z-index:2147483000;color:var(--dsw-alias-bg-base);box-shadow:0 6px 20px rgb(0 0 0 / 28%);border:1px solid color-mix(in srgb, var(--dsw-alias-bg-base) 30%, transparent)}
.ts-tip-below{transform:translate(-50%,0)}
.ts-fun{font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary)}
/* overflow stays visible here: this is the box whose top edge the 100% tick
   overhangs, so hidden clipped the label exactly in half. The list below owns
   its own scrolling, so nothing else needs clipping. */
.ts-models{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow:visible}
/* Only the list scrolls: the chart above it keeps its full height, so the peak
   bar and its 100% tick can never be pushed past the frame's top edge (block
   start overflow is unreachable by scrolling). */
.ts-chart{display:flex;flex-direction:column;gap:5px;flex:none;overflow:visible}
.ts-chart-plot{position:relative;height:48px;margin-left:var(--ts-axis)}
.ts-chart-grid{position:absolute;left:0;right:0;border-top:0.5px dashed var(--dsw-alias-border-l2)}
/* Axis labels are one line, always: nowrap plus a width wide enough for the
   longest compact tick ("196M"), so a big number can never wrap onto a second
   line and collide with the label below it. */
.ts-chart-tick{position:absolute;left:calc(-1 * var(--ts-axis));width:calc(var(--ts-axis) - 6px);transform:translateY(50%);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:13px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-0.1px}
.ts-chart-bars{position:absolute;inset:0;display:flex;align-items:flex-end;gap:2px}
.ts-chart-col{display:flex;flex:1 1 0;flex-direction:column;justify-content:flex-end;min-width:2px;border-radius:2px;overflow:hidden}
.ts-chart-seg{display:block;width:100%;min-height:0}
.ts-chart-axis{display:flex;justify-content:space-between;margin-left:var(--ts-axis);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:13px;white-space:nowrap}
.ts-chart-axis>span{white-space:nowrap}
.ts-chart-axis-mid{color:var(--dsw-alias-label-tertiary)}
.ts-list{display:flex;flex-direction:column;gap:4px;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}
.ts-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;line-height:16px}
.ts-swatch{width:7px;height:7px;border-radius:2px;flex:none}
.ts-row-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.ts-row-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ts-row-share{flex:0 0 38px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ts-empty{font-size:12px;color:var(--dsw-alias-label-secondary);padding:5px 0}
.ts-more{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:2px 0;cursor:pointer;text-align:left;flex:none}
.ts-chip{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;padding:4px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:5px;cursor:default;white-space:nowrap;margin-left:8px}
.ts-chip b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
/* The chip lives in the session header, outside .ts-root, so it cannot inherit
   the heat variables — give the dot its own per-theme colour. */
.ts-chip-dot{width:5px;height:5px;border-radius:50%;background:${HEAT_LIGHT[3]};flex:none}
body[data-ds-dark-theme] .ts-chip-dot{background:${HEAT_DARK[3]}}
.ts-settings{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.ts-settings-head{font-size:13px;font-weight:600;padding:6px 0 2px}
.ts-setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:9px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.ts-setting-text{min-width:0}
.ts-setting-title{font-size:13px}
.ts-setting-hint{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.ts-switch{appearance:none;flex:none;width:34px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);position:relative;cursor:pointer;transition:background 120ms ease}
.ts-switch[data-on="true"]{background:var(--dsw-alias-brand-primary);border-color:transparent}
.ts-switch:disabled{opacity:0.5;cursor:default}
.ts-switch-knob{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform 120ms ease}
.ts-switch[data-on="true"] .ts-switch-knob{transform:translateX(14px)}
`;

		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const node = document.createElement("style");
			node.id = STYLE_ID;
			node.textContent = CSS;
			document.head.appendChild(node);
		}

		// --- components -----------------------------------------------------------

		/** Read one Host flag and re-render when the accepted config changes. */
		function useFlag(field) {
			const [flags, setFlags] = useState(hostFlags);
			const form = forms.size === 0 ? undefined : [...forms][0];
			useEffect(() => {
				if (form === undefined) return undefined;
				const sync = () => setFlags(readFlags(form.getSnapshot()));
				sync();
				return typeof form.subscribe === "function" ? form.subscribe(sync) : undefined;
			}, [form]);
			return flags[field] !== false;
		}

		function StatCell(props) {
			return h(
				"div",
				{ className: "ts-stat" },
				h("span", { className: "ts-stat-label" }, props.label),
				h("span", { className: "ts-stat-value", "data-empty": props.value === null || props.value === undefined ? "true" : "false" }, props.value ?? "—"),
			);
		}

		function HeatGrid(props) {
			const { grid, t } = props;
			const [tip, setTip] = useState(null);
			// The tooltip is positioned in VIEWPORT coordinates and rendered through
			// a portal on document.body: inside the card it was cut off by the
			// rounded `overflow:hidden` edge and drawn under the composer dock.
			// Portalled to document.body so the rounded card's overflow and the
			// composer dock can never clip it. Without a portal the native `title`
			// attribute still gives the value, so no broken inline copy is drawn.
			const tipNode =
				tip === null || createPortal === null
					? null
					: createPortal(
							h(
								"div",
								{
									className: `ts-tip ts-tip-float${tip.below ? " ts-tip-below" : ""}`,
									style: { left: `${tip.left}px`, top: `${tip.top}px` },
								},
								t("heatTip", { date: tip.date, tokens: commas(tip.tokens) }),
							),
							document.body,
						);
			// Flat cells: the container is a 7-row grid that flows by column, so a
			// day lands in its own column automatically and every view (26 weeks,
			// 30 days, 7 days) uses the identical --ts-cell square.
			return h(
				"div",
				{ className: "ts-heat", onMouseLeave: () => setTip(null) },
				grid.cells.map((cell) =>
					h("div", {
						key: cell.date,
						className: "ts-heat-cell",
						"data-level": cell.level,
						"data-dim": cell.dim ? "true" : "false",
						// Our own tip replaces the native one; keep `title` only as a
						// fallback so the two never pop up at the same time.
						title: createPortal === null ? t("heatTip", { date: cell.date, tokens: commas(cell.tokens) }) : undefined,
						onMouseEnter: (event) => {
							const rect = event.currentTarget.getBoundingClientRect();
							// Half the tip's max width, so an edge cell's tip shifts inwards
							// instead of running past the window edge.
							const half = 82;
							const left = Math.min(Math.max(rect.left + rect.width / 2, half), Math.max(window.innerWidth - half, half));
							// Above the cell, unless there is no room there (the panel can sit
							// high on the page) — then it drops below the cell.
							const below = rect.top < 34;
							setTip({ date: cell.date, tokens: cell.tokens, left, top: below ? rect.bottom + 4 : rect.top - 4, below });
						},
					}),
				),
				tipNode,
			);
		}

		/** Inverse of axisShort, used only to prove a tick label is exact. */
		function axisValue(label) {
			const match = /^([\d.]+)(k|M|B|T)?$/.exec(String(label));
			if (match === null) return Number.NaN;
			const scale = match[2] === undefined ? 1 : { k: 1e3, M: 1e6, B: 1e9, T: 1e12 }[match[2]];
			return Number(match[1]) * scale;
		}

		/** True when axisShort prints `value` without rounding it away. */
		function axisExact(value) {
			return Math.abs(axisValue(axisShort(value)) - value) <= Math.abs(value) * 1e-9;
		}

		/**
		 * The axis gutter is 34px, which holds four glyphs at 11px ("214M"). A
		 * five-glyph label ("12.5M") overflows it, so candidate maxima that would
		 * print five-glyph labels are rejected outright rather than shrinking the
		 * chart to make room.
		 */
		function axisFits(value) {
			return axisShort(value).length <= 4;
		}

		/**
		 * The chart's top gridline. It must never sit below the tallest bar, so the
		 * axis maximum is rounded UP to a round step instead of being the raw peak:
		 * a peak of 213,966,470 labels as "214M" (which is really 214,000,000 — just
		 * under the true peak under a rounding formatter) and the bar would then
		 * reach past the top line. A nice maximum of 250,000,000 is both exact and
		 * comfortably above the peak.
		 *
		 * A candidate is only accepted when its own label and the label of the
		 * half-way tick both survive axisShort unchanged and fit the gutter: 25M
		 * gives "25M" and "12.5M", but 12.5M is five glyphs, so that candidate is
		 * skipped in favour of 30M / "15M". Costs a little headroom, keeps every
		 * tick honest and readable.
		 */
		function niceMax(value) {
			const n = Number(value) || 0;
			if (!(n > 0)) return 0;
			const magnitude = 10 ** Math.floor(Math.log10(n));
			const scaled = n / magnitude;
			const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
			for (const step of steps) {
				const candidate = Math.round(step * magnitude);
				if (scaled <= step + 1e-9 && axisExact(candidate) && axisExact(candidate / 2) && axisFits(candidate) && axisFits(candidate / 2)) {
					return candidate;
				}
			}
			return Math.round(10 * magnitude);
		}

		/**
		 * The 模型 tab chart: one column per day, each column stacked by model in
		 * rank order, with token gridlines on the left and a date axis below.
		 */
		function ModelChart(props) {
			const { rows, rankOf, t } = props;
			if (rows.length === 0) return h("div", { className: "ts-empty" }, t("modelsEmpty"));
			const peak = rows.reduce((max, row) => Math.max(max, row.tokens), 0);
			// Bars are measured against the rounded-up maximum, never against the raw
			// peak, so the tallest bar stays strictly inside the plot.
			const axisMax = niceMax(peak);
			// Exactly three ticks, forever: 0 / half / max. Five ticks at this plot
			// height (48px) put labels 12px apart, and a six-digit value would collide
			// with the one below it as usage keeps growing. Three is stable no matter
			// how large the numbers get.
			const gridlines = [0, 0.5, 1];
			const first = rows[0].date;
			const last = rows[rows.length - 1].date;
			const middle = rows.length > 8 ? rows[Math.floor((rows.length - 1) / 2)].date : null;
			return h(
				"div",
				{ className: "ts-chart" },
				h(
					"div",
					{ className: "ts-chart-plot" },
					gridlines.map((fraction) =>
						h("div", { key: `line${fraction}`, className: "ts-chart-grid", style: { bottom: `${fraction * 100}%` } }),
					),
					gridlines.map((fraction) => {
						// Whole, compact labels ("197M", "49M"): a decimal like "49.2M"
						// is wide enough to crowd or wrap the 34px axis gutter.
						const text = axisMax <= 0 ? "" : axisShort(axisMax * fraction);
						return h("div", { key: `tick${fraction}`, className: "ts-chart-tick", style: { bottom: `${fraction * 100}%` } }, text);
					}),
					h(
						"div",
						{ className: "ts-chart-bars" },
						rows.map((row) =>
							h(
								"div",
								{
									key: row.date,
									className: "ts-chart-col",
									title: t("heatTip", { date: row.date, tokens: commas(row.tokens) }),
									style: { height: `${axisMax > 0 ? (row.tokens / axisMax) * 100 : 0}%` },
								},
								row.stack.map((entry) =>
									h("div", {
										key: entry.model,
										className: "ts-chart-seg",
										style: {
											height: `${row.tokens > 0 ? (entry.tokens / row.tokens) * 100 : 0}%`,
											background: MODEL_SERIES[(rankOf.get(entry.model) ?? 99) % MODEL_SERIES.length],
										},
									}),
								),
							),
						),
					),
				),
				h(
					"div",
					{ className: "ts-chart-axis" },
					h("span", null, monthDay(first)),
					middle === null ? null : h("span", { className: "ts-chart-axis-mid" }, monthDay(middle)),
					rows.length > 1 ? h("span", null, monthDay(last)) : null,
				),
			);
		}

		function Panel(props) {
			const t = props.t;
			useEffect(() => {
				ensureStyle();
			}, []);
			const usage = useUsage();
			const [tab, setTab] = useState("overview");
			const [range, setRange] = useState("all");
			const [expanded, setExpanded] = useState(false);
			const lang = dictionaryLocale ?? "zh-CN";
			const days = useMemo(() => RANGES.find((entry) => entry.id === range)?.days ?? 0, [range]);
			const stats = useMemo(() => summarize(usage, days), [usage, days]);
			const book = useMemo(() => bookLine(stats.tokens, lang), [stats.tokens, lang]);
			// Three rows fit the fixed view box beside the chart; the rest sit
			// behind the "more" toggle so the panel never has to grow.
			const visibleModels = expanded ? stats.models : stats.models.slice(0, MODEL_ROWS);

			const cells = [
				{ id: "sessions", label: t("sessions"), value: stats.sessions === null ? null : commas(stats.sessions) },
				{ id: "calls", label: t("calls"), value: stats.calls === null ? null : commas(stats.calls) },
				{ id: "tokens", label: t("tokens"), value: stats.ready ? short(stats.tokens) : null },
				{ id: "activeDays", label: t("activeDays"), value: stats.activeDays === null ? null : commas(stats.activeDays) },
				{ id: "peakHour", label: t("peakHour"), value: stats.peakHour === null ? null : hourLabel(stats.peakHour, t) },
				{ id: "topModel", label: t("topModel"), value: stats.topModel },
			];

			const [open, toggle] = usePanelOpen();
			const rangeLabel = t(range === "all" ? "rangeAll" : range === "30d" ? "range30d" : "range7d");
			// The whole top strip is the collapse control: a wide hit area beats a
			// small chevron in the corner.
			const handle = h(
				"button",
				{
					type: "button",
					className: "ts-handle",
					onClick: () => toggle(!open),
					title: open ? t("collapse") : t("expand"),
					"aria-expanded": String(open),
					"aria-label": open ? t("collapse") : t("expand"),
				},
				h("span", { className: "ts-chev" }, open ? "▾" : "▸"),
				h("span", { className: "ts-handle-title" }, t("panelTitle")),
				open ? null : h("span", { className: "ts-handle-value" }, stats.ready ? short(stats.tokens) : "—"),
				h("span", { className: "ts-handle-meta" }, open ? "" : rangeLabel),
			);

			const body = open
				? h(
						"div",
						{ className: "ts-body" },
						h(
							"div",
							{ className: "ts-head" },
							h(
								"div",
								{ className: "ts-tabs", role: "tablist" },
								h("button", { type: "button", className: "ts-tab", "data-active": String(tab === "overview"), role: "tab", onClick: () => setTab("overview") }, t("tabOverview")),
								h("button", { type: "button", className: "ts-tab", "data-active": String(tab === "models"), role: "tab", onClick: () => setTab("models") }, t("tabModels")),
							),
							h(
								"div",
								{ className: "ts-ranges", role: "group", "aria-label": t("settingsTitle") },
								RANGES.map((entry) =>
									h("button", {
										key: entry.id,
										type: "button",
										className: "ts-range",
										"data-active": String(range === entry.id),
										"aria-pressed": String(range === entry.id),
										onClick: () => setRange(entry.id),
									}, t(entry.id === "all" ? "rangeAll" : entry.id === "30d" ? "range30d" : "range7d")),
								),
							),
						),
						h("div", { className: "ts-stats" }, cells.map((cell) => h(StatCell, { key: cell.id, label: cell.label, value: cell.value }))),
						h(
							"div",
							{ className: "ts-view", "data-tab": tab },
							tab === "overview"
								? h(HeatGrid, { grid: stats.grid, t })
								: h(
									"div",
									{ className: "ts-models" },
									h(ModelChart, { rows: stats.modelDays, rankOf: stats.rankOf, t }),
									visibleModels.length === 0
										? h("div", { className: "ts-empty" }, t("modelsEmpty"))
										: h(
											"div",
											{ className: "ts-list" },
											visibleModels.map((model) =>
												h(
													"div",
													{ className: "ts-row", key: model.model },
													h("span", { className: "ts-swatch", style: { background: MODEL_SERIES[(stats.rankOf.get(model.model) ?? 99) % MODEL_SERIES.length] } }),
													h("span", { className: "ts-row-name" }, model.model),
													h("span", { className: "ts-row-meta" }, `${short(model.tokens)} · ${t("modelSessions", { count: model.sessions })}`),
													h("span", { className: "ts-row-share" }, stats.tokens > 0 ? `${Math.round((model.tokens / stats.tokens) * 100)}%` : ""),
												),
											),
										),
									// Outside the scrolling list so "更多/收起" stays reachable
									// however far the rows scroll.
									stats.models.length > MODEL_ROWS
										? h("button", { type: "button", className: "ts-more", onClick: () => setExpanded((value) => !value) }, expanded ? t("modelsLess") : t("modelsMore", { count: stats.models.length - MODEL_ROWS }))
										: null,
								),
						),
						book === null ? null : h("div", { className: "ts-fun" }, t("funBook", { count: book.count, book: book.name })),
					)
				: null;

			return h("div", { className: "ts-root", "data-dsh-token-usage-heatmap": "", "data-open": String(open) }, handle, body);
		}

		/**
		 * The dock entry, gated by the two panel switches. A conversation that is
		 * past its blank phase only shows the panel when `sessionPanel` is on.
		 */
		function DockGate(props) {
			const t = props.t;
			const showNew = useFlag("newSessionPanel");
			const showSession = useFlag("sessionPanel");
			const session = props.session;
			const blank = session === undefined || session === null || session.blank === true;
			const allowed = blank ? showNew : showSession;
			if (!allowed) return null;
			return h(Panel, { t });
		}

		/** The header entry, gated by the chip switch. */
		function ChipGate(props) {
			const show = useFlag("headerChip");
			if (!show) return null;
			return h(Chip, { t: props.t });
		}

		/** One preference row: title, hint, and a switch that writes the Host config. */
		function SwitchRow(props) {
			const t = props.t;
			const checked = useFlag(props.field);
			const [busy, setBusy] = useState(false);
			return h(
				"div",
				{ className: "ts-setting" },
				h(
					"div",
					{ className: "ts-setting-text" },
					h("div", { className: "ts-setting-title" }, t(props.field)),
					h("div", { className: "ts-setting-hint" }, t(`${props.field}Hint`)),
				),
				h(
					"button",
					{
						type: "button",
						role: "switch",
						"aria-checked": String(checked),
						"aria-label": t(props.field),
						className: "ts-switch",
						"data-on": String(checked),
						disabled: busy || forms.size === 0,
						onClick: async () => {
							setBusy(true);
							await writeFlag(props.field, !checked);
							setBusy(false);
						},
					},
					h("span", { className: "ts-switch-knob" }),
				),
			);
		}

		/** The Settings → General block for this bundle. */
		function SettingsRows(props) {
			useEffect(() => {
				ensureStyle();
			}, []);
			const t = props.t;
			return h(
				"div",
				{ className: "ts-settings", "data-dsh-token-usage-heatmap-settings": "" },
				h("div", { className: "ts-settings-head" }, t("settingsTitle")),
				h(SwitchRow, { t, field: "headerChip" }),
				h(SwitchRow, { t, field: "newSessionPanel" }),
				h(SwitchRow, { t, field: "sessionPanel" }),
			);
		}

		function Chip(props) {
			useEffect(() => {
				ensureStyle();
			}, []);
			const usage = useUsage();
			const t = props.t;
			const total = usage === null || usage === undefined ? null : tokensOf(usage.totals ?? {});
			return h(
				"span",
				{ className: "ts-chip", "data-dsh-token-usage-heatmap-chip": "", title: t("panelTitle") },
				h("span", { className: "ts-chip-dot" }),
				total === null ? t("chipNoData") : h("b", null, short(total)),
			);
		}

		// --- dictionaries ---------------------------------------------------------

		let dictionaryLocale = null;
		const dictionaries = { zh, en };

		function pick(localeId) {
			return String(localeId).toLowerCase().startsWith("zh") ? dictionaries.zh : dictionaries.en;
		}

		function translate(dict, key, params) {
			const template = dict[key] ?? key;
			if (params === undefined) return template;
			return template.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
		}

		function withI18n(Component) {
			return function Bound(props) {
				const [localeId, setLocaleId] = useState(dictionaryLocale);
				useEffect(() => {
					DICT_SUBSCRIBERS.add(setLocaleId);
					return () => {
						DICT_SUBSCRIBERS.delete(setLocaleId);
					};
				}, []);
				const dict = pick(localeId ?? "zh-CN");
				return h(Component, { ...props, t: (key, params) => translate(dict, key, params) });
			};
		}

		// A language switch must reach every mounted panel: the bundle carries
		// both dictionaries instead of registering one locale namespace.
		const DICT_SUBSCRIBERS = new Set();

		// --- host configuration ---------------------------------------------------

		/** Last accepted Host config, so a slot injector can read flags synchronously. */
		let hostFlags = { ...DEFAULT_FLAGS };
		/** One form controller per mounted surface; only Settings writes through it. */
		const forms = new Set();

		function readFlags(snapshot) {
			const value = snapshot !== null && typeof snapshot === "object" ? snapshot.value : undefined;
			const source = value !== null && typeof value === "object" ? value : {};
			return {
				headerChip: source.headerChip !== false,
				newSessionPanel: source.newSessionPanel !== false,
				sessionPanel: source.sessionPanel !== false,
			};
		}

		function trackForm(ctx) {
			const configForms = ctx.get("configForms");
			if (configForms === undefined || typeof configForms.get !== "function") return;
			let form;
			try {
				form = configForms.get(NS);
			} catch {
				return;
			}
			if (form === undefined || form === null) return;
			forms.add(form);
			const sync = () => {
				hostFlags = readFlags(form.getSnapshot());
			};
			sync();
			if (typeof form.subscribe === "function") ctx.effect(() => form.subscribe(sync), "token-usage-heatmap: config");
		}

		/** Write one switch, then re-read the accepted value. */
		async function writeFlag(field, value) {
			for (const form of forms) {
				try {
					await form.set(field, value);
					hostFlags = readFlags(form.getSnapshot());
				} catch {
					// A refused write leaves the previous value visible.
				}
				return;
			}
		}

		// --- panel disclosure -----------------------------------------------------

		let panelOpen = null;
		const OPEN_SUBSCRIBERS = new Set();

		function readStoredOpen() {
			try {
				const raw = window.localStorage.getItem(STORE_KEY);
				return raw === null ? true : raw !== "0";
			} catch {
				return true;
			}
		}

		function setPanelOpen(next) {
			panelOpen = next;
			try {
				window.localStorage.setItem(STORE_KEY, next ? "1" : "0");
			} catch {
				// A blocked storage keeps the in-memory value only.
			}
			for (const notify of [...OPEN_SUBSCRIBERS]) {
				try {
					notify(next);
				} catch {
					// One broken subscriber must not stop the others.
				}
			}
		}

		function usePanelOpen() {
			const [open, setOpen] = useState(panelOpen ?? readStoredOpen());
			useEffect(() => {
				OPEN_SUBSCRIBERS.add(setOpen);
				return () => {
					OPEN_SUBSCRIBERS.delete(setOpen);
				};
			}, []);
			return [open, setPanelOpen];
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			ensureStyle();
			if (panelOpen === null) panelOpen = readStoredOpen();
			trackForm(ctx);
			const locale = ctx.locale;
			if (locale !== undefined && typeof locale.getSnapshot === "function") {
				const read = () => {
					try {
						const snapshot = locale.getSnapshot();
						if (snapshot !== null && typeof snapshot === "object" && typeof snapshot.active === "string" && snapshot.active !== "") {
							dictionaryLocale = snapshot.active;
						}
					} catch {
						// Keep the last known language.
					}
					for (const notify of [...DICT_SUBSCRIBERS]) {
						try {
							notify(dictionaryLocale);
						} catch {
							// A broken subscriber must not stop the others.
						}
					}
				};
				read();
				if (typeof locale.subscribe === "function") ctx.effect(() => locale.subscribe(read), "token-usage-heatmap: locale");
			}

			// The panel is a list entry, so the switch is enforced at render time:
			// an empty registration is the only way to hide it from Settings.
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "token-usage-heatmap-panel",
						order: 30,
					},
					withI18n(DockGate),
				),
			);

			ctx.slots.inject("conversation.header.leading", () =>
				ctx.slots.register(
					{
						name: "conversation.header.leading",
						id: "token-usage-heatmap-chip",
					},
					withI18n(ChipGate),
				),
			);

			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{
						name: "settings.general.item",
						id: "token-usage-heatmap-settings",
						order: 95,
					},
					withI18n(SettingsRows),
				),
			);
		}

		return { inject, apply };
	},
});
