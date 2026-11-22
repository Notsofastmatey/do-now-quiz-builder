// Do Now Quiz Builder: user interface.
(async function () {
  "use strict";
  const D = window.DoNowData, S = window.DoNowSlides, SG = window.DoNowSuggest, GEN = window.DoNowGen;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const md = s => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const toast = (msg, ms = 3200) => { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms); };
  const newSeed = () => Math.floor(Math.random() * 2 ** 31);

  try { await D.init(); }
  catch (e) { document.body.innerHTML = `<p style="padding:2em">Couldn't load the question bank (bank.json). Open this page from its web address rather than as a file.<br><small>${esc(e.message)}</small></p>`; return; }

  // ---------- state ----------
  let cls = D.activeClasses().includes(D.prefs().cls) ? D.prefs().cls : D.activeClasses()[0];
  let lang = D.prefs().lang || "python", tab = "quiz", view = "plan", coverSolid = false;
  let slots = D.slotsFor(cls).slice();
  const filters = new Set();
  $("#incExam").checked = D.prefs().incExam ?? true;
  $("#incExam").onchange = e => D.setPref("incExam", e.target.checked);

  const setSlots = s => { slots = s; D.setSlots(cls, slots); };
  const resolved = () => slots.map(s => D.resolve(s));

  // ---------- header ----------
  function renderClassSelect() {
    $("#cls").innerHTML = D.activeClasses().map(c => `<option ${c === cls ? "selected" : ""}>${esc(c)}</option>`).join("");
  }
  $("#cls").onchange = e => { cls = e.target.value; D.setPref("cls", cls); slots = D.slotsFor(cls).slice(); renderAll(); };
  $$("#langSeg button").forEach(b => b.onclick = () => { lang = b.dataset.l; D.setPref("lang", lang); renderLang(); renderTree(); });
  const renderLang = () => $$("#langSeg button").forEach(x => x.classList.toggle("on", x.dataset.l === lang));
  $("#date").onchange = () => { $("#blank").checked = !$("#date").value; renderSlide(); };
  $("#blank").onchange = () => { if ($("#blank").checked) $("#date").value = ""; renderSlide(); };
  const lessonDate = () => ($("#blank").checked ? "" : $("#date").value);
  $("#whereBtn").onclick = () => openWhere(false);
  $$("[data-close]").forEach(b => b.onclick = () => b.closest(".scrim").classList.remove("open"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".scrim.open").forEach(m => m.classList.remove("open")); });

  // ---------- question bank ----------
  $$("#filters .f").forEach(b => b.onclick = () => { filters.has(b.dataset.f) ? filters.delete(b.dataset.f) : filters.add(b.dataset.f); b.classList.toggle("on"); renderTree(); });
  $("#search").oninput = () => renderTree();
  $$("#viewSeg button").forEach(b => b.onclick = () => { view = b.dataset.v; $$("#viewSeg button").forEach(x => x.classList.toggle("on", x === b)); renderTree(); });

  const GEN_CODE = {}; for (const g of D.generators()) GEN_CODE[g.id] = !!GEN.GENERATORS[g.id](new GEN.SeededRNG(1)).code;
  function passes(item, isGen) {
    const s = $("#search").value.trim().toLowerCase();
    if (s && !((item.q || item.label || "") + " " + (item.short || "") + " " + (item.ans || "")).toLowerCase().includes(s)) return false;
    const lv = ["recall", "apply", "explain"].filter(f => filters.has(f));
    if (lv.length && !lv.includes(item.level)) return false;
    if (filters.has("code") && !(isGen ? GEN_CODE[item.id] : item.code && item.code.length)) return false;
    if (filters.has("gen") && !isGen) return false;
    if (filters.has("exam") && item.style !== "exam") return false;
    if (filters.has("m2") && (item.marks || 1) < 2) return false;
    if (filters.has("mine") && !String(item.id).startsWith("mine-")) return false;
    return D.langOK(item, lang, isGen);
  }
  const usedIds = () => new Set(slots.filter(Boolean).map(s => s.id));
  function meter(use, t) {
    const u = use(t), lvl = u.n === 0 ? "none" : u.n <= 2 ? "low" : "ok";
    const tip = u.n === 0 ? "Never asked in a Do Now for this class" : `Asked ${u.n} time${u.n > 1 ? "s" : ""}, last ${u.days === 0 ? "today" : u.days + " day" + (u.days > 1 ? "s" : "") + " ago"}`;
    return `<span class="meter ${lvl}" title="${tip}">${u.n === 0 ? "never" : u.n + "×"}</span>`;
  }
  function renderTree() {
    const w = D.where(cls), used = usedIds(), recent = D.recentIds(cls), use = D.usage(cls);
    let html = "", total = 0;
    const topicBlock = (t, open) => {
      const taught = w.taught.includes(t);
      const gens = D.generators().filter(g => g.topic === t && passes(g, true));
      const qs = D.questions().filter(q => q.topic === t && passes(q, false));
      total += gens.length + qs.length;
      if (!gens.length && !qs.length) return "";
      let h = `<details class="tp ${taught ? "" : "untaught"}" data-topic="${t}" ${open ? "open" : ""}><summary>${esc(D.topicName(t))} ${t === w.last ? '<span class="last-tag">LAST TAUGHT</span>' : ""}${taught ? meter(use, t) : ""}<span class="count" title="Questions in the bank">${gens.length + qs.length}</span></summary>`;
      for (const g of gens) h += item("g", g.id, `⚄ ${esc(g.label)}`, g, used.has(g.id), false);
      for (const q of qs) h += item("q", q.id, md(q.q), q, used.has(q.id), recent.has(q.id));
      return h + "</details>";
    };
    const searching = $("#search").value.trim() || filters.size;
    if (view === "least") {
      const ts = D.topicOrder(cls).filter(t => w.taught.includes(t));
      ts.sort((a, b) => use(a).n - use(b).n || (use(b).days ?? 1e9) - (use(a).days ?? 1e9));
      html = `<div class="hint" style="padding:4px 10px 6px">Taught topics, least asked first (this class).</div>` + ts.map(t => topicBlock(t, !!searching)).join("");
    } else {
      for (const [ht, ts] of D.placed(cls)) {
        const inner = ts.map(t => topicBlock(t, t === w.last || !!searching)).join("");
        if (!inner) continue;
        const anyTaught = ts.some(t => w.taught.includes(t));
        html += `<details class="ht ${anyTaught ? "" : "untaught"}" ${ts.includes(w.last) || searching ? "open" : ""}><summary>${esc(ht)}</summary>${inner}</details>`;
      }
    }
    $("#tree").innerHTML = html || `<div class="empty-note">No questions match. Try clearing the search or filters.</div>`;
    $("#bankCount").textContent = `${total} shown`;
    $$("#tree .item").forEach(el => {
      el.querySelector("input").onchange = e => { e.target.checked ? addToSlot(el.dataset.k, el.dataset.id) : removeId(el.dataset.id); };
      el.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", JSON.stringify({ from: "bank", k: el.dataset.k, id: el.dataset.id })));
      const ed = el.querySelector(".edit"); if (ed) ed.onclick = e => { e.preventDefault(); openForm(D.qById(el.dataset.id)); };
    });
  }
  function item(k, id, text, q, used, recent) {
    const b = [], mine = String(id).startsWith("mine-");
    if (k === "g") b.push('<span class="bd gen">generator: new numbers</span>');
    b.push(`<span class="bd">${q.marks || 1} mark${(q.marks || 1) > 1 ? "s" : ""}</span>`, `<span class="bd">${q.level}</span>`);
    if (k === "q" && q.code && q.code.length) b.push(`<span class="bd code">${{ erl: "ERL", sql: "SQL" }[q.lang] || "Python"} code</span>`);
    if (k === "g" && GEN_CODE[id]) b.push(`<span class="bd code">${id.startsWith("erl-") ? "ERL" : "Python"} code</span>`);
    if (q.style === "exam") b.push('<span class="bd exam">exam-style</span>');
    if (mine) b.push('<span class="bd mine">mine</span>');
    if (recent) b.push('<span class="bd recent" title="Used in one of the last 10 quizzes">recent</span>');
    return `<div class="item ${used ? "used" : ""} ${k === "g" ? "gen" : ""}" draggable="true" data-k="${k}" data-id="${esc(id)}">
      <input type="checkbox" ${used ? "checked" : ""} aria-label="Use this question"><div class="qt">${text}</div><div class="badges">${b.join("")}</div>
      ${mine ? '<a href="#" class="edit sbtn">✎ Edit</a>' : ""}</div>`;
  }

  // ---------- slots ----------
  function addToSlot(k, id, at) {
    const i = at ?? slots.indexOf(null);
    if (i < 0) { toast("All 5 slots are full: remove one first."); renderTree(); return; }
    const s = slots.slice();
    s[i] = { kind: k, id, seed: k === "g" ? newSeed() : undefined, plus1: k === "q" && !!D.qById(id)?.plus1 && !slots.some(x => x?.plus1) };
    setSlots(s); renderAll();
  }
  function removeId(id) { setSlots(slots.map(s => (s?.id === id ? null : s))); renderAll(); }
  function renderSlots() {
    const qs = resolved();
    $("#slots").innerHTML = slots.map((s, i) => {
      const q = qs[i];
      if (!q) return `<div class="slot empty" data-i="${i}"><span></span><span class="num" style="background:#b7c2ba">${i + 1}</span><span>Drag a question here, or tick one in the bank</span><span></span></div>`;
      return `<div class="slot" data-i="${i}" draggable="true">
        <span class="handle" title="Drag to reorder">⠿</span><span class="num">${i + 1}</span>
        <div><div>${md(q.short)}</div><div class="meta">${esc(q.topicName)} · ${q.marks || 1} mark${(q.marks || 1) > 1 ? "s" : ""} · ${q.level}${q.gen ? " · generator" : ""}${q.misc ? " · has ‘Watch for’ note" : ""}</div></div>
        <span class="acts">${q.gen ? `<button class="sbtn" data-a="new" title="Same question, new numbers">⚄ New numbers</button>` : ""}
          <button class="sbtn p1 ${s.plus1 ? "on" : ""}" data-a="p1" title="Mark as the +1 stretch question">+1</button>
          <button class="sbtn x" data-a="x" title="Remove">✕</button></span></div>`;
    }).join("");
    $$("#slots .slot").forEach(el => {
      const i = +el.dataset.i;
      el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
        const s = slots.map(x => (x ? { ...x } : x)), a = b.dataset.a;
        if (a === "x") s[i] = null;
        if (a === "new") s[i].seed = newSeed();
        if (a === "p1") { const on = !s[i].plus1; s.forEach(x => x && (x.plus1 = false)); s[i].plus1 = on; }
        setSlots(s); renderAll();
      });
      el.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", JSON.stringify({ from: "slot", i })));
      el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("over"); });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", e => {
        e.preventDefault(); el.classList.remove("over");
        let d; try { d = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
        if (d.from === "slot") { const s = slots.slice(); const [m] = s.splice(d.i, 1); s.splice(i, 0, m); setSlots(s); renderAll(); }
        else if (d.from === "bank") { if (usedIds().has(d.id)) return toast("That question is already in the quiz."); addToSlot(d.k, d.id, i); }
      });
    });
  }
  $("#clearBtn").onclick = () => { setSlots([null, null, null, null, null]); renderAll(); };

  // ---------- preview ----------
  function slideModels() {
    const qs = resolved().filter(Boolean), opts = { icon: window.DONOW_ICON, date: lessonDate() };
    return { qs, quiz: S.quizSlide(qs, opts), ans: S.answersSlide(qs, opts) };
  }
  function renderSlide() {
    const { qs, quiz, ans } = slideModels();
    const m = tab === "quiz" ? quiz : ans;
    $("#slide").innerHTML = S.toSVG(m, { coverMode: tab === "ans" && !coverSolid ? "faded" : "solid" });
    $("#coverTip").hidden = tab !== "ans";
    $("#coverToggle").textContent = coverSolid ? "Show it faded" : "Show it solid";
    const f = $("#fit");
    if (!qs.length) { f.textContent = ""; f.className = "fit"; }
    else if (tab === "quiz") { f.textContent = quiz.fits ? `✔ Fits: questions ${quiz.sizes.q} pt, code ${quiz.sizes.code} pt` : "⚠ Too much text: shorten or swap a question"; f.className = "fit" + (quiz.fits ? "" : " warn"); }
    else { f.textContent = ans.fits ? `✔ Fits: answers ${ans.sizes.ans} pt` : "⚠ Answers don't fit: shorten or swap one"; f.className = "fit" + (ans.fits ? "" : " warn"); }
  }
  $("#coverToggle").onclick = e => { e.preventDefault(); coverSolid = !coverSolid; renderSlide(); };
  $$(".tab").forEach(t => t.onclick = () => { tab = t.dataset.t; $$(".tab").forEach(x => x.classList.toggle("on", x === t)); renderSlide(); });
  function warn(msg) { const w = $("#warnbar"); w.textContent = msg || ""; w.classList.toggle("show", !!msg); }

  // ---------- output ----------
  async function clip(items) {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("This browser can't copy pictures. Use Edge or Chrome, or Download .pptx.");
    for (const t of Object.keys(items)) if (ClipboardItem.supports && !ClipboardItem.supports(t)) throw new Error(`This browser can't copy ${t}. Try Copy as picture or Download .pptx.`);
    await navigator.clipboard.write([new ClipboardItem(items)]);
  }
  function remember() { if (D.record(cls, slots, lessonDate())) { renderHistory(); renderTree(); } }
  $$(".obtn").forEach(b => b.onclick = async () => {
    const { qs, quiz, ans } = slideModels();
    if (qs.length < 5) return toast("Fill all 5 slots first.");
    if (!quiz.fits || !ans.fits) toast("Warning: the text is too long to fit neatly. Check the slide after pasting.", 4500);
    const o = b.dataset.o;
    try {
      if (o === "svg-quiz") { await clip({ "image/svg+xml": new Blob([S.toSVG(quiz)], { type: "image/svg+xml" }) }); toast("Quiz copied. In PowerPoint: Ctrl+V, then right-click → Convert to Shape."); }
      if (o === "svg-ans") { await clip({ "image/svg+xml": new Blob([S.toSVG(ans)], { type: "image/svg+xml" }) }); toast("Answers copied, with the cover on top. Ctrl+V, then right-click → Convert to Shape."); }
      if (o === "png") { const svg = S.toSVG(tab === "quiz" ? quiz : ans); await clip({ "image/png": S.toPNG(svg) }); toast(`${tab === "quiz" ? "Quiz" : "Answers"} slide copied as a picture.`); }
      if (o === "pptx") {
        const blob = await S.pptxBlob([quiz, ans]);
        const a = document.createElement("a"), name = `Do Now ${cls.split(" ")[0]} ${lessonDate() || new Date().toISOString().slice(0, 10)}.pptx`;
        a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(`Downloaded ${name}. In PowerPoint: Home → New Slide ▾ → Reuse Slides.`, 5000);
      }
      remember();
    } catch (e) { toast("✘ " + (e.message || "Copy failed"), 6000); }
  });

  // ---------- history ----------
  function renderHistory() {
    const h = D.history(cls).slice(0, 10);
    $("#hist").innerHTML = h.length ? h.map(q => {
      const when = new Date(q.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      const ts = [...new Set(q.items.map(i => D.topicName(i.topic)))].join(", ");
      return `<li><span><b>${esc(when)}</b>: ${esc(ts)}</span><button data-at="${esc(q.at)}" title="I didn't use this quiz">✕</button></li>`;
    }).join("") : `<li class="hint">None yet.</li>`;
    $$("#hist button").forEach(b => b.onclick = () => { D.removeHistory(cls, b.dataset.at); renderHistory(); renderTree(); });
  }

  // ---------- where are we / suggest ----------
  function openWhere(thenSuggest) {
    const w = D.where(cls), draft = { last: w.last, taught: w.taught.slice() };
    $("#waClass").textContent = cls;
    const draw = () => {
      const plan = D.planFor(cls);
      $("#waBody").innerHTML = Object.entries(plan).map(([ht, ts]) => ts.length ? `<div class="wa-ht"><h3>${esc(D.isUnplaced(ht) ? "Not placed in the course plan yet" : ht)}</h3><div class="wa-topics">${
        ts.map(t => `<span class="wa-t ${draft.taught.includes(t) ? "on" : ""} ${t === draft.last ? "last" : ""}" data-t="${t}" title="Click to tick, double-click for last taught">${esc(D.topicName(t))}</span>`).join("")}</div></div>` : "").join("");
      $$("#waBody .wa-t").forEach(el => {
        el.onclick = () => { const t = el.dataset.t, i = draft.taught.indexOf(t); i >= 0 ? draft.taught.splice(i, 1) : draft.taught.push(t); if (i >= 0 && draft.last === t) draft.last = ""; draw(); };
        el.ondblclick = () => { draft.last = el.dataset.t; if (!draft.taught.includes(draft.last)) draft.taught.push(draft.last); draw(); };
      });
    };
    draw();
    $("#waConfirm").textContent = thenSuggest ? "Confirm and suggest 5" : "Save";
    $("#waConfirm").onclick = () => {
      if (!draft.taught.length) return toast("Tick at least one topic.");
      D.setWhere(cls, draft); $("#whereModal").classList.remove("open");
      if (thenSuggest) runSuggest(); else renderAll();
    };
    $("#whereModal").classList.add("open");
  }
  $("#suggestBtn").onclick = () => openWhere(true);
  function runSuggest() {
    const r = SG.suggestFitting(cls, { lang, includeExam: $("#incExam").checked });
    if (!r.slots.length) { warn(r.warning); renderAll(); return; }
    setSlots(r.slots); renderAll(); warn(r.warning);
    toast("Suggested 5. Swap, re-roll or remove any you don't want.");
  }

  // ---------- add / edit your own question ----------
  let editing = null;
  function openForm(q) {
    editing = q || null;
    $("#fTitle").textContent = q ? "✎ Edit your question" : "＋ Add your own question";
    $("#fTopic").innerHTML = Object.entries(D.topics()).sort((a, b) => a[1].spec.localeCompare(b[1].spec, "en", { numeric: true }))
      .map(([k, t]) => `<option value="${k}">${esc(t.spec + " " + t.name)}</option>`).join("");
    $("#fTopic").value = q?.topic || D.where(cls).last || "comp-thinking";
    $("#fQ").value = q?.q || ""; $("#fCode").value = (q?.code || []).join("\n"); $("#fLang").value = q?.lang || lang;
    $("#fAns").value = q?.ans || ""; $("#fShort").value = q?.short || ""; $("#fMarks").value = String(q?.marks || 1);
    $("#fLevel").value = q?.level || "recall"; $("#fStyle").value = q?.style || "quiz"; $("#fPlus1").checked = !!q?.plus1; $("#fMisc").value = q?.misc || "";
    $("#fDelete").style.display = q ? "" : "none"; $("#fErr").textContent = ""; checkForm();
    $("#addModal").classList.add("open"); $("#fQ").focus();
  }
  $("#addBtn").onclick = () => openForm(null);
  function checkForm() {
    const code = $("#fCode").value.replace(/\s+$/, ""), lines = code ? code.split("\n") : [], warns = [];
    if (lines.some(l => l.length > 38)) warns.push("Some code lines are longer than 38 characters; they may shrink.");
    if (lines.length > 7) warns.push("More than 7 lines of code may not fit.");
    if ($("#fLang").value === "python" && lines.some(l => /print\((.*),(.*)\)/.test(l) && !/print\(.*["'].*,.*["'].*\)/.test(l))) warns.push("House style: join output with + and str(), not commas, in print().");
    if (/\b(Mr|Mrs|Miss|Ms|Dr)\.?\s+[A-Z]/.test($("#fQ").value + code + $("#fAns").value)) warns.push("Looks like a real name: use invented names only.");
    $("#fWarn").textContent = warns.join(" ");
  }
  ["#fCode", "#fQ", "#fAns", "#fLang"].forEach(s => $(s).addEventListener("input", checkForm));
  $("#fSave").onclick = () => {
    const code = $("#fCode").value.replace(/\s+$/, ""), q = {
      id: editing?.id || D.newCustomId($("#fTopic").value), topic: $("#fTopic").value, q: $("#fQ").value.trim(), ans: $("#fAns").value.trim(),
      short: $("#fShort").value.trim(), marks: +$("#fMarks").value, level: $("#fLevel").value, style: $("#fStyle").value, src: "mine",
      spec: D.topics()[$("#fTopic").value]?.spec };
    if (code) { q.code = code.split("\n"); q.lang = $("#fLang").value; }
    if ($("#fPlus1").checked) q.plus1 = true;
    if ($("#fMisc").value.trim()) q.misc = $("#fMisc").value.trim();
    const missing = [["question", q.q], ["answer", q.ans], ["short label", q.short]].filter(([, v]) => !v).map(([n]) => n);
    if (missing.length) { $("#fErr").textContent = "Please fill in the " + missing.join(", ") + "."; return; }
    D.saveCustom(q); $("#addModal").classList.remove("open"); renderAll();
    toast(editing ? "Question updated." : "Question saved. It's in the bank, tagged “mine”.");
  };
  $("#fDelete").onclick = () => {
    if (!editing || !confirm("Delete this question? This can't be undone (unless you have an export).")) return;
    D.deleteCustom(editing.id); setSlots(slots.map(s => (s?.id === editing.id ? null : s)));
    $("#addModal").classList.remove("open"); renderAll(); toast("Question deleted.");
  };

  // ---------- export / import ----------
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(D.exportAll(), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `do-now-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Exported your questions, plans, classes and history.");
  };
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const n = D.importAll(JSON.parse(await f.text())); renderClassSelect(); renderAll(); toast(`Imported. ${n.custom} new question${n.custom === 1 ? "" : "s"}; plans, classes and history merged.`); }
    catch (err) { toast("✘ " + err.message, 6000); }
  };

  // ---------- coverage ----------
  $("#covBtn").onclick = () => {
    const w = D.where(cls), use = D.usage(cls);
    const groups = D.placed(cls).map(([h, ts]) => [h, ts.filter(t => w.taught.includes(t))]).filter(([, ts]) => ts.length);
    const all = groups.flatMap(([, ts]) => ts), max = Math.max(1, ...all.map(t => use(t).n));
    const never = all.filter(t => !use(t).n).length, low = all.filter(t => use(t).n && use(t).n <= 2).length, stale = all.filter(t => use(t).n && use(t).days > 28).length;
    $("#covClass").textContent = cls;
    $("#covBody").innerHTML = `<div class="cov-sum"><div><b>${all.length}</b>topics taught</div><div><b style="color:#9b1c1c">${never}</b>never asked</div><div><b style="color:#8a5a00">${low}</b>asked once or twice</div><div><b>${stale}</b>not asked for 4+ weeks</div></div>` +
      groups.map(([h, ts]) => `<div class="cov-ht"><h3>${esc(h)}</h3>${ts.map(t => { const u = use(t);
        return `<div class="cov-row ${u.n ? "" : "none"}"><span>${esc(D.topicName(t))}</span><span class="cov-bar"><i style="width:${u.n / max * 100}%"></i></span>
          <span>${meter(use, t)} <span class="hint">${u.n ? (u.days === 0 ? "today" : `${u.days} days ago`) : ""}</span></span><button class="sbtn" data-go="${t}">Pick from this</button></div>`; }).join("")}</div>`).join("");
    $$("#covBody [data-go]").forEach(b => b.onclick = () => {
      $("#covModal").classList.remove("open"); view = "plan"; $$("#viewSeg button").forEach(x => x.classList.toggle("on", x.dataset.v === "plan")); renderTree();
      const d = $(`#tree details.tp[data-topic="${b.dataset.go}"]`); if (!d) return toast("No questions match the current filters for that topic.");
      d.open = true; const ht = d.closest("details.ht"); if (ht) ht.open = true; d.classList.add("flash"); d.scrollIntoView({ block: "center" }); setTimeout(() => d.classList.remove("flash"), 1800);
    });
    $("#covModal").classList.add("open");
  };

  // ---------- classes & course plans ----------
  let draft = null, curPlan = null, dragT = null;
  $("#plansBtn").onclick = () => {
    const hts = JSON.parse(JSON.stringify(D.halfTerms()));
    for (const plan of Object.values(hts)) {   // every plan gets a "Not placed yet" column
      const placedT = new Set(Object.entries(plan).filter(([h]) => !D.isUnplaced(h)).flatMap(([, t]) => t));
      for (const h of Object.keys(plan)) if (D.isUnplaced(h)) delete plan[h];
      plan[D.UNPLACED] = Object.keys(D.topics()).filter(t => !placedT.has(t));
    }
    draft = { halfTerms: hts, classes: { ...D.classes() }, labels: D.planLabels(), archived: [...D.archived()] };
    curPlan = D.classes()[cls]; showPTab("plans"); renderPlanTools(); renderBoard(); renderClassTable();
    $("#plansModal").classList.add("open");
  };
  $$(".ptab").forEach(b => b.onclick = () => showPTab(b.dataset.p));
  function showPTab(p) { $$(".ptab").forEach(b => b.classList.toggle("on", b.dataset.p === p)); $("#pPlans").style.display = p === "plans" ? "flex" : "none"; $("#pClasses").style.display = p === "classes" ? "block" : "none"; }
  function renderPlanTools() {
    $("#planSel").innerHTML = Object.keys(draft.halfTerms).map(p => `<option value="${esc(p)}" ${p === curPlan ? "selected" : ""}>${esc(draft.labels[p] || p)}</option>`).join("");
    $("#planName").value = draft.labels[curPlan] || curPlan;
    const users = Object.entries(draft.classes).filter(([c, p]) => p === curPlan && !draft.archived.includes(c)).map(([c]) => c);
    $("#planUsers").textContent = users.length ? "Used by " + users.join(", ") : "Not used by any class yet";
  }
  $("#planSel").onchange = e => { curPlan = e.target.value; renderPlanTools(); renderBoard(); };
  $("#planName").oninput = e => { draft.labels[curPlan] = e.target.value; const o = [...$("#planSel").options].find(x => x.value === curPlan); if (o) o.textContent = e.target.value; renderClassTable(); };
  $("#copyPlan").onclick = () => {
    let n = 1; while (draft.halfTerms["plan-" + n]) n++;
    const id = "plan-" + n; draft.halfTerms[id] = JSON.parse(JSON.stringify(draft.halfTerms[curPlan]));
    draft.labels[id] = "Copy of " + (draft.labels[curPlan] || curPlan); curPlan = id;
    renderPlanTools(); renderBoard(); renderClassTable(); toast("Copied. Rename it, rearrange it, then choose it for a class on the Classes tab.");
  };
  function renderBoard() {
    const hts = draft.halfTerms[curPlan];
    const order = Object.keys(hts).filter(h => h !== D.UNPLACED).concat(D.UNPLACED);
    $("#board").innerHTML = order.map(h => `<div class="col ${h === D.UNPLACED ? "unplaced" : ""}" data-h="${esc(h)}">
        <h4>${h === D.UNPLACED ? D.UNPLACED : `<input value="${esc(h)}" data-rename="${esc(h)}" aria-label="Half-term name">`}<span class="count">${hts[h].length}</span>
        ${h !== D.UNPLACED && !hts[h].length ? `<button class="sbtn x" data-delht="${esc(h)}" title="Remove this empty half term">✕</button>` : ""}</h4>
        <div class="cards">${hts[h].map(t => { const tp = D.topics()[t] || { name: t, spec: "" };
          return `<div class="tcard ${tp.paper === 1 ? "p1" : ""}" draggable="true" data-t="${t}">${esc(tp.name)}<small>${esc(tp.spec)}</small></div>`; }).join("")}</div></div>`).join("")
      + `<button class="addcol" id="addHT">＋ Add half term</button>`;
    $$("#board .tcard").forEach(c => {
      c.addEventListener("dragstart", () => { dragT = c.dataset.t; c.classList.add("dragging"); });
      c.addEventListener("dragend", () => c.classList.remove("dragging"));
      c.addEventListener("dragover", e => { e.preventDefault(); c.classList.add("before"); });
      c.addEventListener("dragleave", () => c.classList.remove("before"));
    });
    $$("#board .col").forEach(col => {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", e => { if (!col.contains(e.relatedTarget)) col.classList.remove("over"); });
      col.addEventListener("drop", e => {
        e.preventDefault(); if (!dragT) return;
        const target = e.target.closest(".tcard")?.dataset.t;
        for (const list of Object.values(hts)) { const i = list.indexOf(dragT); if (i >= 0) list.splice(i, 1); }
        const list = hts[col.dataset.h], at = target && target !== dragT ? list.indexOf(target) : -1;
        at >= 0 ? list.splice(at, 0, dragT) : list.push(dragT);
        dragT = null; renderBoard();
      });
    });
    $$("#board [data-rename]").forEach(inp => inp.onchange = () => {
      const old = inp.dataset.rename, nu = inp.value.trim();
      if (!nu || nu === old || hts[nu] || D.isUnplaced(nu)) { inp.value = old; return; }
      const rebuilt = {}; for (const [k, v] of Object.entries(hts)) rebuilt[k === old ? nu : k] = v;
      draft.halfTerms[curPlan] = rebuilt; renderBoard();
    });
    $$("#board [data-delht]").forEach(b => b.onclick = () => { delete hts[b.dataset.delht]; renderBoard(); });
    $("#addHT").onclick = () => {
      const rebuilt = {}; let n = 1; while (hts["New half term " + n]) n++;
      for (const [k, v] of Object.entries(hts)) { if (k === D.UNPLACED) rebuilt["New half term " + n] = []; rebuilt[k] = v; }
      draft.halfTerms[curPlan] = rebuilt; renderBoard();
    };
  }
  function renderClassTable() {
    $("#ctBody").innerHTML = Object.entries(draft.classes).map(([c, p]) => {
      const arch = draft.archived.includes(c), w = D.where(c);
      return `<tr style="${arch ? "opacity:.45" : ""}"><td><b>${esc(c)}</b>${arch ? " <span class='hint'>(archived)</span>" : ""}</td>
        <td><select data-c="${esc(c)}">${Object.keys(draft.halfTerms).map(k => `<option value="${esc(k)}" ${k === p ? "selected" : ""}>${esc(draft.labels[k] || k)}</option>`).join("")}</select></td>
        <td>${w.last ? esc(D.topicName(w.last)) : "<span class='hint'>not set</span>"}</td><td>${D.history(c).length}</td>
        <td><button class="sbtn" data-arch="${esc(c)}">${arch ? "Restore" : "Archive"}</button></td></tr>`;
    }).join("");
    $$("#ctBody select").forEach(s => s.onchange = () => { draft.classes[s.dataset.c] = s.value; renderPlanTools(); });
    $$("#ctBody [data-arch]").forEach(b => b.onclick = () => {
      const c = b.dataset.arch, i = draft.archived.indexOf(c);
      if (i >= 0) draft.archived.splice(i, 1);
      else { if (Object.keys(draft.classes).filter(x => !draft.archived.includes(x)).length <= 1) return toast("Keep at least one class."); draft.archived.push(c); }
      renderClassTable(); renderPlanTools();
    });
  }
  $("#addClass").onclick = () => {
    const name = (prompt("Class code and years, e.g. 10CP2 (2027-29)") || "").trim(); if (!name) return;
    if (/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(name.replace(/\(.*\)/, ""))) return toast("That looks like a name. Use the class code and years only.");
    if (draft.classes[name]) return toast("That class already exists.");
    draft.classes[name] = curPlan; renderClassTable(); renderPlanTools();
  };
  $("#savePlans").onclick = () => {
    for (const plan of Object.values(draft.halfTerms)) if (!plan[D.UNPLACED]?.length) delete plan[D.UNPLACED];
    D.savePlans(draft);
    if (!D.activeClasses().includes(cls)) { cls = D.activeClasses()[0]; D.setPref("cls", cls); slots = D.slotsFor(cls).slice(); }
    $("#plansModal").classList.remove("open"); renderClassSelect(); renderAll(); toast("Saved. The question bank now follows the new order.");
  };

  // ---------- save to GitHub ----------
  const SY = D.sync;
  const syncLabel = st => ({ off: "Not saved online", busy: (st.msg || "Saving") + "…", ok: "Saved online", error: "Not saved: " + st.msg }[st.state] || "");
  function renderSync(st = SY.status) {
    $("#syncTxt").textContent = syncLabel(st);
    $("#syncBtn").style.borderColor = st.state === "error" ? "#ffb4b4" : "";
    $("#syncBtn").title = st.state === "error" ? "Couldn't save to GitHub: " + st.msg : "Save to GitHub so every computer has the same history and questions";
    const cfg = SY.config();
    $("#syncOn").hidden = !cfg; $("#syncOff").hidden = !!cfg;
    $("#syncConnect").hidden = !!cfg; $("#syncDisconnect").hidden = !cfg; $("#syncNow").hidden = !cfg;
    if (cfg) { $("#syncRepo").textContent = cfg.repo; $("#syncState").textContent = st.state === "error" ? "Problem: " + st.msg : syncLabel(st) + "."; }
  }
  SY.onSync(st => { renderSync(st); if (st.remoteChange) afterRemote(); });
  function afterRemote() {
    if (!D.activeClasses().includes(cls)) { cls = D.activeClasses()[0]; slots = D.slotsFor(cls).slice(); }
    renderClassSelect(); renderAll();
  }
  $("#syncBtn").onclick = () => { $("#syncErr").textContent = ""; $("#syncToken").value = ""; renderSync(); $("#syncModal").classList.add("open"); };
  $("#syncConnect").onclick = async () => {
    $("#syncErr").textContent = ""; $("#syncConnect").disabled = true;
    try { await SY.connect($("#syncRepoIn").value, $("#syncToken").value); $("#syncToken").value = ""; afterRemote(); toast("Connected. This computer now saves to GitHub."); }
    catch (e) { SY.disconnect(); $("#syncErr").textContent = "✘ " + e.message; }
    finally { $("#syncConnect").disabled = false; renderSync(); }
  };
  $("#syncDisconnect").onclick = () => { SY.disconnect(); renderSync(); toast("Disconnected. The token is removed from this computer; your data stays here and on GitHub."); };
  $("#syncNow").onclick = async () => { if (await SY.refresh(0)) afterRemote(); };
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && await SY.refresh()) afterRemote(); });

  // ---------- everything ----------
  function renderAll() {
    const w = D.where(cls);
    $("#whereTxt").textContent = w.last ? "Last taught: " + D.topicName(w.last) : "Where are we?";
    renderTree(); renderSlots(); renderSlide(); renderHistory();
  }
  renderClassSelect(); renderLang(); renderAll();
  window.DoNowApp = { get slots() { return slots; }, get cls() { return cls; }, renderAll };  // for tests
})();
