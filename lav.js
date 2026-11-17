#!/usr/bin/env node
/*
  Laver skriveark som PDF ud fra data/bogstaver.json.

    node lav.js B            ét bogstav  -> ud/skriveark-B.pdf
    node lav.js alle         alle poster -> ud/skriveark-alle.pdf
    node lav.js B --gitter   lægger et koordinatgitter over det store
                             bogstav, så pilene er lette at placere
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROD = __dirname;
const args = process.argv.slice(2);
const valg = { gitter: args.includes("--gitter") };
const hvad = args.find((a) => !a.startsWith("--"));

if (!hvad) {
  console.error("Brug: node lav.js <bogstav|alle> [--gitter]");
  process.exit(1);
}

const alle = JSON.parse(fs.readFileSync(path.join(ROD, "data/bogstaver.json"), "utf8"));
const konstanter = JSON.parse(fs.readFileSync(path.join(ROD, "skabelon/konstanter.json"), "utf8"));

const poster = hvad.toLowerCase() === "alle"
  ? alle
  : alle.filter((p) => p.bogstav.toLocaleUpperCase("da") === hvad.toLocaleUpperCase("da"));

if (!poster.length) {
  console.error(`Der er ingen post for "${hvad}" i data/bogstaver.json.`);
  process.exit(1);
}

// Mangler en tegning, laves arket alligevel med en markering i vinduet,
// så resten kan ses og rettes. Scriptet siger tydeligt til.
const billeder = {};
const mangler = [];
for (const p of poster) {
  const fil = path.join(ROD, p.billede);
  if (fs.existsSync(fil)) {
    billeder[p.bogstav] = "data:image/png;base64," + fs.readFileSync(fil).toString("base64");
  } else {
    billeder[p.bogstav] = null;
    mangler.push(`${p.bogstav} (${p.billede})`);
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const side = await browser.newPage();
    side.on("pageerror", (e) => console.error("Fejl i siden:", e.message));
    await side.goto("file://" + path.join(ROD, "skabelon/ark.html"));
    const fejl = await side.evaluate(
      ([p, k, b, v]) => window.tegnArk(p, k, b, v),
      [poster, konstanter, billeder, valg]
    );
    if (fejl.length) {
      console.error("Arket bestod ikke kontrollen:\n  " + fejl.join("\n  "));
      process.exit(2);
    }
    const navn = hvad.toLowerCase() === "alle" ? "alle" : poster[0].bogstav;
    const ud = path.join(ROD, "ud", `skriveark-${navn}${valg.gitter ? "-gitter" : ""}.pdf`);
    fs.mkdirSync(path.dirname(ud), { recursive: true });
    await side.pdf({ path: ud, preferCSSPageSize: true, printBackground: true });
    console.log(`Lavet: ${path.relative(ROD, ud)} (${poster.length} ark)`);
    if (mangler.length) console.warn(`OBS: ${mangler.length} tegning(er) mangler: ${mangler.join(", ")}`);
  } finally {
    await browser.close();
  }
})();
