// Data layer: the shared bank (bank.json) plus what's saved on this computer
// (localStorage): "Where are we?" per class, quiz history, your own questions,
// edited course plans/classes, preferences and the current quiz per class.
(function () {
  "use strict";
  let KEY = "donow.v1";
  const PLAN_LABELS = { original: "Original order", oat: "OAT order" };
  const UNPLACED = "Not placed yet";
  const isUnplaced = h => h === UNPLACED || /^TBC/i.test(h);
  const NUMERIC = new Set(["binary", "hex", "binary-addition", "binary-shifts", "units", "images", "sound", "characters", "operators"]);
  const PY_GENS = new Set(["range-loop", "while-trace", "string-slice", "list-ops", "list-2d"]);

  let bank = null, state = null;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); schedulePush(); }
  const now = () => new Date().toISOString();
  function stamp(k, sub) {
    if (sub === undefined) { state.stamps[k] = now(); return; }
    if (!state.stamps[k] || typeof state.stamps[k] !== "object") state.stamps[k] = {};
    state.stamps[k][sub] = now();
  }

  async function init(url = "bank.json", storageKey) {
    if (storageKey) KEY = storageKey;
    bank = await (await fetch(url, { cache: "no-cache" })).json();
    state = Object.assign({ where: {}, history: {}, custom: [], plans: null, classes: null, archived: [], prefs: {}, slots: {},
      stamps: {}, deleted: { history: [], custom: [] } }, load());
    if (syncConfig()) { try { await pull(); } catch (e) { setStatus("error", e.message); } }
    // starting points for "Where are we?" (the teacher confirms or edits them before every suggestion)
    const seeds = {
      "11CP1 (2025-27)": () => ({ last: "threats", taught: Object.entries(bank.halfTerms.original).filter(([h]) => h !== "Y11 Sp1").flatMap(([, t]) => t) }),
      "10CP1 (2026-28)": () => ({ last: "lists-2d", taught: [...bank.halfTerms.oat["Y10 Au1"], "lists-2d"] }),
    };
    for (const c of Object.keys(classes())) if (!state.where[c] && seeds[c]) state.where[c] = seeds[c]();
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  // ---------- topics, plans, classes ----------
  const topics = () => bank.topics;
  const topicName = t => bank.topics[t]?.name || t;
  function halfTerms() { return state.plans?.halfTerms || bank.halfTerms; }
  function planLabels() { return { ...PLAN_LABELS, ...(state.plans?.labels || {}) }; }
  function classes() { return state.classes || bank.classes; }
  const activeClasses = () => Object.keys(classes()).filter(c => !state.archived.includes(c));
  function planFor(cls) { return halfTerms()[classes()[cls]] || {}; }
  // Placed half terms only, in order: [[name, [topics]]]
  const placed = cls => Object.entries(planFor(cls)).filter(([h]) => !isUnplaced(h));
  function topicOrder(cls) { return placed(cls).flatMap(([, ts]) => ts); }
  function savePlans(p) { state.plans = { halfTerms: p.halfTerms, labels: p.labels }; state.classes = p.classes; state.archived = p.archived; stamp("plans"); save(); }

  // ---------- where are we ----------
  function where(cls) { return state.where[cls] || (state.where[cls] = { last: "", taught: [] }); }
  function setWhere(cls, w) { state.where[cls] = { last: w.last, taught: [...new Set(w.taught)] }; stamp("where", cls); save(); }

  // ---------- questions ----------
  const questions = () => bank.questions.concat(state.custom);
  const qById = id => questions().find(q => q.id === id);
  const generators = () => bank.generators;
  const gById = id => bank.generators.find(g => g.id === id);
  function langOK(item, lang, isGen) {
    if (isGen) { if (item.id.startsWith("erl-")) return lang === "erl"; if (PY_GENS.has(item.id)) return lang === "python"; return true; }
    if (!item.code || !item.code.length) return true;
    if (item.lang === "python" || item.lang === "erl") return item.lang === lang;
    if (!item.lang) return lang === "python";
    return true;  // sql etc.
  }
  // A slot is {kind: "q"|"g", id, seed?, plus1}. Resolve it to a full question.
  function resolve(slot) {
    if (!slot) return null;
    if (slot.kind === "g") {
      const g = gById(slot.id); if (!g) return null;
      const out = window.DoNowGen.GENERATORS[slot.id](new window.DoNowGen.SeededRNG(slot.seed));
      return { ...out, id: g.id, topic: g.topic, spec: g.spec || bank.topics[g.topic]?.spec, level: g.level, marks: out.marks || g.marks,
        label: g.label, gen: true, style: "quiz", plus1: !!slot.plus1, topicName: topicName(g.topic) };
    }
    const q = qById(slot.id); if (!q) return null;
    return { ...q, spec: q.spec || bank.topics[q.topic]?.spec, plus1: !!slot.plus1, topicName: topicName(q.topic) };
  }
  function isCalc(item, isGen) { return NUMERIC.has(item.topic) && (isGen || item.level === "apply"); }

  // ---------- your own questions ----------
  function saveCustom(q) {
    q = { ...q, edited: now() };
    state.deleted.custom = state.deleted.custom.filter(id => id !== q.id);
    const i = state.custom.findIndex(x => x.id === q.id);
    if (i >= 0) state.custom[i] = q; else state.custom.push(q);
    save();
  }
  function deleteCustom(id) { state.custom = state.custom.filter(q => q.id !== id); state.deleted.custom.push(id); save(); }
  function newCustomId(topic) { let n = 1; while (questions().some(q => q.id === `mine-${topic}-${n}`)) n++; return `mine-${topic}-${n}`; }

  // ---------- history and usage ----------
  const history = cls => state.history[cls] || (state.history[cls] = []);
  // Record a quiz once per composition per day (copying twice doesn't count twice).
  function record(cls, slots, lessonDate) {
    const items = slots.filter(Boolean).map(s => { const r = resolve(s); return { kind: s.kind, id: s.id, seed: s.seed, topic: r?.topic }; });
    const sig = items.map(i => `${i.kind}:${i.id}:${i.seed ?? ""}`).join("|"), today = new Date().toISOString().slice(0, 10);
    const h = history(cls);
    if (h.some(q => q.sig === sig && q.at.slice(0, 10) === today)) return false;
    h.unshift({ at: new Date().toISOString(), date: lessonDate || "", sig, items });
    save(); return true;
  }
  function removeHistory(cls, at) { state.history[cls] = history(cls).filter(q => q.at !== at); state.deleted.history.push(at); save(); }
  function recentIds(cls, n = 10) { return new Set(history(cls).slice(0, n).flatMap(q => q.items.map(i => i.id))); }
  function usage(cls) {
    const u = {}, now = Date.now();
    for (const q of history(cls)) for (const it of q.items) {
      if (!it.topic) continue;
      const d = Math.floor((now - Date.parse(q.at)) / 864e5), cur = u[it.topic] || (u[it.topic] = { n: 0, days: Infinity });
      cur.n++; cur.days = Math.min(cur.days, d);
    }
    return t => u[t] || { n: 0, days: null };
  }

  // ---------- prefs and current quiz ----------
  const prefs = () => state.prefs;
  function setPref(k, v) { state.prefs[k] = v; save(); }
  const slotsFor = cls => state.slots[cls] || [null, null, null, null, null];
  function setSlots(cls, s) { state.slots[cls] = s; save(); }

  // ---------- export / import ----------
  function exportAll() {
    return { app: "do-now-quiz-builder", version: 1, exported: new Date().toISOString(),
      custom: state.custom, plans: state.plans, classes: state.classes, archived: state.archived, where: state.where, history: state.history };
  }
  function importAll(d) {
    if (!d || d.app !== "do-now-quiz-builder") throw new Error("That file isn't a Do Now Quiz Builder export.");
    const n = { custom: 0 };
    for (const q of d.custom || []) { if (!state.custom.some(x => x.id === q.id)) n.custom++; saveCustom(q); }
    if (d.plans) state.plans = d.plans;
    if (d.classes) state.classes = d.classes;
    if (d.archived) state.archived = d.archived;
    if (d.plans || d.classes || d.archived) stamp("plans");
    Object.assign(state.where, d.where || {});
    for (const c of Object.keys(d.where || {})) stamp("where", c);
    for (const [c, hs] of Object.entries(d.history || {})) {
      const have = new Set(history(c).map(q => q.at));
      state.history[c] = history(c).concat(hs.filter(q => !have.has(q.at))).sort((a, b) => b.at.localeCompare(a.at));
    }
    save(); return n;
  }

  // ---------- GitHub sync (a private repo holds data.json) ----------
  // The token only ever lives in this browser's localStorage; it is never exported or synced.
  const SYNC_FILE = "data.json", SYNCED = ["where", "history", "custom", "plans", "classes", "archived", "stamps", "deleted"];
  let API = "https://api.github.com", sha = null, pushTimer = null, pushing = null, status = { state: "off" }, lastPull = 0, lastPushed = "";
  const listeners = new Set();
  const syncKey = () => KEY + ".sync";
  function syncConfig() { try { const c = JSON.parse(localStorage.getItem(syncKey())); return c && c.repo && c.token ? c : null; } catch { return null; } }
  function setStatus(st, msg = "", extra = {}) { status = { state: st, msg, at: now() }; listeners.forEach(f => f({ ...status, ...extra })); }
  const onSync = f => { listeners.add(f); f(status); };
  const syncedJSON = o => JSON.stringify(SYNCED.map(k => o[k] ?? null));
  function b64enc(str) {
    const b = new TextEncoder().encode(str); let out = "";
    for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(out);
  }
  const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), ch => ch.charCodeAt(0)));

  async function gh(method, path, body, cfg) {
    cfg = cfg || syncConfig();
    const r = await fetch(`${API}/repos/${cfg.repo}${path ? "/" + path : ""}`, { method, cache: "no-store",
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) {
      const why = { 401: "the token isn't valid (or has expired)", 403: "the token can't write to that repo",
        404: "repo not found, or the token can't see it", 409: "conflict", 422: "conflict" }[r.status] || `GitHub said ${r.status}`;
      const e = new Error(why); e.status = r.status; throw e;
    }
    return r.json();
  }
  async function readRemote(cfg) {
    const f = await gh("GET", `contents/${SYNC_FILE}`, null, cfg);
    if (!f) return { data: null, sha: null };
    if (!f.content) throw new Error("data.json is too big to read through the API.");
    return { data: JSON.parse(b64dec(f.content)), sha: f.sha };
  }

  // Merge remote data into local state. Lists are joined (minus deletions); settings take the newer edit.
  function merge(r) {
    if (!r) return false;
    const before = syncedJSON(state);
    const ld = state.deleted || { history: [], custom: [] }, rd = r.deleted || {};
    state.deleted = { history: [...new Set([...(ld.history || []), ...(rd.history || [])])],
      custom: [...new Set([...(ld.custom || []), ...(rd.custom || [])])] };
    const gone = new Set(state.deleted.history);
    for (const c of new Set([...Object.keys(state.history), ...Object.keys(r.history || {})])) {
      const byAt = new Map();
      for (const q of [...(state.history[c] || []), ...((r.history || {})[c] || [])]) if (!gone.has(q.at)) byAt.set(q.at, q);
      state.history[c] = [...byAt.values()].sort((a, b) => b.at.localeCompare(a.at));
    }
    const goneQ = new Set(state.deleted.custom), byId = new Map();
    for (const q of [...state.custom, ...(r.custom || [])]) {
      if (goneQ.has(q.id)) continue;
      const have = byId.get(q.id);
      if (!have || (q.edited || "") > (have.edited || "")) byId.set(q.id, q);
    }
    state.custom = [...byId.values()];
    const rs = r.stamps || {}, ls = state.stamps;
    if ((rs.plans || "") > (ls.plans || "")) { state.plans = r.plans; state.classes = r.classes; state.archived = r.archived || []; ls.plans = rs.plans; }
    if (!ls.where || typeof ls.where !== "object") ls.where = {};
    for (const [c, w] of Object.entries(r.where || {})) {
      const rt = (rs.where || {})[c] || "", lt = ls.where[c] || "";
      if (!state.where[c] || rt > lt) { state.where[c] = w; if (rt) ls.where[c] = rt; }
    }
    return syncedJSON(state) !== before;
  }

  // Fetch data.json and merge it in; save back if this computer had anything new. Returns true if anything here changed.
  async function pull() {
    const cfg = syncConfig(); if (!cfg) return false;
    setStatus("busy", "Loading");
    const r = await readRemote(cfg); sha = r.sha; lastPull = Date.now();
    const changed = merge(r.data);
    localStorage.setItem(KEY, JSON.stringify(state));
    if (r.data) lastPushed = syncedJSON(r.data);
    if (!r.data || syncedJSON(state) !== lastPushed) await push(); else setStatus("ok");
    return changed;
  }
  async function push() {
    const cfg = syncConfig(); if (!cfg) return;
    clearTimeout(pushTimer);
    while (pushing) await pushing.catch(() => {});
    pushing = (async () => {
      setStatus("busy", "Saving");
      for (let tries = 0; tries < 3; tries++) {
        if (sha && syncedJSON(state) === lastPushed) return;   // nothing new to save
        const body = { app: "do-now-quiz-builder", saved: now(), ...Object.fromEntries(SYNCED.map(k => [k, state[k]])) };
        try {
          const res = await gh("PUT", `contents/${SYNC_FILE}`, { message: "Save Do Now data", content: b64enc(JSON.stringify(body, null, 1)), ...(sha ? { sha } : {}) }, cfg);
          sha = res.content.sha; lastPushed = syncedJSON(body); return;
        } catch (e) {
          if (e.status !== 409 && e.status !== 422) throw e;
          const r = await readRemote(cfg); sha = r.sha; lastPushed = r.data ? syncedJSON(r.data) : "";   // the other computer saved first: merge its data and try again
          if (merge(r.data)) { localStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach(f => f({ ...status, remoteChange: true })); }
        }
      }
      throw new Error("couldn't save after 3 tries");
    })();
    try { await pushing; setStatus("ok"); } catch (e) { setStatus("error", e.message); } finally { pushing = null; }
  }
  function schedulePush() { if (!syncConfig()) return; clearTimeout(pushTimer); setStatus("busy", "Saving"); pushTimer = setTimeout(push, 1500); }
  async function connect(repo, token) {
    repo = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, ""); token = token.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("The repo should look like owner/name.");
    if (!token) throw new Error("Paste your token.");
    const cfg = { repo, token };
    const info = await gh("GET", "", null, cfg);
    if (!info) throw new Error("Repo not found, or the token can't see it.");
    if (!info.private) throw new Error("That repo is public. Use a private repo so your data isn't on show.");
    localStorage.setItem(syncKey(), JSON.stringify(cfg));
    sha = null;
    await pull();
    if (status.state === "error") throw new Error(status.msg);
  }
  function disconnect() { localStorage.removeItem(syncKey()); clearTimeout(pushTimer); sha = null; lastPushed = ""; setStatus("off"); }
  // Pick up changes from the other computer when you come back to this tab.
  async function refresh(minGapMs = 30000) {
    if (!syncConfig() || Date.now() - lastPull < minGapMs || pushing || pushTimer && status.state === "busy") return false;
    try { return await pull(); } catch (e) { setStatus("error", e.message); return false; }
  }
  const sync = { connect, disconnect, pull, push, refresh, onSync, merge,
    config: () => { const c = syncConfig(); return c ? { repo: c.repo } : null; },
    get status() { return status; }, set api(u) { API = u; } };

  const archived = () => state.archived;
  window.DoNowData = { sync, init, archived, topics, topicName, halfTerms, planLabels, classes, activeClasses, planFor, placed, topicOrder, savePlans,
    where, setWhere, questions, qById, generators, gById, langOK, resolve, isCalc, saveCustom, deleteCustom, newCustomId,
    history, record, removeHistory, recentIds, usage, prefs, setPref, slotsFor, setSlots, exportAll, importAll, isUnplaced, UNPLACED,
    get bank() { return bank; } };
})();
