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
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  async function init(url = "bank.json", storageKey) {
    if (storageKey) KEY = storageKey;
    bank = await (await fetch(url, { cache: "no-cache" })).json();
    state = Object.assign({ where: {}, history: {}, custom: [], plans: null, classes: null, archived: [], prefs: {}, slots: {} }, load());
    // starting points for "Where are we?" (the teacher confirms or edits them before every suggestion)
    const seeds = {
      "11CP1 (2025-27)": () => ({ last: "threats", taught: Object.entries(bank.halfTerms.original).filter(([h]) => h !== "Y11 Sp1").flatMap(([, t]) => t) }),
      "10CP1 (2026-28)": () => ({ last: "lists-2d", taught: [...bank.halfTerms.oat["Y10 Au1"], "lists-2d"] }),
    };
    for (const c of Object.keys(classes())) if (!state.where[c] && seeds[c]) state.where[c] = seeds[c]();
    save();
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
  function savePlans(p) { state.plans = { halfTerms: p.halfTerms, labels: p.labels }; state.classes = p.classes; state.archived = p.archived; save(); }

  // ---------- where are we ----------
  function where(cls) { return state.where[cls] || (state.where[cls] = { last: "", taught: [] }); }
  function setWhere(cls, w) { state.where[cls] = { last: w.last, taught: [...new Set(w.taught)] }; save(); }

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
    const i = state.custom.findIndex(x => x.id === q.id);
    if (i >= 0) state.custom[i] = q; else state.custom.push(q);
    save();
  }
  function deleteCustom(id) { state.custom = state.custom.filter(q => q.id !== id); save(); }
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
  function removeHistory(cls, at) { state.history[cls] = history(cls).filter(q => q.at !== at); save(); }
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
    Object.assign(state.where, d.where || {});
    for (const [c, hs] of Object.entries(d.history || {})) {
      const have = new Set(history(c).map(q => q.at));
      state.history[c] = history(c).concat(hs.filter(q => !have.has(q.at))).sort((a, b) => b.at.localeCompare(a.at));
    }
    save(); return n;
  }

  const archived = () => state.archived;
  window.DoNowData = { init, archived, topics, topicName, halfTerms, planLabels, classes, activeClasses, planFor, placed, topicOrder, savePlans,
    where, setWhere, questions, qById, generators, gById, langOK, resolve, isCalc, saveCustom, deleteCustom, newCustomId,
    history, record, removeHistory, recentIds, usage, prefs, setPref, slotsFor, setSlots, exportAll, importAll, isUnplaced, UNPLACED,
    get bank() { return bank; } };
})();
