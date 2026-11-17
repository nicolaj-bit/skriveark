#!/usr/bin/env node
/*
  Laver dinosaur-tegninger med OpenAIs billed-AI ud fra datafilen.

    node tegn.js T           tegner T (springes over, hvis filen findes)
    node tegn.js mangler     tegner alle, der mangler
    node tegn.js T --igen    tegner T forfra, selv om filen findes

  Brachiosaurus-tegningen sendes med som stilforlæg, så alle tegninger
  ligner hinanden. Hvad der skal tegnes, står i feltet "tegning" i
  data/bogstaver.json. Resultatet gøres til ren sort streg på hvid og
  gemmes i billeder/. Den rå tegning gemmes i billeder/raa/.

  Kræver en OpenAI-nøgle i OPENAI_API_KEY. (I Claude-miljøet sættes
  nøglen på af netværket, og variablen kan være en pladsholder.)
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROD = __dirname;
const FORLAEG = path.join(ROD, "billeder/brachiosaurus.png");
const MODEL = process.env.TEGN_MODEL || "gpt-image-2";

const STIL = `Use the attached image ONLY as a style reference: a children's coloring book page, clean black line art on pure white, thick outer contour lines and thinner inner detail lines, a realistic but simplified dinosaur with large open areas to color, and a prehistoric landscape with a few mountains, trees, rocks and grass tufts.
Draw a NEW picture in exactly that style. The dinosaur (description in Danish): `;

const REGLER = `
Rules: pure black lines on a pure white background. No gray, no shading, no hatching, no solid black fills except the eye. No text, no letters, no border or frame. Landscape format. The whole dinosaur must be inside the picture, placed slightly left of center and low. Keep the TOP RIGHT corner completely empty white (about one third of the width and one fifth of the height) — no clouds, trees or lines there.`;

const args = process.argv.slice(2);
const igen = args.includes("--igen");
const hvad = args.find((a) => !a.startsWith("--"));
if (!hvad) {
  console.error("Brug: node tegn.js <bogstav|mangler> [--igen]");
  process.exit(1);
}
const nøgle = process.env.OPENAI_API_KEY;
if (!nøgle) {
  console.error("OPENAI_API_KEY mangler.");
  process.exit(1);
}

const alle = JSON.parse(fs.readFileSync(path.join(ROD, "data/bogstaver.json"), "utf8"));
let poster = hvad.toLowerCase() === "mangler"
  ? alle.filter((p) => !fs.existsSync(path.join(ROD, p.billede)))
  : alle.filter((p) => p.bogstav.toLocaleUpperCase("da") === hvad.toLocaleUpperCase("da"));
if (!igen) poster = poster.filter((p) => !fs.existsSync(path.join(ROD, p.billede)));

async function tegn(post) {
  if (!post.tegning) throw new Error(`${post.bogstav}: feltet "tegning" mangler i datafilen`);
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", new Blob([fs.readFileSync(FORLAEG)], { type: "image/png" }), "forlaeg.png");
  form.append("prompt", `${STIL}${post.dyr} — ${post.tegning}.${REGLER}`);
  form.append("size", "1536x1024");
  form.append("quality", "high");
  const svar = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${nøgle}` },
    body: form,
  });
  const json = await svar.json();
  if (!svar.ok) throw new Error(`${post.bogstav}: ${json.error?.message || svar.status}`);
  return Buffer.from(json.data[0].b64_json, "base64");
}

// Gør tegningen til ren sort/hvid i fuld opløsning — samme tærskel som arket bruger.
async function sortHvid(side, png) {
  const ud = await side.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2] < 150 ? 0 : 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  }, "data:image/png;base64," + png.toString("base64"));
  return Buffer.from(ud.split(",")[1], "base64");
}

(async () => {
  if (!poster.length) {
    console.log("Ingen tegninger at lave.");
    return;
  }
  const browser = await chromium.launch();
  const side = await browser.newPage();
  fs.mkdirSync(path.join(ROD, "billeder/raa"), { recursive: true });
  let fejl = 0;
  for (const post of poster) {
    process.stdout.write(`${post.bogstav} ${post.dyr} ... `);
    try {
      const raa = await tegn(post);
      fs.writeFileSync(path.join(ROD, "billeder/raa", path.basename(post.billede)), raa);
      fs.writeFileSync(path.join(ROD, post.billede), await sortHvid(side, raa));
      console.log("færdig");
    } catch (e) {
      fejl++;
      console.log("FEJL: " + e.message);
      if (/credit|quota|billing/i.test(e.message)) break;
    }
  }
  await browser.close();
  if (fejl) process.exit(2);
})();
