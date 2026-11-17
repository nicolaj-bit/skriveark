/*
  Tegner skriveark ud fra datafilen og konstanterne.

  Køres i browseren af lav.js. Intet her er særligt for et bestemt
  bogstav — et nyt bogstav er en ny post i data/bogstaver.json.

  Koordinatsystem for pilene (i datafilen):
    (0, 0) er bogstavets startpunkt på grundlinjen.
    x går mod højre, y går OPAD.
    1 enhed = bogstavets linjeafstand (grundlinje til toplinje).
  Kør `node lav.js X --gitter` for at få et gitter over bogstaverne.
*/

const SVG = "http://www.w3.org/2000/svg";
const PX_PR_MM = 96 / 25.4;      // kun til at aflæse mål, aldrig til layout
const MM_PR_PT = 25.4 / 72;

function el(navn, attr = {}, ns = SVG) {
  const e = ns ? document.createElementNS(ns, navn) : document.createElement(navn);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  return e;
}
const html = (navn, klasse, tekst) => {
  const e = el(navn, klasse ? { class: klasse } : {}, null);
  if (tekst != null) e.textContent = tekst;
  return e;
};
const tal = (n) => +n.toFixed(3);

/* ---------- Skrifttypens mål, aflæst fra selve fonten ---------- */

