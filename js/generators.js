// Question generators: a JavaScript port of generators.py.
// Each generator takes an RNG and returns { q, ans, short, code?, lang?, misc?, marks? }.
// Answers are always computed here, never typed. The RNG calls happen in the same
// order as the Python reference, so tests/generators.html can replay recorded runs.
(function () {
  "use strict";

  // ---------- RNG with the Python random API we need ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class SeededRNG {
    constructor(seed) { this.f = mulberry32(seed); }
    random() { return this.f(); }
    randint(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
    choice(seq) { return seq[Math.floor(this.f() * seq.length)]; }
    sample(pop, k) {
      const idx = [...Array(pop.length).keys()], out = [];
      for (let i = 0; i < k; i++) { const j = i + Math.floor(this.f() * (idx.length - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; out.push(pop[idx[i]]); }
      return out;
    }
    shuffle(x) {
      for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
    }
  }
  // Replays a log recorded by make_vectors.py (values for randint/random, indices for choice/sample/shuffle).
  class ReplayRNG {
    constructor(log) { this.log = log.slice(); }
    next() { if (!this.log.length) throw new Error("RNG log ran out"); return this.log.shift(); }
    random() { return this.next(); }
    randint() { return this.next(); }
    choice(seq) { return seq[this.next()]; }
    sample(pop, k) { const idx = this.next(); if (idx.length !== k) throw new Error("sample size mismatch"); return idx.map(i => pop[i]); }
    shuffle(x) { const idx = this.next(), c = x.slice(); idx.forEach((i, n) => { x[n] = c[i]; }); }
  }

  // ---------- Python-style formatting helpers ----------
  const range = (a, b, s = 1) => { const o = []; if (s > 0) for (let i = a; i < b; i += s) o.push(i); else for (let i = a; i > b; i += s) o.push(i); return o; };
  const pyRange = n => range(0, n);
  const b8 = n => n.toString(2).padStart(8, "0");
  const X = n => n.toString(16).toUpperCase();
  const X2 = n => X(n).padStart(2, "0");
  const commas = s => { const [i, f] = String(s).split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); };
  const g = x => Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(6)));  // Python {:g} for our ranges
  const cg = x => commas(g(x));                                                     // Python {:,g}
  const c = n => commas(String(n));                                                 // Python {:,}
  const fmt = xs => xs.join(", ");
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = xs => xs.slice().sort(cmp);
  const idiv = (a, b) => Math.floor(a / b);
  const pyStrList = xs => "[" + xs.map(x => `'${x}'`).join(", ") + "]";
  const pyIntList2 = rows => "[" + rows.map(r => "[" + r.join(", ") + "]").join(", ") + "]";

  const G = {};

  // ---------------- 1.2.4 number systems ----------------
  G["denary-to-binary"] = r => { const n = r.randint(17, 254);
    return { q: `Convert the denary number **${n}** to 8-bit binary.`, ans: `**${b8(n)}**`, short: `${n} in binary?` }; };

  G["binary-to-denary"] = r => { const n = r.randint(17, 254);
    const parts = [...b8(n)].map((ch, i) => ch === "1" ? String(2 ** (7 - i)) : null).filter(Boolean);
    return { q: `Convert the binary number **${b8(n)}** to denary.`, ans: `**${n}** (${parts.join(" + ")})`, short: `${b8(n)} in denary?` }; };

  G["denary-to-hex"] = r => { const n = r.randint(17, 254);
    return { q: `Convert the denary number **${n}** to hexadecimal. Show your working.`,
      ans: `**${X(n)}**: ${n} = ${b8(n).slice(0, 4)} ${b8(n).slice(4)} = ${X(idiv(n, 16))} and ${X(n % 16)}`, short: `${n} in hex?` }; };

  G["hex-to-denary"] = r => { const n = r.randint(17, 254);
    return { q: `What is the hex number **${X2(n)}** in denary? Show your working.`,
      ans: `**${n}** (${idiv(n, 16)} × 16 + ${n % 16})`, short: `${X2(n)} in denary?` }; };

  G["hex-binary"] = r => { const n = r.randint(17, 254);
    if (r.random() < 0.5)
      return { q: `Convert hexadecimal **${X2(n)}** to 8-bit binary.`, ans: `**${b8(n).slice(0, 4)} ${b8(n).slice(4)}**`, short: `${X2(n)} in binary?` };
    return { q: `Convert the binary number **${b8(n)}** to hexadecimal.`,
      ans: `**${X2(n)}** (${b8(n).slice(0, 4)} = ${X(idiv(n, 16))}, ${b8(n).slice(4)} = ${X(n % 16)})`, short: `${b8(n)} in hex?` }; };

  G["binary-addition"] = r => { const a = r.randint(20, 200), b = r.randint(20, 200), s = a + b;
    const ans = s > 255
      ? `**${s.toString(2)}** (${a} + ${b} = ${s}). Needs 9 bits: **overflow error**; 8-bit result ${b8(s & 255)}`
      : `**${b8(s)}** (${a} + ${b} = ${s})`;
    return { q: `Add these 8-bit binary numbers: **${b8(a)} + ${b8(b)}**. Is there a problem?`, ans, short: `${b8(a)} + ${b8(b)}` }; };

  G["binary-shift"] = r => {
    const places = r.choice([1, 2, 3]), left = r.random() < 0.5;
    let n, res, eff;
    if (left) {
      n = r.random() < 0.7 ? r.randint(1, 255 >> places) : r.randint(64, 255);
      res = (n << places) & 255;
      const lost = (n << places) > 255;
      eff = `multiplies by ${2 ** places}` + (lost ? "; bits fell off the left, so the answer is **wrong** (overflow)" : "");
    } else {
      n = r.randint(8, 255); res = n >> places;
      const lost = n % (2 ** places) !== 0;
      eff = `divides by ${2 ** places}` + (lost ? "; bits lost off the right, so it is **rounded down**" : "");
    }
    const d = left ? "left" : "right";
    return { q: `Perform a **${places} place ${d}** binary shift on **${b8(n)}**. Give the result in binary and denary. What has happened?`,
      ans: `**${b8(res)} = ${res}** (was ${n}): ${eff}`, short: `${b8(n)} ${d} ${places}`, marks: 2 }; };

  G["binary-range"] = r => { const n = r.choice([4, 5, 6, 7, 8]);
    return { q: `What is the **largest** number that **${n} bits** can store? How many **different** values?`,
      ans: `Largest **${2 ** n - 1}**; **${2 ** n}** values (2^${n})`, short: `${n} bits: largest? how many?` }; };

  // ---------------- characters, images, sound, units ----------------
  G["ascii-next"] = r => { const base = r.choice(["A", "a"]);
    const c1 = String.fromCharCode(base.charCodeAt(0) + r.randint(0, 5));
    const c2 = String.fromCharCode(c1.charCodeAt(0) + r.randint(2, 12));
    return { q: `In ASCII, **${c1} = ${c1.charCodeAt(0)}**. What is the code for **${c2}**?`, ans: `**${c2.charCodeAt(0)}**: letters are stored in order`, short: `ASCII ${c2}?` }; };

  // " = 2 KB" only when it's a whole number of KB (no decimal answers)
  const kb = by => by >= 1000 && by % 1000 === 0 ? ` = **${idiv(by, 1000)} KB**` : "";

  G["text-file-size"] = r => { const n = r.choice([100, 200, 500, 1000, 2000, 5000]);
    const [cs, bits] = r.choice([["ASCII (8 bits per character)", 8], ["extended ASCII", 8], ["Unicode (16 bits per character)", 16]]);
    const by = idiv(n * bits, 8);
    return { q: `A text file has **${c(n)} characters** stored in **${cs}**. What is its minimum size in **bytes**?`,
      ans: `${c(n)} × ${bits} = ${c(n * bits)} bits ÷ 8 = **${c(by)} bytes**${kb(by)}`, short: `${c(n)} chars, ${bits}-bit` }; };

  G["image-size"] = r => {
    let w, h, depth, how, work, bits;
    for (;;) {  // re-roll until the bits make whole bytes
      w = r.choice([4, 5, 8, 10, 20, 50, 100]); h = r.choice([4, 5, 8, 10, 20, 50, 100]);
      if (r.random() < 0.6) {
        const colours = r.choice([2, 4, 8, 16, 256]);
        depth = Math.log2(colours);
        how = `**${colours} colours**`;
        work = `${colours} colours needs ${depth} bit${depth > 1 ? "s" : ""}. `;
      } else { depth = r.choice([1, 2, 4, 8]); how = `a colour depth of **${depth} bit${depth > 1 ? "s" : ""}**`; work = ""; }
      bits = w * h * depth;
      if (bits % 8 === 0) break;
    }
    return { q: `An image is **${w} × ${h} pixels** with ${how}. What is its file size in **bytes**?`,
      ans: `${work}${w} × ${h} × ${depth} = ${c(bits)} bits ÷ 8 = **${c(idiv(bits, 8))} bytes**${kb(idiv(bits, 8))}`,
      short: `${w} × ${h}, ${depth}-bit image`, marks: 2 }; };

  G["colours-from-depth"] = r => { const d = r.choice([1, 2, 3, 4, 5, 6, 8]);
    if (r.random() < 0.5) return { q: `How many colours can each pixel show with a colour depth of **${d} bits**?`, ans: `**${2 ** d}** (2^${d})`, short: `${d}-bit colours?` };
    return { q: `An image uses **${2 ** d} colours**. What is the minimum colour depth?`, ans: `**${d} bits** (2^${d} = ${2 ** d})`, short: `${2 ** d} colours: bits?` }; };

  G["sound-size"] = r => {
    const secs = r.choice([1, 2, 5, 10]), hz = r.choice([100, 200, 500, 1000]), depth = r.choice([4, 8, 16]);
    const bits = hz * secs * depth;
    return { q: `A sound is **${secs} second${secs > 1 ? "s" : ""}** long, sample rate **${c(hz)} Hz**, bit depth **${depth} bits**. What is its size in **bytes**?`,
      ans: `${c(hz)} × ${secs} × ${depth} = ${c(bits)} bits ÷ 8 = **${c(idiv(bits, 8))} bytes**${kb(idiv(bits, 8))}`,
      short: `${secs} s, ${c(hz)} Hz, ${depth}-bit`, marks: 2 }; };

  // ---------------- operators ----------------
  G["mod-div"] = r => { const b = r.choice([3, 4, 5, 6, 7, 8, 10, 60]), a = b === 60 ? r.randint(70, 200) : r.randint(10, 60);
    const ctx = b === 60 ? " How might this be useful in real life?" : "";
    const extra = b === 60 ? ` (${a} minutes = ${idiv(a, b)} hours ${a % b} minutes)` : "";
    return { q: `What is **${a} DIV ${b}** (${a} // ${b} in Python) and **${a} MOD ${b}** (${a} % ${b})?${ctx}`, ans: `**${idiv(a, b)}** and **${a % b}**${extra}`, short: `${a} DIV / MOD ${b}` }; };

  // ---------------- 2.1.3 searching and sorting ----------------
  const WORDS = [["Cat", "Zebra", "Ant", "Dog", "Horse"], ["Tango", "Milk", "Cola", "Water"], ["Frog", "Cat", "Zombie", "Dog", "Rabbit"],
    ["Pear", "Apple", "Mango", "Kiwi", "Lime"], ["Wroxham", "Aylsham", "Holt", "Cromer", "Diss"]];
  const items = (r, n) => r.random() < 0.6 ? r.sample(range(1, 30), n) : r.choice(WORDS).slice(0, n);
  const br = xs => "[" + fmt(xs) + "]";

  G["bubble-pass"] = r => { const xs = items(r, r.choice([4, 5])), a = xs.slice(), passes = [];
    for (;;) { let swapped = false;
      for (let i = 0; i < a.length - 1; i++) if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; }
      passes.push(a.slice()); if (!swapped) break; }
    return { q: `Perform a **bubble sort** on: **${fmt(xs)}**. Show the list after each pass.`,
      ans: passes.map(br).join(" → ") + " (last pass: no swaps, so stop)", short: `Bubble sort ${fmt(xs)}` }; };

  G["insertion-sort"] = r => { const xs = items(r, r.choice([4, 5])), a = xs.slice(), steps = [];
    for (let i = 1; i < a.length; i++) { const k = a[i]; let j = i - 1;
      while (j >= 0 && a[j] > k) { a[j + 1] = a[j]; j--; }
      a[j + 1] = k; steps.push(a.slice()); }
    return { q: `Perform an **insertion sort** on: **${fmt(xs)}**. Show the list after each item is inserted.`, ans: steps.map(br).join(" → "), short: `Insertion sort ${fmt(xs)}` }; };

  G["merge-sort"] = r => { const xs = r.random() < 0.7 ? r.sample(range(1, 10), 8) : r.sample(range(1, 30), 8);
    const pairs = [0, 2, 4, 6].map(i => sorted(xs.slice(i, i + 2))), fours = [sorted(xs.slice(0, 4)), sorted(xs.slice(4))];
    return { q: `Perform a **merge sort** on: **${fmt(xs)}**. Show each stage.`,
      ans: `Split to single items, then merge: ${pairs.map(br).join(" ")} → ${fours.map(br).join(" ")} → **[${fmt(sorted(xs))}]**`, short: "Merge sort 8 items" }; };

  G["binary-search"] = r => {
    const xs = r.random() < 0.6 ? sorted(r.sample(range(1, 99), r.choice([7, 8, 9])))
      : sorted(r.choice([["Ant", "Bee", "Cat", "Dog", "Eel", "Fox", "Gnu"], ["Cat", "Dog", "Ear", "Hat", "Sun", "Tie", "Vat", "Yak"]]));
    const target = r.choice(xs); let lo = 0, hi = xs.length - 1; const seen = [];
    while (lo <= hi) { const m = idiv(lo + hi, 2); seen.push(xs[m]); if (xs[m] === target) break; if (xs[m] < target) lo = m + 1; else hi = m - 1; }
    return { q: `Show the stages of a **binary search** for **${target}** in: **${fmt(xs)}**`,
      ans: `Compare with **${seen.join(", then ")}**: found after **${seen.length}** comparison${seen.length > 1 ? "s" : ""}. (Middle = (first + last) DIV 2.)`,
      short: `Binary search for ${target}` }; };

  G["linear-search"] = r => { const xs = r.sample(range(1, 20), 6), t = r.choice(xs.slice(1)), i = xs.indexOf(t);
    return { q: `A **linear search** looks for **${t}** in: **${fmt(xs)}**. Which items are checked? Why couldn't binary search be used?`,
      ans: `**${fmt(xs.slice(0, i + 1))}** (${i + 1} checks). Binary search needs a **sorted** list.`, short: `Linear search for ${t}`, marks: 2 }; };

  // ---------------- 2.2 code reading ----------------
  G["range-loop"] = r => { let a, b, s;
    if (r.random() < 0.5) { a = r.randint(0, 5); b = r.randint(8, 20); s = r.choice([2, 3, 4]); }
    else { a = r.randint(10, 20); b = r.randint(0, 4); s = r.choice([-1, -2, -3, -5]); }
    return { q: "What does this loop print?", code: [`for i in range(${a}, ${b}, ${s}):`, "    print(i)"], lang: "python",
      ans: `**${fmt(range(a, b, s))}**: stops **before** ${b}`, short: `range(${a}, ${b}, ${s})?` }; };

  G["while-trace"] = r => { const kind = r.choice(["sub", "double", "acc"]); let code, out;
    if (kind === "sub") { let n = r.randint(30, 60); const k = r.choice([7, 9, 11, 12]), lim = r.choice([0, 5]);
      code = [`n = ${n}`, "count = 0", `while n > ${lim}:`, `    n = n - ${k}`, "    count = count + 1", "print(count)"];
      let count = 0; while (n > lim) { n -= k; count++; } out = count; }
    else if (kind === "double") { let n = r.choice([1, 2, 3]); const lim = r.choice([50, 100, 200]);
      code = [`n = ${n}`, "steps = 0", `while n < ${lim}:`, "    n = n * 2", "    steps = steps + 1", "print(n)"];
      while (n < lim) n *= 2; out = n; }
    else { const step = r.choice([2, 3]), lim = r.choice([15, 20, 30]);
      code = ["total = 0", "n = 1", `while total < ${lim}:`, "    total = total + n", `    n = n + ${step}`, "print(n)"];
      let total = 0, n = 1; while (total < lim) { total += n; n += step; } out = n; }
    return { q: "What does this print? (Use a trace table.)", code, ans: `**${out}**`, short: "While loop trace", marks: 2 }; };

  G["string-slice"] = r => { const w = r.choice(["COMPUTER", "ALGORITHM", "BROADLAND", "KEYBOARD", "NORWICH", "VARIABLE"]);
    const a = r.randint(0, 3), b = a + r.randint(2, 4);
    return { q: "What does this print?", code: [`w = "${w}"`, `print(w[${a}:${b}] + w[-1] + str(len(w)))`],
      ans: `**${w.slice(a, b) + w.slice(-1) + w.length}**: [${a}:${b}] is index ${a} up to (not incl.) ${b}`, short: `Slicing "${w}"` }; };

  G["list-ops"] = r => { const it = r.sample(["Cow", "Fox", "Rat", "Owl", "Eel", "Yak", "Bee", "Ape"], 4), a = it.slice(0, 3), extra = it[3];
    const k = r.randint(0, 2);
    const ops = [`pets = ${pyStrList(a)}`.replace(/'/g, '"'), `pets.append("${extra}")`, `pets[${k}] = "Hen"`, "pets.pop(0)", "for pet in pets:", "    print(pet)"];
    const pets = a.slice(); pets.push(extra); pets[k] = "Hen"; pets.shift();
    return { q: "What will be printed?", code: ops, ans: "**" + pets.join(", ") + "** (one per line)", short: "List operations" }; };

  G["list-2d"] = r => { const grid = [0, 1].map(() => [0, 1, 2].map(() => r.randint(1, 9)));
    const i1 = r.randint(0, 1), j1 = r.randint(0, 2), i2 = r.randint(0, 1), j2 = r.randint(0, 2);
    return { q: "What does this print?", code: [`scores = ${pyIntList2(grid)}`, `print(scores[${i1}][${j1}] + scores[${i2}][${j2}])`],
      ans: `**${grid[i1][j1] + grid[i2][j2]}**: row ${i1} col ${j1} = ${grid[i1][j1]}; row ${i2} col ${j2} = ${grid[i2][j2]}`,
      short: `scores[${i1}][${j1}] + scores[${i2}][${j2}]` }; };

  // ---------------- 2.3 testing ----------------
  G["test-data"] = r => { const [lo, hi] = r.choice([[1, 10], [1, 120], [0, 100], [11, 16], [1, 31]]);
    const what = { "1,10": "a score", "1,120": "an age", "0,100": "a percentage", "11,16": "a school age", "1,31": "a day of the month" }[lo + "," + hi];
    return { q: `An input for ${what} must be a whole number from **${lo} to ${hi}**. Give **normal, boundary, invalid** and **erroneous** test data.`,
      ans: `Normal **${idiv(lo + hi, 2)}**; boundary **${lo} and ${hi}** (also ${lo - 1}/${hi + 1}); invalid **${hi + 5}**; erroneous **"ten"** (wrong type)`,
      short: `Test data ${lo} to ${hi}` }; };

  // ---------------- 2.4 logic ----------------
  const EXPRS = ["NOT (A OR B)", "A AND NOT B", "NOT A OR B", "(A OR B) AND NOT C", "A AND (B OR C)", "NOT (A AND B) OR C", "NOT A AND NOT B"];
  const ev = (e, A, B, C) => Number(Boolean(new Function("A", "B", "C", "return " + e.replace(/NOT/g, "!").replace(/AND/g, "&&").replace(/OR/g, "||"))(A, B, C)));

  G["logic-eval"] = r => { const e = r.choice(EXPRS), A = r.randint(0, 1), B = r.randint(0, 1), C = r.randint(0, 1);
    const vals = `A = ${A}, B = ${B}` + (e.includes("C") ? `, C = ${C}` : "");
    return { q: `Work out **P = ${e}** when ${vals}.`, ans: `**${ev(e, A, B, C)}**`, short: `P = ${e}` }; };

  G["logic-draw"] = r => { const e = r.choice(EXPRS.filter(x => !x.includes("C")));
    const rows = []; for (const a of [0, 1]) for (const b of [0, 1]) rows.push(`${a}${b}→${ev(e, a, b, 0)}`);
    return { q: `Draw the logic circuit for **P = ${e}** and complete its truth table.`, ans: `Truth table (AB→P): **${rows.join(", ")}**`, short: `Draw P = ${e}` }; };

  G["units"] = r => { const k = r.choice(["nibbles", "bits-kb", "files-fit", "mb-gb"]);
    if (k === "nibbles") { const n = r.choice([3, 6, 12, 20]); return { q: `How many **nibbles** are there in **${n} bytes**?`, ans: `**${2 * n}** (2 nibbles per byte)`, short: `Nibbles in ${n} bytes` }; }
    if (k === "bits-kb") { const kb = r.choice([2, 4, 5, 8]); return { q: `A file is **${c(kb * 8000)} bits**. What is that in kilobytes?`, ans: `÷ 8 = ${c(kb * 1000)} bytes ÷ 1000 = **${kb} KB**`, short: `${c(kb * 8000)} bits in KB` }; }
    if (k === "files-fit") { const [fsz, fu, dsz, du] = r.choice([[500, "KB", 1, "GB"], [4, "MB", 2, "GB"], [250, "MB", 1, "TB"], [5, "MB", 16, "GB"]]);
      const scale = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }, n = Math.floor(dsz * scale[du] / (fsz * scale[fu]));
      return { q: `How many **${fsz} ${fu}** files fit on a **${dsz} ${du}** device?`, ans: `**${c(n)}** (${dsz} ${du} = ${c(Math.round(dsz * scale[du] / scale[fu]))} ${fu}, ÷ ${fsz})`, short: `${fsz} ${fu} files on ${dsz} ${du}` }; }
    const n = r.choice([2, 3, 5]);
    return { q: `How many **megabytes** are in **${n} gigabytes**?`, ans: `**${c(n * 1000)}** (${n} × 1000; or ${c(n * 1024)} using 1024)`, short: `MB in ${n} GB` }; };

  // ---------------- ERL and exam-style ----------------
  G["erl-for-loop"] = r => { let a, b, s;
    if (r.random() < 0.5) { a = r.randint(0, 4); b = r.randint(6, 14); s = r.choice([1, 2, 3]); }
    else { a = r.randint(9, 15); b = r.randint(0, 3); s = r.choice([-1, -2, -3]); }
    const out = range(a, b + (s > 0 ? 1 : -1), s), head = `for i = ${a} to ${b}` + (s !== 1 ? ` step ${s}` : "");
    return { q: "What does this ERL loop output? How many times does it run?", code: [head, "    print(i)", "next i"], lang: "erl",
      ans: `**${fmt(out)}**: ${out.length} times (the end value **is** included in ERL)`, short: head,
      misc: "Assuming the end value is excluded, as in Python range()." }; };

  G["erl-strings"] = r => { const w = r.choice(["Broadland", "keyboard", "Wroxham", "printer", "Norwich", "Computer", "Algorithm"]);
    const st = r.randint(1, 3), ln = r.randint(2, 4), lft = r.randint(2, 4);
    return { q: "What does each line output?", code: [`w = "${w}"`, "print(w.length)", "print(w.upper)", `print(w.left(${lft}))`, `print(w.substring(${st}, ${ln}))`], lang: "erl",
      ans: `**${w.length}**, **${w.toUpperCase()}**, **${w.slice(0, lft)}**, **${w.slice(st, st + ln)}** (substring = start ${st}, length ${ln})`, short: `ERL strings on "${w}"`,
      misc: "Treating substring(x, i) as start and end (like Python slices); i is the number of characters." }; };

  G["ascii-encode"] = r => { const word = r.choice(["CAB", "DOG", "POP", "HI", "MAP", "BED", "SUN"]);
    const ref = String.fromCharCode([...word].sort()[0].charCodeAt(0) - r.randint(0, 2));
    return { q: `In ASCII, **${ref} = ${b8(ref.charCodeAt(0))}**. Write **${word}** in 8-bit ASCII binary.`,
      ans: "**" + [...word].map(ch => b8(ch.charCodeAt(0))).join(" ") + "** (" + [...word].map(ch => `${ch} = ${ch.charCodeAt(0)}`).join(", ") + ")", short: `${word} in ASCII`, marks: 2 }; };

  G["ipv4-valid"] = r => {
    const ok = () => [0, 1, 2, 3].map(() => r.randint(1, 254)).join(".");
    const bad = [() => { const p = [r.randint(256, 300), r.randint(0, 255), r.randint(0, 255), r.randint(1, 254)]; return p.join("."); },
      () => [0, 1, 2, 3, 4].map(() => r.randint(1, 254)).join("."), () => [0, 1, 2].map(() => r.randint(1, 254)).join(".")];
    const its = [[ok(), true], [ok(), true]]; its.push([r.choice(bad)(), false]); its.push([r.choice(bad)(), false]);
    r.shuffle(its);
    const why = a => { const p = a.split("."); return p.length !== 4 ? `${p.length} groups` : "a number over 255"; };
    return { q: "Valid or invalid IPv4? " + its.map(([a]) => `**${a}**`).join(", "),
      ans: its.map(([a, v]) => `${a}: **${v ? "valid" : "invalid (" + why(a) + ")"}**`).join(", "), short: "Valid IPv4?", marks: 2,
      misc: "Forgetting that each of the 4 numbers must be 0 to 255." }; };

  G["test-data-classify"] = r => { const [lo, hi] = r.choice([[1, 10], [1, 50], [0, 100], [18, 65], [1, 12]]);
    const inv = hi + r.randint(1, 9), err = r.choice(['"ten"', '"abc"', "7.5x"]);
    const its = [[hi, "boundary"], [idiv(lo + hi, 2), "normal"], [inv, "invalid"], [err, "erroneous"]];
    r.shuffle(its);
    return { q: `Valid input is a whole number from **${lo} to ${hi}**. Classify each as normal, boundary, invalid or erroneous: ` + its.map(([v]) => `**${v}**`).join(", "),
      ans: its.map(([v, t]) => `${v} = **${t}**`).join(", "), short: `Classify test data ${lo}–${hi}` }; };

  G["sql-select"] = r => { const [table, fields, cond] = r.choice([
      ["TblBoats", ["BoatName", "Length", "Price"], ["Length", ">", "8"]],
      ["TblMembers", ["Name", "Town", "Age"], ["Town", "=", '"Holt"']],
      ["TblFilms", ["Title", "Rating", "Year"], ["Rating", "=", '"PG"']],
      ["TblBirds", ["Species", "Count", "Site"], ["Count", ">=", "10"]]]);
    const show = r.sample(fields, 2);
    return { q: `Table **${table}** has fields ${fields.join(", ")}. Write SQL to show **${show[0]}** and **${show[1]}** where **${cond[0]} ${cond[1]} ${cond[2].replace(/^"|"$/g, "")}**.`,
      ans: `**SELECT ${show[0]}, ${show[1]} FROM ${table} WHERE ${cond[0]} ${cond[1]} ${cond[2]}**`, short: `SQL on ${table}`,
      misc: "Using AND between field names, spaces in names, or no quotes around text values." }; };

  window.DoNowGen = { GENERATORS: G, SeededRNG, ReplayRNG, pyRange };
})();
