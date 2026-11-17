/*
  Tegner skriveark ud fra datafilen og konstanterne.

  Køres i browseren af lav.js. Indeholder intet, der er særligt for et
  bestemt bogstav — et nyt bogstav er en ny post i data/bogstaver.json.

  Koordinatsystem for pilene (i datafilen):
    (0, 0) er bogstavets startpunkt på grundlinjen.
    x går mod højre, y går OPAD.
    1 enhed = én linjeafstand, altså fra grundlinjen op til toplinjen.
    Midterlinjen ligger derfor i y = konstanter.midterlinje.
  Samme tal virker i alle størrelser, fordi de skaleres med linjeafstanden.
*/

const SVG = "http://www.w3.org/2000/svg";
const PX_PR_MM = 96 / 25.4;      // kun til at aflæse mål, aldrig til layout
const MM_PR_PT = 25.4 / 72;

function el(navn, attr = {}, ns = SVG) {
  const e = ns ? document.createElementNS(ns, navn) : document.createElement(navn);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  return e;
}
const tal = (n) => +n.toFixed(3);

/* ---------- Skrifttypens mål, aflæst fra selve fonten ---------- */

let METRIK = null;
async function maalSkrifttype() {
  await document.fonts.load('700 100px "Andika"');
  await document.fonts.load('400 100px "Andika"');
  if (!document.fonts.check('400 100px "Andika"')) {
    throw new Error("Skrifttypen Andika kunne ikke indlæses.");
  }
  const c = document.createElement("canvas").getContext("2d");
  c.font = '1000px "Andika"';
  const xHoejde = c.measureText("x").actualBoundingBoxAscent / 1000;
  METRIK = {
    xHoejde,
    bredde: (tegn) => c.measureText(tegn).width / 1000,
  };
}

/*
  Skriftstørrelse for sporingsbogstaver: vælges så bogstavernes x-højde
  lander præcis på midterlinjen. Afledt af konstanterne, ikke sat i hånden.
*/
function skriftstoerrelse(L, k) {
  return (k.midterlinje * L) / METRIK.xHoejde;
}

/* ---------- Hjælpelinjer: ÉN funktion til alle felter ---------- */

/*
  Returnerer linjernes lodrette placering i et felt med linjeafstand L.
  Både stort og lille øvefelt, svarlinjerne og det store sporingsfelt
  kalder denne funktion. Ingen linje placeres andre steder.
*/
function linjeplacering(L, k) {
  const top = k.stregtykkelse;               // lige plads til stregen
  const grund = top + L;
  const midt = grund - k.midterlinje * L;
  const hoejde = grund + k.underlaengde * L;
  return { top, midt, grund, hoejde };
}

function tegnLinjer(svg, bredde, y, k) {
  const streg = { stroke: "#000", "stroke-width": k.stregtykkelse, fill: "none" };
  svg.append(
    el("line", { x1: 0, x2: bredde, y1: y.top, y2: y.top, ...streg, class: "linje top" }),
    el("line", {
      x1: 0, x2: bredde, y1: y.midt, y2: y.midt, ...streg,
      "stroke-dasharray": k.stiplet.join(" "), class: "linje midt",
    }),
    el("line", { x1: 0, x2: bredde, y1: y.grund, y2: y.grund, ...streg, class: "linje grund" })
  );
}

function nytFelt(bredde, L, k) {
  const y = linjeplacering(L, k);
  const svg = el("svg", {
    class: "felt",
    width: `${tal(bredde)}mm`,
    height: `${tal(y.hoejde)}mm`,
    viewBox: `0 0 ${tal(bredde)} ${tal(y.hoejde)}`,
  });
  svg.dataset.linjer = [y.top, y.midt, y.grund].map(tal).join(",");
  svg.dataset.linjeafstand = tal(L);
  tegnLinjer(svg, bredde, y, k);
  return { svg, y };
}

/* ---------- Øvefelt med stiplede bogstaver ---------- */