const METRIK = {};
async function maalSkrifttype() {
  for (const v of [400, 700]) {
    await document.fonts.load(`${v} 100px "Andika"`);
    if (!document.fonts.check(`${v} 100px "Andika"`)) throw new Error(`Andika ${v} kunne ikke indlæses.`);
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${v} 1000px "Andika"`;
    METRIK[v] = {
      xHoejde: c.measureText("x").actualBoundingBoxAscent / 1000,
      versalHoejde: c.measureText("H").actualBoundingBoxAscent / 1000,
      bredde: (t) => c.measureText(t).width / 1000,
      // Bogstavets sorte del (blæk) i forhold til startpunktet, pr. skriftstørrelse 1.
      blaek: (t) => {
        const m = c.measureText(t);
        return {
          venstre: m.actualBoundingBoxLeft / 1000, hoejre: m.actualBoundingBoxRight / 1000,
          op: m.actualBoundingBoxAscent / 1000, ned: m.actualBoundingBoxDescent / 1000,
        };
      },
    };
  }
  await document.fonts.load('900 100px "Merriweather"');
  if (!document.fonts.check('900 100px "Merriweather"')) throw new Error("Merriweather kunne ikke indlæses.");
}

/*
  Skriftstørrelse, afledt af konstanterne og skrifttypens egne mål:
  - store bogstaver: så de går præcis fra grundlinjen op til toplinjen
  - små bogstaver: så x-højden lander præcis på midterlinjen
  Skrifttypens store bogstaver er lavere end b, d og l, så de to kan
  ikke dele én størrelse, hvis begge skal ramme linjerne.
*/
function erStort(tegn) {
  return tegn !== tegn.toLocaleLowerCase("da");
}
function skriftstoerrelse(L, k, tegn, vaegt = 400) {
  const m = METRIK[vaegt];
  return erStort(tegn) ? L / m.versalHoejde : (k.midterlinje * L) / m.xHoejde;
}

/* ---------- Hjælpelinjer: ÉN funktion til alle skrivefelter ---------- */

/*
  Linjernes lodrette placering i et felt med linjeafstand L. Alle sæt
  skrivelinjer — til både store og små bogstaver — kommer herfra.
*/
function linjeplacering(L, k) {
  const top = k.stregtykkelse;
  const grund = top + L;
  const midt = grund - k.midterlinje * L;
  const hoejde = grund + k.underlaengde * L;
  return { top, midt, grund, hoejde };
}

function nytFelt(bredde, k) {
  const L = k.linjeafstand;
  const y = linjeplacering(L, k);
  const svg = el("svg", {
    class: "felt",
    width: `${tal(bredde)}mm`, height: `${tal(y.hoejde)}mm`,
    viewBox: `0 0 ${tal(bredde)} ${tal(y.hoejde)}`,
  });
  svg.dataset.linjer = [y.top, y.midt, y.grund, y.hoejde].map(tal).join(",");
  const streg = { stroke: "#000", "stroke-width": k.stregtykkelse, fill: "none" };
  svg.append(
    el("line", { x1: 0, x2: tal(bredde), y1: tal(y.top), y2: tal(y.top), ...streg }),
    el("line", { x1: 0, x2: tal(bredde), y1: tal(y.midt), y2: tal(y.midt), ...streg, "stroke-dasharray": k.stiplet.join(" ") }),
    el("line", { x1: 0, x2: tal(bredde), y1: tal(y.grund), y2: tal(y.grund), ...streg })
  );
  return { svg, y, L };
}

// Problemer, der opdages mens arket tegnes. Kommer med i kontrollen.
const FUND = [];

/* Et sæt linjer med forbilledet (B eller b) skrevet først på linjen. */
function skrivefelt(bredde, k, forbillede) {
  const { svg, y, L } = nytFelt(bredde, k);
  if (forbillede) {
    const fs = skriftstoerrelse(L, k, forbillede);
    const b = METRIK[400].blaek(forbillede);
    if (b.ned * fs > k.underlaengde * L + 0.01) {
      FUND.push(`"${forbillede}" går længere ned end pladsen under grundlinjen — hæv underlaengde i konstanter.json`);
    }
    if (b.op * fs > L + k.stregtykkelse + 0.3) {
      FUND.push(`"${forbillede}" går op over toplinjen`);
    }
    const t = el("text", { x: tal(0.6 + b.venstre * fs), y: tal(y.grund), "font-size": tal(fs), fill: "#000" });
    t.textContent = forbillede;
    svg.append(t);
  }
  return svg;
}

/* ---------- De store sporingsbogstaver med nummererede pile ---------- */

// Glat kurve gennem punkterne (Catmull-Rom omsat til Bézier).
function kurve(p) {
  if (p.length === 2) return `M${p[0].map(tal)}L${p[1].map(tal)}`;
  let d = `M${p[0].map(tal)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${c1.map(tal)} ${c2.map(tal)} ${c.map(tal)}`;
  }
  return d;
}

const PIL = { streg: 0.5, stiplet: "1.6 1.2", spids: 2.6, cirkel: 2.9, tal: 11 };

// En pil uden "vej" er en prik (fx prikken over i og j): kun cirklen med tallet.
function tegnPil(lagStreg, lagTal, pil, tilSvg, spids) {
  const p = (pil.vej || []).map(tilSvg);
  if (p.length >= 2) lagStreg.append(el("path", {
    d: kurve(p), fill: "none", stroke: "#000", "stroke-width": PIL.streg,
    "stroke-dasharray": PIL.stiplet, "stroke-linecap": "round",
    "marker-end": `url(#${spids})`,
  }));
  const [cx, cy] = pil.nummer ? tilSvg(pil.nummer) : p[0];
  lagTal.append(el("circle", { cx: tal(cx), cy: tal(cy), r: PIL.cirkel, fill: "#000" }));
  const t = el("text", {
    x: tal(cx), y: tal(cy + 0.05), "font-size": tal(PIL.tal * MM_PR_PT), "font-weight": 700,
    "text-anchor": "middle", "dominant-baseline": "central", fill: "#fff",
  });
  t.textContent = pil.nr;
  lagTal.append(t);
}

