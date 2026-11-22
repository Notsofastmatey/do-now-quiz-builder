// Suggest 5 (HANDOVER rules): Q1 from the most recent topic; Q2–5 spread across earlier
// ticked topics, weighted towards older and less-asked topics, one topic each; at least one
// code, one calculation/conversion and one explain question (and optionally one exam-style);
// at most two code questions; avoid questions from the last 10 quizzes; prefer generators
// for number work; exactly one +1 (the hardest). Only ticked topics are ever used.
(function () {
  "use strict";
  const D = () => window.DoNowData;

  function difficulty(it) {
    return (it.marks || 1) * 2 + ({ recall: 0, apply: 1, explain: 2 }[it.level] || 0) + (it.style === "exam" ? 1 : 0) + (it.plus1 ? 3 : 0) + (it.code ? 1 : 0);
  }

  function candidates(cls, lang, allowRecent = false) {
    const d = D(), w = d.where(cls), taught = new Set(w.taught), recent = allowRecent ? new Set() : d.recentIds(cls);
    const out = [];
    const ok = (it, isGen) => lang === "any" || d.langOK(it, lang, isGen);
    for (const g of d.generators()) if (taught.has(g.topic) && ok(g, true))
      out.push({ kind: "g", id: g.id, topic: g.topic, level: g.level, marks: g.marks, code: !!window.DoNowGen.GENERATORS[g.id](new window.DoNowGen.SeededRNG(1)).code, calc: d.isCalc(g, true), exam: false });
    for (const q of d.questions()) if (taught.has(q.topic) && !recent.has(q.id) && ok(q, false))
      out.push({ kind: "q", id: q.id, topic: q.topic, level: q.level, marks: q.marks, code: !!(q.code && q.code.length), calc: d.isCalc(q, false), exam: q.style === "exam", plus1: !!q.plus1 });
    return out;
  }

  function suggest(cls, { lang = "python", includeExam = true, rng = Math.random } = {}) {
    const d = D(), w = d.where(cls), use = d.usage(cls);
    const order = d.topicOrder(cls).filter(t => w.taught.includes(t));
    // ticked topics that aren't placed in the plan count as the oldest
    const ticked = [...new Set(w.taught.filter(t => !order.includes(t)).concat(order))];
    const pos = new Map(ticked.map((t, i) => [t, i]));
    const all = candidates(cls, lang);
    if (!all.length) return { slots: [], warning: "No questions match the ticked topics." };
    const topicCount = new Map(); all.forEach(c => topicCount.set(c.topic, (topicCount.get(c.topic) || 0) + 1));

    const weightTopic = t => {
      const u = use(t), age = 1 - (pos.get(t) ?? 0) / Math.max(1, ticked.length - 1);  // 1 = oldest
      const neglect = (1 + (u.n ? u.days : 60) / 7) / (1 + u.n);
      return (1 + age) * neglect;
    };
    const pick = (cands, weight) => {
      const ws = cands.map(weight), total = ws.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
      return cands.at(-1);
    };
    // within a topic, prefer generators for number work
    const itemWeight = c => weightTopic(c.topic) * (c.calc && c.kind === "g" ? 3 : 1) / topicCount.get(c.topic);

    const chosen = [], usedT = new Set();
    const add = c => { chosen.push(c); usedT.add(c.topic); };
    const free = c => !usedT.has(c.topic) && !chosen.some(x => x.id === c.id);
    const codeCount = () => chosen.filter(c => c.code).length;

    // Q1: the most recent topic (or the latest ticked topic that has questions)
    const recentFirst = [w.last, ...ticked.slice().reverse()].filter(Boolean);
    // (if the last-taught topic has nothing in this code language, use the next most recent topic)
    // (if all its questions were in the last 10 quizzes, re-use the one asked longest ago)
    const hist = d.history(cls), lastAsked = id => { const i = hist.findIndex(q => q.items.some(x => x.id === id)); return i < 0 ? Infinity : i; };
    for (const t of recentFirst) {
      let cs = all.filter(c => c.topic === t);
      if (!cs.length && t === w.last) {
        const old = candidates(cls, lang, true).filter(c => c.topic === t);
        if (old.length) { const far = Math.max(...old.map(c => lastAsked(c.id))); cs = old.filter(c => lastAsked(c.id) === far); }
      }
      if (cs.length) { add(cs[Math.floor(rng() * cs.length)]); break; }
    }
    const q1Note = w.last && chosen[0] && chosen[0].topic !== w.last ? `Nothing in ${d.topicName(w.last)} for this code language, so Q1 is from ${d.topicName(chosen[0].topic)}. ` : "";
    // required kinds, then the rest
    const needs = [c => c.code, c => c.calc, c => c.level === "explain"];
    if (includeExam) needs.push(c => c.exam);
    for (const need of needs) {
      if (chosen.some(need)) continue;
      const cs = all.filter(c => free(c) && need(c) && (!c.code || codeCount() < 2));
      if (cs.length) add(pick(cs, itemWeight));
    }
    while (chosen.length < 5) {
      const cs = all.filter(c => free(c) && (!c.code || codeCount() < 2));
      if (!cs.length) break;
      add(pick(cs, itemWeight));
    }
    // exactly one +1: the hardest (not Q1)
    const slots = chosen.map(c => ({ kind: c.kind, id: c.id, seed: c.kind === "g" ? Math.floor(rng() * 2 ** 31) : undefined, plus1: false }));
    if (slots.length > 1) {
      let best = 1, bestScore = -1;
      slots.forEach((s, i) => { if (!i) return; const sc = difficulty(d.resolve(s)); if (sc > bestScore) { bestScore = sc; best = i; } });
      slots[best].plus1 = true;
    }
    while (slots.length < 5) slots.push(null);
    const missing = [];
    if (!chosen.some(c => c.code)) missing.push("code");
    if (!chosen.some(c => c.calc)) missing.push("calculation");
    if (!chosen.some(c => c.level === "explain")) missing.push("explain");
    return { slots, warning: q1Note + (chosen.length < 5 ? "Not enough different ticked topics to fill 5 slots." : missing.length ? `No ${missing.join(" / ")} question available in the ticked topics.` : "") };
  }

  // Try a few times until both slides fit at the smallest font size.
  function suggestFitting(cls, opts) {
    let last;
    for (let i = 0; i < 25; i++) {
      last = suggest(cls, opts);
      const qs = last.slots.filter(Boolean).map(s => D().resolve(s));
      if (qs.length < 5) return last;
      const S = window.DoNowSlides;
      if (S.quizSlide(qs).fits && S.answersSlide(qs).fits) return last;
    }
    return last;
  }

  window.DoNowSuggest = { suggest, suggestFitting, difficulty };
})();