function oevefelt(bredde, tegn, k) {
  const L = k.linjeafstand;
  const { svg, y } = nytFelt(bredde, L, k);
  const fs = skriftstoerrelse(L, k);
  const skridt = METRIK.bredde(tegn) * fs + k.bogstavAfstand * L;
  const graense = bredde * k.sporAndel;
  for (let x = k.bogstavAfstand * L * 0.5; x + skridt <= graense + 0.01; x += skridt) {
    const t = el("text", {
      x: tal(x), y: tal(y.grund), "font-size": tal(fs),
      fill: "none", stroke: "#000", "stroke-width": 0.32,
      "stroke-dasharray": "0.9 0.7", "stroke-linejoin": "round",
    });
    t.textContent = tegn;
    svg.append(t);
  }
  return svg;
}

/* ---------- Det store sporingsfelt med nummererede pile ---------- */

// Glat kurve gennem punkterne (Catmull-Rom omsat til Bézier).
function kurve(p) {
  if (p.length === 2) return `M${p[0]}L${p[1]}`;
  let d = `M${p[0]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${c1.map(tal)} ${c2.map(tal)} ${c.map(tal)}`;
  }
  return d;
}

function tegnPil(svg, pil, tilSvg, k) {
  const punkter = pil.vej.map(tilSvg);
  svg.append(el("path", {
    d: kurve(punkter), fill: "none", stroke: "#000",
    "stroke-width": 0.55, "stroke-linecap": "round",
    "marker-end": "url(#pilespids)",
  }));
  const [cx, cy] = pil.nummer ? tilSvg(pil.nummer) : punkter[0];
  const r = 3.1;
  svg.append(el("circle", { cx: tal(cx), cy: tal(cy), r, fill: "#fff", stroke: "#000", "stroke-width": 0.45 }));
  const t = el("text", {
    x: tal(cx), y: tal(cy), "font-size": tal(11 * MM_PR_PT), "font-weight": 700,
    "text-anchor": "middle", "dominant-baseline": "central", fill: "#000",
  });
  t.textContent = pil.nr;
  svg.append(t);
}

function tegnGitter(svg, x0, grund, L, bredde) {
  const g = el("g", { class: "gitter" });
  for (let i = -1; i <= Math.ceil(bredde * 10) + 1; i++) {
    const x = x0 + (i / 10) * L;
    g.append(el("line", { x1: tal(x), x2: tal(x), y1: tal(grund - 1.1 * L), y2: tal(grund + 0.4 * L),
      stroke: "#000", "stroke-width": i % 5 ? 0.05 : 0.15 }));
    if (i % 5 === 0) {
      const t = el("text", { x: tal(x), y: tal(grund + 0.4 * L + 3), "font-size": 2.5, "text-anchor": "middle", fill: "#000" });
      t.textContent = (i / 10).toFixed(1);
      g.append(t);
    }
  }
  for (let j = -4; j <= 11; j++) {
    const y = grund - (j / 10) * L;
    g.append(el("line", { x1: tal(x0 - 0.1 * L), x2: tal(x0 + (bredde + 0.1) * L), y1: tal(y), y2: tal(y),
      stroke: "#000", "stroke-width": j % 5 ? 0.05 : 0.15 }));
    if (j % 5 === 0) {
      const t = el("text", { x: tal(x0 - 0.1 * L - 1), y: tal(y), "font-size": 2.5, "text-anchor": "end", "dominant-baseline": "central", fill: "#000" });
      t.textContent = (j / 10).toFixed(1);
      g.append(t);
    }
  }
  svg.append(g);
}