// Koordinatgitter til at placere pile. ox = bogstavets startpunkt.
// fra/til/dybde er i linjeafstande, så tallene kan skrives direkte i datafilen.
function tegnGitter(svg, ox, grund, L, fra, til, dybde) {
  const g = el("g", { class: "gitter" });
  const linje = (a, tyk) => g.append(el("line", { ...a, stroke: "#000", "stroke-width": tyk ? 0.15 : 0.05 }));
  const etiket = (x, y, tekst, anker) => {
    const t = el("text", { x: tal(x), y: tal(y), "font-size": 2.4, "text-anchor": anker, "dominant-baseline": "central", fill: "#000" });
    t.textContent = tekst;
    g.append(t);
  };
  const i0 = Math.floor(fra * 10), i1 = Math.ceil(til * 10), j0 = -Math.ceil(dybde * 10);
  for (let i = i0; i <= i1; i++) {
    const x = ox + (i / 10) * L;
    linje({ x1: tal(x), x2: tal(x), y1: tal(grund - L), y2: tal(grund - (j0 / 10) * L) }, i % 5 === 0);
    if (i % 5 === 0) etiket(x, grund - (j0 / 10) * L + 2, (i / 10).toFixed(1), "middle");
  }
  for (let j = j0; j <= 10; j++) {
    const y = grund - (j / 10) * L;
    linje({ x1: tal(ox + (i0 / 10) * L), x2: tal(ox + (i1 / 10) * L), y1: tal(y), y2: tal(y) }, j % 5 === 0);
    if (j % 5 === 0) etiket(ox + (i0 / 10) * L - 1, y, (j / 10).toFixed(1), "end");
  }
  svg.append(g);
}

function sporingsbogstaver(bredde, hoejde, post, k, valg) {
  // Boblen omkring bogstavet: hvid kant på `luft` mm og en sort streg udenom.
  const luft = 2.0, kantStreg = 1.0, halo = luft + kantStreg, mellemrum = 1.5;

  const svg = el("svg", {
    class: "bogstaver", width: `${tal(bredde)}mm`, height: `${tal(hoejde)}mm`,
    viewBox: `0 0 ${tal(bredde)} ${tal(hoejde)}`,
  });
  const defs = el("defs");
  const m = el("marker", {
    id: `pilespids-${post.bogstav}`, viewBox: "0 0 10 10", refX: 6, refY: 5,
    markerWidth: PIL.spids, markerHeight: PIL.spids, markerUnits: "userSpaceOnUse", orient: "auto",
  });
  m.append(el("path", { d: "M0,0 L10,5 L0,10 Z", fill: "#000" }));
  defs.append(m);
  svg.append(defs);

  const stort = post.bogstav.toLocaleUpperCase("da");
  const lille = post.bogstav.toLocaleLowerCase("da");

  // Mål ved fuld størrelse. Er bogstaverne for brede (M, W) eller går de
  // langt ned (g, j, p, q, y), skaleres begge ned, så de passer i feltet.
  // Pilene følger med, fordi deres koordinater er i linjeafstande.
  const maal = (L) => [stort, lille].map((t) => {
    const fs = skriftstoerrelse(L, k, t, 700);
    const b = METRIK[700].blaek(t);
    return { tegn: t, fs, v: b.venstre * fs, h: b.hoejre * fs, op: b.op * fs, ned: b.ned * fs };
  });
  const fuld = maal(k.linjeafstand * k.storSkala);
  const blaekB = fuld.reduce((s, g) => s + g.v + g.h, 0);
  const blaekH = Math.max(...fuld.map((g) => g.op)) + Math.max(0, ...fuld.map((g) => g.ned));
  const skala = Math.min(1,
    (bredde - 4 * halo - mellemrum - 2) / blaekB,
    (hoejde - 2 * halo - 2) / blaekH);
  const L = k.linjeafstand * k.storSkala * skala;
  const [g1, g2] = maal(L);

  const iAlt = 4 * halo + mellemrum + g1.v + g1.h + g2.v + g2.h;
  const x1 = (bredde - iAlt) / 2 + halo + g1.v;
  const x2 = x1 + g1.h + 2 * halo + mellemrum + g2.v;
  const op = Math.max(g1.op, g2.op), ned = Math.max(0, g1.ned, g2.ned);
  const grund = (hoejde - (op + ned)) / 2 + op;

  const glyffer = [
    { ...g1, x: x1, pile: post.pile?.stort || [] },
    { ...g2, x: x2, pile: post.pile?.lille || [] },
  ];
  const faelles = { y: tal(grund), "font-weight": 700, "stroke-linejoin": "round" };
  // To lag, så boblerne flyder pænt sammen: sort omrids, så hvid kant og bogstav.
  for (const [farve, tyk] of [["#000", 2 * (luft + kantStreg)], ["#fff", 2 * luft]]) {
    for (const g of glyffer) {
      const t = el("text", { ...faelles, x: tal(g.x), "font-size": tal(g.fs), fill: farve, stroke: farve, "stroke-width": tal(tyk) });
      t.textContent = g.tegn;
      svg.append(t);
    }
  }
  tjekPile(glyffer, L, luft, post.bogstav);
  const lagStreg = el("g"), lagTal = el("g");
  for (const g of glyffer) {
    if (valg.gitter) tegnGitter(svg, g.x, grund, L, -g.v / L, g.h / L, g.ned / L);
    const tilSvg = ([px, py]) => [g.x + px * L, grund - py * L];
    g.pile.forEach((p) => tegnPil(lagStreg, lagTal, p, tilSvg, `pilespids-${post.bogstav}`));
  }
  svg.append(lagStreg, lagTal);
  return svg;
}

