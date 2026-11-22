// Slide engine: lays out the Do Now quiz and answers slides in the Broadland style
// (measurements from broadland.py) as a list of shapes, then renders that one model to
// SVG (preview, editable copy), PNG (picture copy) and .pptx (PptxGenJS).
(function () {
  "use strict";

  const C = { GREEN: "008741", DARK: "00642D", LIGHT: "D9F3D0", INK: "212121", WHITE: "FFFFFF", LIME: "8CC841", BG: "F3F3F3" };
  const SW = 13.333, SH = 7.5, L = 0.45, R = 12.88, TOP = 1.88, BOTTOM = 6.76;
  const FONT = "Aptos", TITLE_FONT = "Aptos Display", MONO = "Consolas";
  const CSS_FONT = { Aptos: "Aptos, 'Segoe UI', Calibri, sans-serif", "Aptos Display": "'Aptos Display', Aptos, 'Segoe UI', Calibri, sans-serif", Consolas: "Consolas, 'Courier New', monospace" };
  const LINE = 1.2;  // line height as a multiple of font size

  // ---------- text measuring and wrapping ----------
  const ctx = document.createElement("canvas").getContext("2d");
  function widthIn(text, sizePt, bold, font) {
    ctx.font = `${bold ? "bold " : ""}${sizePt}pt ${CSS_FONT[font] || CSS_FONT.Aptos}`;
    return ctx.measureText(text).width / 96;  // canvas px (96 per inch) → inches
  }
  // Parse "**bold** and `code`" into runs.
  function runs(text, base = {}) {
    const out = [];
    String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(p => {
      if (!p) return;
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push({ ...base, text: p.slice(2, -2), bold: true });
      else if (p.startsWith("`") && p.endsWith("`") && p.length > 2) out.push({ ...base, text: p.slice(1, -1), font: MONO });
      else out.push({ ...base, text: p });
    });
    return out;
  }
  const plain = t => String(t).replace(/\*\*|`/g, "");
  // Wrap runs to a width (inches). Returns lines, each an array of runs.
  function wrap(rs, maxW, sizePt) {
    const words = [];
    rs.forEach(r => r.text.split(/(\s+)/).forEach(w => { if (w) words.push({ ...r, text: w }); }));
    const lines = [[]]; let w = 0;
    for (const tk of words) {
      const tw = widthIn(tk.text, sizePt, tk.bold, tk.font || FONT);
      const space = /^\s+$/.test(tk.text);
      if (space) { if (lines.at(-1).length) { lines.at(-1).push(tk); w += tw; } continue; }
      if (w + tw > maxW && lines.at(-1).length) {
        while (lines.at(-1).length && /^\s+$/.test(lines.at(-1).at(-1).text)) lines.at(-1).pop();
        lines.push([]); w = 0;
      }
      lines.at(-1).push(tk); w += tw;
    }
    // merge neighbouring runs with the same style
    return lines.map(line => line.reduce((acc, r) => {
      const last = acc.at(-1);
      if (last && !!last.bold === !!r.bold && (last.font || FONT) === (r.font || FONT) && !!last.underline === !!r.underline && last.color === r.color) last.text += r.text;
      else acc.push({ ...r });
      return acc;
    }, []));
  }
  const textH = (nLines, sizePt) => nLines * sizePt * LINE / 72;

  // ---------- shape helpers ----------
  const rect = (x, y, w, h, o = {}) => ({ t: "rect", x, y, w, h, ...o });
  const oval = (x, y, w, h, o = {}) => ({ t: "oval", x, y, w, h, ...o });
  // Text box. paras: array of run arrays. lines: pre-wrapped lines for SVG.
  function text(x, y, w, h, paras, o = {}) {
    const size = o.size || 20, ins = o.insets || { l: 0, r: 0, t: 0, b: 0 };
    const lines = paras.flatMap(p => wrap(p, w - ins.l - ins.r, size));
    return { t: "text", x, y, w, h, paras, lines, size, anchor: o.anchor || "t", align: o.align || "l", color: o.color || C.INK,
      font: o.font || FONT, bold: !!o.bold, insets: ins, name: o.name, box: o.box || null, cover: !!o.cover };
  }

  function frame(title, icon) {
    return [
      rect(0.547, 0.14, 0.067, 0.544, { fill: C.GREEN, rot: 90, name: "Frame" }),
      rect(1.088, 0.137, 0.067, 0.548, { fill: C.LIME, rot: 90, name: "Frame" }),
      rect(-0.08, 6.829, 13.489, 0.525, { fill: C.GREEN, name: "Frame" }),
      rect(-0.078, 7.307, 13.489, 0.262, { fill: C.LIME, name: "Frame" }),
      text(0.45, 0.45, 8.7, 0.85, [runs(title)], { size: 36, bold: true, font: TITLE_FONT, anchor: "ctr", name: "Title" }),
      { t: "image", x: 9.99, y: 0.40, w: 0.33, h: 0.82, data: icon, name: "Mode of work icon" },
      text(10.43, 0.40, 2.45, 0.82, [runs("Individual work")], { size: 22, bold: true, anchor: "ctr", name: "Mode of work label" }),
    ];
  }
  const numCircle = (x, y, n, name) => text(x, y, 0.48, 0.48, [[{ text: String(n) }]],
    { size: 18, bold: true, color: C.WHITE, anchor: "ctr", align: "c", name: name || `Number ${n}`, box: { shape: "oval", fill: C.GREEN } });
  const plusOne = (x, y) => text(x, y, 0.5, 0.5, [[{ text: "+1" }]],
    { size: 16, bold: true, color: C.WHITE, anchor: "ctr", align: "c", name: "+1 challenge", box: { shape: "oval", fill: C.GREEN } });

  // ---------- quiz slide ----------
  const Q_SIZES = [[20, 16], [20, 15], [19, 15], [19, 14], [18, 14], [18, 13], [17, 13], [17, 12], [16, 12], [16, 11]];
  const A_SIZES = [[19, 20], [18, 19], [17, 18], [16, 17], [15, 16]];
  const CODE_W = 5.95, CODE_INS = { l: 0.14, r: 0.08, t: 0.08, b: 0.08 };

  function codeFits(code, csize) {
    const wd = String(code.length).length, avail = CODE_W - CODE_INS.l - CODE_INS.r - 0.05;
    return code.every((l, i) => widthIn(String(i + 1).padStart(wd) + " " + l, csize, false, MONO) <= avail);
  }
  function quizHeights(qs, qsize, csize) {
    return qs.map(q => {
      const pw = q.plus1 ? 0.65 : 0;
      if (q.code && q.code.length) {
        const tl = wrap(runs(q.q), 5.0 - pw, qsize).length;
        const ch = textH(q.code.length, csize) + 0.18 + 0.1;
        return Math.max(0.56, textH(tl, qsize) + 0.22, ch);
      }
      const tl = wrap(runs(q.q), 11.3 - pw, qsize).length;
      return Math.max(0.56, textH(tl, qsize) + 0.22);
    });
  }
  function fmtDate(iso) { if (!iso) return "__ / __ / __"; const [y, m, d] = iso.split("-"); return `${d} / ${m} / ${y.slice(2)}`; }

  function quizSlide(qs, opts = {}) {
    const avail = BOTTOM - TOP;
    let hs, qsize, csize, fits = false;
    for ([qsize, csize] of Q_SIZES) {
      hs = quizHeights(qs, qsize, csize);
      if (sum(hs) + 0.07 * (qs.length - 1) <= avail && qs.every(q => !q.code || codeFits(q.code, csize))) { fits = true; break; }
    }
    const gap = qs.length > 1 ? Math.min(0.2, (avail - sum(hs)) / (qs.length - 1)) : 0;
    const shapes = frame("Do now: retrieval quiz", opts.icon);
    shapes.push(text(0.45, 1.30, 12.4, 0.45, [[
      { text: "Date: " }, { text: fmtDate(opts.date), bold: true, underline: true },
      { text: " (write and underline it)  ·  Silent  ·  Stuck? Leave a gap" }]], { size: 20, name: "Routine line" }));
    let y = TOP;
    qs.forEach((q, i) => {
      const h = hs[i], n = i + 1;
      shapes.push(rect(L, y, R - L, h, { fill: C.LIGHT, line: C.GREEN, lw: 2, radius: Math.min(0.2, 0.1 / h) * Math.min(R - L, h), name: `Question ${n}` }));
      shapes.push(numCircle(0.62, y + (h - 0.48) / 2, n));
      let tw = q.code && q.code.length ? 5.0 : 11.3;
      if (q.plus1) { tw -= 0.65; shapes.push(plusOne(1.25 + tw + 0.08, y + (h - 0.5) / 2)); }
      shapes.push(text(1.25, y + 0.05, tw, h - 0.1, [runs(q.q)], { size: qsize, anchor: "ctr", name: `Question ${n} text` }));
      if (q.code && q.code.length) {
        const ch = textH(q.code.length, csize) + 0.18, wd = String(q.code.length).length;
        const paras = q.code.map((l, k) => [{ text: String(k + 1).padStart(wd) + " ", bold: true, color: C.GREEN, font: MONO }, { text: l || " ", font: MONO }]);
        const t = text(6.75, y + (h - ch) / 2, CODE_W, ch, paras,
          { size: csize, font: MONO, anchor: "t", insets: CODE_INS, name: `Question ${n} code`,
            box: { shape: "rect", fill: C.WHITE, line: C.INK, lw: 2, radius: Math.min(0.12, 0.08 / ch) * Math.min(CODE_W, ch) } });
        t.lines = paras;  // code never wraps (checked by codeFits)
        shapes.push(t);
      }
      y += h + gap;
    });
    const notes = qs.map((q, i) => `${i + 1}. ${q.spec || ""} ${q.topicName || ""}${q.gen ? " (generated)" : ""}`.replace(/\s+/g, " ").trim()).join("\n");
    return { shapes, notes, fits, sizes: { q: qsize, code: csize } };
  }

  // ---------- answers slide ----------
  function answersSlide(qs, opts = {}) {
    const avail = BOTTOM - TOP;
    let ahs, asize, ssize, fits = false;
    for ([asize, ssize] of A_SIZES) {
      ahs = qs.map(q => {
        const al = wrap(runs(q.ans), 6.78 - 0.28 - 0.05, asize).length, sl = wrap(runs(q.short), 4.4, ssize).length;
        return Math.max(0.68, Math.max(textH(al, asize) + 0.3, textH(sl, ssize) + 0.3));
      });
      if (sum(ahs) + 0.08 * (qs.length - 1) <= avail) { fits = true; break; }
    }
    const gap = qs.length > 1 ? Math.min(0.2, (avail - sum(ahs)) / (qs.length - 1)) : 0;
    const shapes = frame("Do now: answers", opts.icon);
    shapes.push(text(0.45, 1.30, 12.4, 0.45, [runs(`**Mark in a different colour**  ·  Score out of ${qs.length}  ·  Revise what you missed`)], { size: 20, name: "Routine line" }));
    let y = TOP;
    qs.forEach((q, i) => {
      const h = ahs[i], n = i + 1;
      shapes.push(rect(L, y, R - L, h, { fill: C.LIGHT, line: C.GREEN, lw: 2, radius: Math.min(0.2, 0.1 / h) * Math.min(R - L, h), name: `Answer row ${n}` }));
      shapes.push(numCircle(0.62, y + (h - 0.48) / 2, n));
      shapes.push(text(1.25, y, 4.45, h, [runs(q.short)], { size: ssize, anchor: "ctr", name: `Question ${n} reminder` }));
      const bh = h - 0.16, bw = R - 0.15 - 5.95;
      shapes.push(text(5.95, y + 0.08, bw, bh, [runs(q.ans)], { size: asize, anchor: "ctr", insets: { l: 0.16, r: 0.12, t: 0.04, b: 0.04 }, name: `Answer ${n}`,
        box: { shape: "rect", fill: C.WHITE, line: C.GREEN, lw: 2, radius: Math.min(0.2, 0.12 / bh) * Math.min(bw, bh) } }));
      y += h + gap;
    });
    const coverH = y - gap - TOP;
    shapes.push(text(5.85, TOP, R - 5.85, coverH, [runs("Answers hidden. Drag this box away.")],
      { size: 24, bold: true, color: C.WHITE, anchor: "ctr", align: "c", name: "Answer cover (drag to reveal)", cover: true,
        box: { shape: "rect", fill: C.DARK, radius: 0.035 * Math.min(R - 5.85, coverH) } }));
    // no speaker notes here: pupils can see notes, so answers never go in them
    return { shapes, notes: "", fits, sizes: { ans: asize, short: ssize } };
  }
  const sum = a => a.reduce((s, x) => s + x, 0);

  // ---------- SVG ----------
  const P = 96;  // px per inch in the SVG
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const f2 = n => +n.toFixed(2);
  function svgBox(s, extra = "") {
    const x = f2(s.x * P), y = f2(s.y * P), w = f2(s.w * P), h = f2(s.h * P);
    const fill = s.fill ? `#${s.fill}` : "none", stroke = s.line ? ` stroke="#${s.line}" stroke-width="${(s.lw || 1) * 96 / 72}"` : "";
    if (s.t === "oval" || s.shape === "oval") return `<ellipse cx="${f2(x + w / 2)}" cy="${f2(y + h / 2)}" rx="${f2(w / 2)}" ry="${f2(h / 2)}" fill="${fill}"${stroke}${extra}/>`;
    const rot = s.rot ? ` transform="rotate(${s.rot} ${f2(x + w / 2)} ${f2(y + h / 2)})"` : "";
    const rx = s.radius ? ` rx="${f2(s.radius * P)}"` : "";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx} fill="${fill}"${stroke}${rot}${extra}/>`;
  }
  function svgText(s) {
    const size = s.size * 96 / 72, lh = size * LINE, ins = s.insets;
    const innerTop = s.y + ins.t, innerH = s.h - ins.t - ins.b, blockH = s.lines.length * lh / P;
    let top = s.anchor === "ctr" ? innerTop + (innerH - blockH) / 2 : innerTop;
    const x = s.align === "c" ? s.x + s.w / 2 : s.x + ins.l;
    return s.lines.map((line, i) => {
      const base = (top * P) + i * lh + lh / 2 + size * 0.35;
      const spans = line.map(r => {
        const a = [];
        const bold = r.bold ?? s.bold;
        if (bold) a.push(`font-weight="bold"`);
        if (r.font && r.font !== s.font) a.push(`font-family="${esc(CSS_FONT[r.font])}"`);
        if (r.color && r.color !== s.color) a.push(`fill="#${r.color}"`);
        if (r.underline) a.push(`text-decoration="underline"`);
        return `<tspan ${a.join(" ")}>${esc(r.text)}</tspan>`;
      }).join("");
      return `<text x="${f2(x * P)}" y="${f2(base)}" font-family="${esc(CSS_FONT[s.font])}" font-size="${f2(size)}" fill="#${s.color}"${s.align === "c" ? ' text-anchor="middle"' : ""}${s.bold ? ' font-weight="bold"' : ""} xml:space="preserve">${spans}</text>`;
    }).join("");
  }
  function toSVG(slide, o = {}) {
    let body = `<rect width="${SW * P}" height="${SH * P}" fill="#${C.BG}"/>`;
    for (const s of slide.shapes) {
      if (s.t === "image") { body += `<image x="${f2(s.x * P)}" y="${f2(s.y * P)}" width="${f2(s.w * P)}" height="${f2(s.h * P)}" preserveAspectRatio="none" href="${s.data}"/>`; continue; }
      if (s.t === "text") {
        let part = (s.box ? svgBox({ ...s, ...s.box, t: s.box.shape === "oval" ? "oval" : "rect" }) : "") + svgText(s);
        if (s.cover) {
          if (o.coverMode === "hide") continue;
          const op = o.coverMode === "faded" ? ' opacity="0.22"' : "";
          if (o.coverMode === "faded") part = svgBox({ ...s, ...s.box, t: "rect" });
          body += `<g id="answer-cover"${op}>${part}</g>`;
        } else body += part;
        continue;
      }
      body += svgBox(s);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(SW * P)}" height="${SH * P}" viewBox="0 0 ${SW * P} ${SH * P}">${body}</svg>`;
  }
  function toPNG(svg, scale = 2) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = Math.round(SW * P * scale); c.height = Math.round(SH * P * scale);
        const g = c.getContext("2d"); g.scale(scale, scale); g.drawImage(img, 0, 0);
        c.toBlob(b => b ? resolve(b) : reject(new Error("Could not make the picture")), "image/png");
      };
      img.onerror = () => reject(new Error("Could not draw the slide"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  // ---------- PPTX (PptxGenJS) ----------
  function addToPptx(pptx, slide) {
    const s = pptx.addSlide();
    s.background = { color: C.BG };
    for (const sh of slide.shapes) {
      if (sh.t === "image") { s.addImage({ data: sh.data, x: sh.x, y: sh.y, w: sh.w, h: sh.h, objectName: sh.name }); continue; }
      if (sh.t === "rect" || sh.t === "oval") {
        s.addShape(sh.t === "oval" ? pptx.ShapeType.ellipse : (sh.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect), {
          x: sh.x, y: sh.y, w: sh.w, h: sh.h, fill: { color: sh.fill }, line: sh.line ? { color: sh.line, width: sh.lw || 1 } : { type: "none" },
          rectRadius: sh.radius || undefined, rotate: sh.rot || undefined, objectName: sh.name });
        continue;
      }
      // text (optionally inside a shape)
      const textRuns = [];
      sh.paras.forEach((p, pi) => p.forEach((r, ri) => textRuns.push({ text: r.text, options: {
        bold: r.bold ?? sh.bold, fontFace: r.font || sh.font, color: r.color || sh.color, underline: r.underline ? { style: "sng" } : undefined,
        breakLine: ri === p.length - 1 && pi < sh.paras.length - 1 } })));
      const o = { x: sh.x, y: sh.y, w: sh.w, h: sh.h, fontSize: sh.size, fontFace: sh.font, color: sh.color, bold: sh.bold,
        valign: sh.anchor === "ctr" ? "middle" : "top", align: sh.align === "c" ? "center" : "left", objectName: sh.name,
        margin: [sh.insets.l * 72, sh.insets.r * 72, sh.insets.b * 72, sh.insets.t * 72], fit: "none", wrap: true, paraSpaceBefore: 0, paraSpaceAfter: 0 };
      if (sh.box) Object.assign(o, { shape: sh.box.shape === "oval" ? pptx.ShapeType.ellipse : (sh.box.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect),
        fill: { color: sh.box.fill }, line: sh.box.line ? { color: sh.box.line, width: sh.box.lw || 1 } : { type: "none" }, rectRadius: sh.box.radius || undefined });
      s.addText(textRuns, o);
    }
    if (slide.notes) s.addNotes(slide.notes);
    return s;
  }
  async function pptxBlob(slides) {
    const pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; pptx.title = "Do now: retrieval quiz"; pptx.author = "Do Now Quiz Builder"; pptx.company = "Do Now Quiz Builder";
    slides.forEach(sl => addToPptx(pptx, sl));
    return pptx.write({ outputType: "blob" });
  }

  window.DoNowSlides = { quizSlide, answersSlide, toSVG, toPNG, pptxBlob, runs, wrap, widthIn, fmtDate, plain, codeFits, C };
})();