function sporingsfelt(bredde, post, k, valg) {
  const L = k.linjeafstand * k.storSkala;
  const { svg, y } = nytFelt(bredde, L, k);
  svg.classList.add("stor");

  const defs = el("defs");
  const m = el("marker", {
    id: "pilespids", viewBox: "0 0 10 10", refX: 7, refY: 5,
    markerWidth: 3.2, markerHeight: 3.2, markerUnits: "userSpaceOnUse", orient: "auto",
  });
  m.append(el("path", { d: "M0,0 L10,5 L0,10 Z", fill: "#000" }));
  defs.append(m);
  svg.append(defs);

  const fs = skriftstoerrelse(L, k);
  const stort = post.bogstav.toLocaleUpperCase("da");
  const lille = post.bogstav.toLocaleLowerCase("da");
  const bStor = METRIK.bredde(stort) * fs;
  const bLille = METRIK.bredde(lille) * fs;
  const luft = 0.35 * L;
  const start = (bredde - (bStor + luft + bLille)) / 2;

  const glyffer = [
    { tegn: stort, x: start, pile: post.pile?.stort || [], b: bStor },
    { tegn: lille, x: start + bStor + luft, pile: post.pile?.lille || [], b: bLille },
  ];
  for (const g of glyffer) {
    if (valg.gitter) tegnGitter(svg, g.x, y.grund, L, g.b / L);
    const t = el("text", {
      x: tal(g.x), y: tal(y.grund), "font-size": tal(fs),
      fill: "#fff", stroke: "#000", "stroke-width": 0.5, "stroke-linejoin": "round",
    });
    t.textContent = g.tegn;
    svg.append(t);
    const tilSvg = ([px, py]) => [g.x + px * L, y.grund - py * L];
    g.pile.forEach((p) => tegnPil(svg, p, tilSvg, k));
  }
  return svg;
}

/* ---------- Billedet: ren sort/hvid, ingen gråtoner ---------- */