/*
  Tjekker at hvert punkt på pilene ligger inde i bogstavets hvide boble.
  Bogstavet tegnes på et usynligt lærred i samme størrelse, og punkterne
  slås op. Så opdages en pil, der stikker ud af bogstavet, før PDF'en laves.
*/
function tjekPile(glyffer, L, luft, bogstav) {
  const OPL = 8; // punkter pr. mm på lærredet
  for (const g of glyffer) {
    const pad = luft + 2;
    const b = Math.ceil((g.v + g.h + 2 * pad) * OPL), h = Math.ceil((g.op + g.ned + 2 * pad) * OPL);
    const c = document.createElement("canvas");
    c.width = b; c.height = h;
    const ctx = c.getContext("2d");
    ctx.scale(OPL, OPL);
    const ox = pad + g.v, oy = pad + g.op;
    ctx.font = `700 ${g.fs}px "Andika"`;
    ctx.lineJoin = "round";
    ctx.lineWidth = 2 * luft;
    ctx.strokeStyle = ctx.fillStyle = "#000";
    ctx.strokeText(g.tegn, ox, oy);
    ctx.fillText(g.tegn, ox, oy);
    const data = ctx.getImageData(0, 0, b, h).data;
    const inde = ([px, py]) => {
      const x = Math.round((ox + px * L) * OPL), y = Math.round((oy - py * L) * OPL);
      if (x < 0 || y < 0 || x >= b || y >= h) return false;
      return data[(y * b + x) * 4 + 3] > 128;
    };
    for (const pil of g.pile) {
      const punkter = [...(pil.vej || []), ...(pil.nummer ? [pil.nummer] : [])];
      for (const pkt of punkter) {
        if (!inde(pkt)) FUND.push(`${bogstav}: pil ${pil.nr} på "${g.tegn}" har punktet [${pkt}] uden for bogstavet`);
      }
    }
  }
}

/* ---------- Pynt ---------- */

// Tre små streger, som om noget lyser.
function straaler(storrelse) {
  const s = el("svg", { width: `${storrelse}mm`, height: `${storrelse}mm`, viewBox: "0 0 10 10", class: "straaler" });
  const g = el("g", { stroke: "#000", "stroke-width": 0.9, "stroke-linecap": "round" });
  g.append(
    el("line", { x1: 1, y1: 5.5, x2: 5.5, y2: 7.5 }),
    el("line", { x1: 3, y1: 1.8, x2: 6.6, y2: 5.8 }),
    el("line", { x1: 7, y1: 0.6, x2: 8.4, y2: 4.8 })
  );
  s.append(g);
  return s;
}

// Tankesky: lige store buer fordelt jævnt langs en blød firkant.
function sky(b, h) {
  const s = el("svg", { class: "sky", width: `${b}mm`, height: `${h}mm`, viewBox: `0 0 ${b} ${h}` });
  const bueLaengde = 9, streg = 0.7;
  const m = 0.27 * bueLaengde + streg;           // buens højde + streg
  const cx = b / 2, cy = h / 2, rx = b / 2 - m, ry = h / 2 - m;
  const form = (a) => {
    const c = Math.cos(a), si = Math.sin(a);
    return [cx + rx * Math.sign(c) * Math.abs(c) ** 0.4, cy + ry * Math.sign(si) * Math.abs(si) ** 0.4];
  };
  // Mål omkredsen og fordel punkterne efter længde, så buerne bliver lige store.
  const taet = Array.from({ length: 2000 }, (_, i) => form((i / 2000) * 2 * Math.PI));
  const laengder = [0];
  for (let i = 1; i <= taet.length; i++) {
    const [a, c] = [taet[i - 1], taet[i % taet.length]];
    laengder.push(laengder[i - 1] + Math.hypot(c[0] - a[0], c[1] - a[1]));
  }
  const n = Math.round(laengder.at(-1) / bueLaengde);
  const punkter = [];
  for (let j = 0, i = 0; j < n; j++) {
    const maal = (j / n) * laengder.at(-1);
    while (laengder[i + 1] < maal) i++;
    punkter.push(taet[i]);
  }
  let d = `M${punkter[0].map(tal)}`;
  for (let i = 1; i <= n; i++) {
    const [px, py] = punkter[i % n], [qx, qy] = punkter[i - 1];
    const r = Math.hypot(px - qx, py - qy) * 0.6;
    d += `A${tal(r)} ${tal(r)} 0 0 1 ${tal(px)} ${tal(py)}`;
  }
  s.append(el("path", { d: d + "Z", fill: "#fff", stroke: "#000", "stroke-width": streg, "stroke-linejoin": "round" }));
  return s;
}

function bue(bredde) {
  const s = el("svg", { width: `${tal(bredde)}mm`, height: "3mm", viewBox: `0 0 ${tal(bredde)} 3` });
  s.append(el("path", { d: `M1 2.4 Q${tal(bredde / 2)} -0.4 ${tal(bredde - 1)} 2.4`, fill: "none", stroke: "#000", "stroke-width": 0.6, "stroke-linecap": "round" }));
  return s;
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
    const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] < 150 ? 0 : 255;
    p[i] = p[i + 1] = p[i + 2] = v;
    p[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

/* ---------- Ét ark ---------- */

function formindsk(e, passer, minPt) {
  let pt = (parseFloat(getComputedStyle(e).fontSize) * 72) / 96;
  while (!passer() && pt > minPt) {
    pt -= 0.5;
    e.style.fontSize = `${pt}pt`;
  }
}

function plads(navn) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${navn}`).trim().split(/\s+/);
  const [x, y, b, h] = v.map((s) => parseFloat(s));
  return { x, y, b, h };
}

// Læser et felts plads fra CSS (--navn: venstre top bredde højde) i mm.
function feltPlads(navn) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${navn}`).trim().split(/\s+/);
  const [x, y, b, h] = v.map((s) => parseFloat(s));
  const e = html("div", `felt-plads ${navn}`);
  Object.assign(e.style, { left: `${x}mm`, top: `${y}mm`, width: `${b}mm`, height: `${h}mm` });
  return [e, { x, y, b, h }];
}