async function sortHvid(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lys = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const v = lys < 150 ? 0 : 255;
    p[i] = p[i + 1] = p[i + 2] = v;
    p[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

/* ---------- Ét ark ---------- */

function mm(element) {
  return element.getBoundingClientRect().width / PX_PR_MM;
}

async function lavArk(post, k, billede, valg) {
  const ark = el("section", { class: "ark", "data-bogstav": post.bogstav }, null);
  const ramme = el("div", { class: "ramme" }, null);
  const venstre = el("div", { class: "kolonne venstre" }, null);
  const hoejre = el("div", { class: "kolonne hoejre" }, null);
  ramme.append(venstre, hoejre);
  ark.append(ramme);
  document.getElementById("ark-liste").append(ark);

  const stort = post.bogstav.toLocaleUpperCase("da");
  const lille = post.bogstav.toLocaleLowerCase("da");

  const h1 = el("h1", {}, null);
  const b = el("span", { class: "bogstav" }, null);
  b.textContent = stort;
  h1.append(b, document.createTextNode(` for ${post.dyr}`));
  venstre.append(h1);

  // Bredden aflæses fra layoutet, som er sat i mm i CSS.
  const bv = mm(venstre);
  const bh = mm(hoejre);

  const spor = el("div", { class: "sporing" }, null);
  spor.append(sporingsfelt(bv - 0.7, post, k, valg));
  venstre.append(spor);

  const e1 = el("p", { class: "etiket" }, null);
  e1.textContent = `Spor det store ${stort}`;
  const e2 = el("p", { class: "etiket" }, null);
  e2.textContent = `Spor det lille ${lille}`;
  venstre.append(e1, oevefelt(bv, stort, k), e2, oevefelt(bv, lille, k));

  const vindue = el("div", { class: "vindue" }, null);
  const img = el("img", { alt: post.dyr }, null);
  img.src = await sortHvid(billede);
  await img.decode();
  vindue.append(img);

  const tekst = el("p", { class: "beskrivelse" }, null);
  tekst.textContent = post.beskrivelse;
  const sp = el("p", { class: "spoergsmaal" }, null);
  sp.textContent = post.spoergsmaal;
  hoejre.append(vindue, tekst, sp);
  for (let i = 0; i < k.svarlinjer; i++) hoejre.append(nytFelt(bh, k.linjeafstand, k).svg);
}

/* ---------- Kontrol: fanger fejl før PDF'en laves ---------- */

/*
  Elementer inde i en SVG måles ikke hver for sig: en tekst har en usynlig
  kasse, der er meget større end bogstavet, og SVG'en klipper alligevel alt,
  der går ud over den. Selve SVG'en bliver målt.
*/
const UDEN_SVG_INDHOLD = "*:not(svg *)";

function kontroller() {
  const fejl = [];
  const tillad = new Set(["rgb(0, 0, 0)", "rgb(255, 255, 255)", "rgba(0, 0, 0, 0)", "none", "#000", "#fff", "transparent"]);
  for (const ark of document.querySelectorAll(".ark")) {
    const B = ark.dataset.bogstav;
    const a = ark.getBoundingClientRect();
    const ind = (r) => ({
      v: (r.left - a.left) / PX_PR_MM, h: (a.right - r.right) / PX_PR_MM,
      o: (r.top - a.top) / PX_PR_MM, n: (a.bottom - r.bottom) / PX_PR_MM,
    });

    // 1. Alt skal ligge mindst 8 mm fra papirets kant. (Gitteret er kun en
    //    hjælp til at placere pile og kommer aldrig med på det færdige ark.)
    for (const e of ark.querySelectorAll(UDEN_SVG_INDHOLD)) {
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const m = ind(r);
      const min = Math.min(m.v, m.h, m.o, m.n);
      if (min < 8 - 0.01) fejl.push(`${B}: <${e.tagName.toLowerCase()} class="${e.getAttribute("class") || ""}"> ligger ${min.toFixed(1)} mm fra kanten`);
    }

    // 2. Indholdet må ikke løbe ud over rammen.
    const ramme = ark.querySelector(".ramme");
    const ri = ramme.getBoundingClientRect();
    for (const e of ramme.querySelectorAll(UDEN_SVG_INDHOLD)) {
      const r = e.getBoundingClientRect();
      if (r.bottom > ri.bottom + 0.5 || r.right > ri.right + 0.5) {
        fejl.push(`${B}: <${e.tagName.toLowerCase()} class="${e.getAttribute("class") || ""}"> løber ud over rammen`);
      }
    }

    // 3. Tegningen skal ligge inde i sit vindue.
    const v = ark.querySelector(".vindue").getBoundingClientRect();
    const i = ark.querySelector(".vindue img").getBoundingClientRect();
    if (i.left < v.left - 0.5 || i.right > v.right + 0.5 || i.top < v.top - 0.5 || i.bottom > v.bottom + 0.5) {
      fejl.push(`${B}: tegningen flyder ud over vinduet`);
    }

    // 4. Alle felter med almindelig linjeafstand skal have præcis samme linjer.
    const felter = [...ark.querySelectorAll("svg.felt:not(.stor)")].map((s) => s.dataset.linjer);
    if (new Set(felter).size !== 1) fejl.push(`${B}: øvefelterne har forskellige linjer: ${felter.join(" | ")}`);

    // 5. Brødtekst mindst 14 pt.
    for (const e of ark.querySelectorAll("p")) {
      const pt = parseFloat(getComputedStyle(e).fontSize) * 72 / 96;
      if (pt < 14 - 0.01) fejl.push(`${B}: tekst i <p class="${e.className}"> er ${pt.toFixed(1)} pt`);
    }

    // 6. Kun sort og hvid.
    for (const e of ark.querySelectorAll("*")) {
      const s = getComputedStyle(e);
      const farver = [s.color, s.backgroundColor, s.borderTopColor, s.fill, s.stroke];
      if (e.tagName === "img") continue;
      for (const f of farver) {
        if (f && !tillad.has(f) && !f.startsWith("url(")) {
          fejl.push(`${B}: farven ${f} på <${e.tagName.toLowerCase()}> er ikke ren sort eller hvid`);
          break;
        }
      }
      if (s.boxShadow !== "none" || s.textShadow !== "none") fejl.push(`${B}: skygge på <${e.tagName.toLowerCase()}>`);
    }
  }
  return fejl;
}

/* ---------- Indgang fra lav.js ---------- */

window.tegnArk = async function (poster, konstanter, billeder, valg = {}) {
  await maalSkrifttype();
  for (const post of poster) {
    await lavArk(post, konstanter, billeder[post.bogstav], valg);
  }
  return kontroller();
};