async function lavArk(post, k, billede, valg) {
  const ark = el("section", { class: "ark", "data-bogstav": post.bogstav }, null);
  const ramme = html("div", "ramme");
  const indhold = html("div", "indhold");
  ramme.append(indhold);
  ark.append(ramme);
  document.getElementById("ark-liste").append(ark);

  const stort = post.bogstav.toLocaleUpperCase("da");
  const lille = post.bogstav.toLocaleLowerCase("da");

  // Store sporingsbogstaver
  const [fb, pb] = feltPlads("bogstaver");
  fb.append(sporingsbogstaver(pb.b, pb.h, post, k, valg));
  const s1 = straaler(9);
  Object.assign(s1.style, { position: "absolute", left: "-2mm", top: "1mm" });
  fb.append(s1);

  // "B er for Brachiosaurus"
  const [fo] = feltPlads("overskrift");
  fo.append(straaler(7), html("span", "pille serif", `${stort} er for ${post.dyr}`));

  // Beskrivelse
  const [fd] = feltPlads("beskrivelse");
  fd.append(html("p", "tekst", post.beskrivelse));

  // Spørgsmål i en sky
  const [fs, ps] = feltPlads("spoergsmaal");
  const inde = html("div", "inde");
  const tegn = html("span", "tegn", "?");
  tegn.prepend(straaler(6));
  inde.append(tegn, html("p", "tekst", post.spoergsmaal));
  fs.append(sky(ps.b, ps.h), inde);

  // Tegningen og navnet
  const [fv] = feltPlads("vindue");
  if (billede) {
    const img = el("img", { alt: post.dyr }, null);
    img.src = await sortHvid(billede);
    await img.decode();
    fv.append(img);
  } else {
    // Tegningen er ikke leveret endnu. Arket laves alligevel, så resten kan ses.
    fv.append(html("div", "mangler", `Tegning af ${post.dyr} mangler\n(${post.billede})`));
  }
  const titel = html("div", "titel serif", post.dyr);
  fv.append(titel);

  // Skrivelinjer: samme felt-funktion til store og små bogstaver
  const [fw, pw] = feltPlads("skrivning");
  const bredde = pw.b - 6 - 0.6; // minus skillelinje og luft, se .skrivning i CSS
  for (const tegn of [stort, lille]) {
    const gruppe = html("div", "gruppe");
    for (let i = 0; i < k.linjesaetPrBogstav; i++) gruppe.append(skrivefelt(bredde, k, i === 0 ? tegn : null));
    fw.append(gruppe);
  }

  indhold.append(fv, fb, fo, fd, fs, fw);

  // Lange navne: skriften gøres mindre, til de passer. Aldrig under grænsen.
  formindsk(fo.querySelector(".pille"), () => fo.scrollWidth <= fo.clientWidth + 0.5, 16);
  formindsk(titel, () => titel.getBoundingClientRect().width / PX_PR_MM <= plads("vindue").b - 8, 22);
  // Buen under navnet tilpasses navnets bredde, når det er sat.
  titel.append(bue((titel.getBoundingClientRect().width / PX_PR_MM) * 0.8));
}

/* ---------- Kontrol: fanger fejl før PDF'en laves ---------- */

/*
  Elementer inde i en SVG måles ikke hver for sig: en tekst har en usynlig
  kasse, der er større end bogstavet, og SVG'en klipper alligevel det, der
  går ud over den. Selve SVG'en bliver målt.
*/
const UDEN_SVG_INDHOLD = "*:not(svg *)";

function kontroller() {
  const fejl = [...FUND];
  const tillad = new Set(["rgb(0, 0, 0)", "rgb(255, 255, 255)", "rgba(0, 0, 0, 0)", "none", "transparent"]);
  const navn = (e) => `<${e.tagName.toLowerCase()} class="${e.getAttribute("class") || ""}">`;
  for (const ark of document.querySelectorAll(".ark")) {
    const B = ark.dataset.bogstav;
    const a = ark.getBoundingClientRect();

    // 1. Alt skal ligge mindst 8 mm fra papirets kant.
    for (const e of ark.querySelectorAll(UDEN_SVG_INDHOLD)) {
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const min = Math.min(r.left - a.left, a.right - r.right, r.top - a.top, a.bottom - r.bottom) / PX_PR_MM;
      if (min < 8 - 0.01) fejl.push(`${B}: ${navn(e)} ligger ${min.toFixed(1)} mm fra kanten`);
    }

    // 2. Intet må løbe ud over rammen eller ud af sit felt.
    const ri = ark.querySelector(".ramme").getBoundingClientRect();
    for (const e of ark.querySelectorAll(".ramme " + UDEN_SVG_INDHOLD)) {
      const r = e.getBoundingClientRect();
      if (r.bottom > ri.bottom + 0.5 || r.right > ri.right + 0.5 || r.left < ri.left - 0.5 || r.top < ri.top - 0.5) {
        fejl.push(`${B}: ${navn(e)} løber ud over rammen`);
      }
    }
    for (const f of ark.querySelectorAll(".felt-plads")) {
      if (f.scrollHeight > f.clientHeight + 1 || f.scrollWidth > f.clientWidth + 1) {
        fejl.push(`${B}: indholdet er for stort til feltet "${f.className.replace("felt-plads ", "")}"`);
      }
    }

    // 3. Tegningen skal ligge inde i sit vindue.
    const v = ark.querySelector(".vindue").getBoundingClientRect();
    const billede = ark.querySelector(".vindue img");
    const i = (billede || ark.querySelector(".vindue")).getBoundingClientRect();
    if (i.left < v.left - 0.5 || i.right > v.right + 0.5 || i.top < v.top - 0.5 || i.bottom > v.bottom + 0.5) {
      fejl.push(`${B}: tegningen flyder ud over vinduet`);
    }

    // 4. Alle sæt skrivelinjer skal være præcis ens ...
    const felter = [...ark.querySelectorAll("svg.felt")].map((s) => s.dataset.linjer);
    if (new Set(felter).size !== 1) fejl.push(`${B}: skrivelinjerne er ikke ens: ${felter.join(" | ")}`);
    // ... og have samme afstand imellem sig i begge grupper.
    const afstande = [...ark.querySelectorAll(".gruppe")].flatMap((g) => {
      const top = [...g.querySelectorAll("svg.felt")].map((s) => s.getBoundingClientRect().top / PX_PR_MM);
      return top.slice(1).map((t, n) => (t - top[n]).toFixed(2));
    });
    if (new Set(afstande).size > 1) fejl.push(`${B}: afstanden mellem linjesættene er ikke ens: ${afstande.join(", ")}`);

    // 5. Tekst mindst 14 pt.
    for (const e of ark.querySelectorAll("p")) {
      const pt = (parseFloat(getComputedStyle(e).fontSize) * 72) / 96;
      if (pt < 14 - 0.01) fejl.push(`${B}: tekst i ${navn(e)} er ${pt.toFixed(1)} pt`);
    }

    // 6. Kun sort og hvid, ingen skygger.
    for (const e of ark.querySelectorAll("*")) {
      if (e.tagName === "IMG") continue;
      const s = getComputedStyle(e);
      for (const f of [s.color, s.backgroundColor, s.borderTopColor, s.borderRightColor, s.borderLeftColor, s.fill, s.stroke]) {
        if (f && !tillad.has(f) && !f.startsWith("url(")) {
          fejl.push(`${B}: farven ${f} på ${navn(e)} er ikke ren sort eller hvid`);
          break;
        }
      }
      if (s.boxShadow !== "none" || s.textShadow !== "none") fejl.push(`${B}: skygge på ${navn(e)}`);
    }
  }
  return fejl;
}

/* ---------- Indgang fra lav.js ---------- */

window.tegnArk = async function (poster, konstanter, billeder, valg = {}) {
  await maalSkrifttype();
  for (const post of poster) await lavArk(post, konstanter, billeder[post.bogstav], valg);
  return kontroller();
};
