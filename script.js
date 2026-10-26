"use strict";

const CONFIG = {
  mailTo: "nathalie@dscleaning.be",

  formEndpoint: "",
  formAccessKey: "",

  jsonCategorie: "json/categorie.json",
  jsonProducten: "json/producten.json",
  placeholderAfbeelding: "images/producten/DIP.jpg",

  uitgelichtMax: 4,            
  perPagina: 48,               
  minSecondenFormulier: 3,     
  maxMailtoLengte: 1900,       
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (n) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const klem = (n) => Math.min(999, Math.max(1, parseInt(n, 10) || 1));

async function haalJSON(pad) {
  const res = await fetch(pad);
  if (!res.ok) throw new Error(`${pad}: ${res.status}`);
  return res.json();
}

const Opslag = {
  geheugen: {},
  lees(soort, sleutel) {
    try { return window[soort].getItem(sleutel); } catch { return this.geheugen[soort + sleutel] ?? null; }
  },
  schrijf(soort, sleutel, waarde) {
    try { window[soort].setItem(sleutel, waarde); } catch { this.geheugen[soort + sleutel] = waarde; }
  },
};

let toastTimer;
function toast(tekst) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = tekst;
  el.classList.add("zichtbaar");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("zichtbaar"), 2200);
}

const Factuur = {
  SLEUTEL: "dsFactuur",
  lees() {
    try {
      const data = JSON.parse(Opslag.lees("localStorage", this.SLEUTEL) || "[]");
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  },
  schrijf(lijst) {
    Opslag.schrijf("localStorage", this.SLEUTEL, JSON.stringify(lijst));
    document.dispatchEvent(new CustomEvent("factuur:wijzig"));
  },
  voegToe(product, aantal = 1) {
    aantal = klem(aantal);
    const lijst = this.lees();
    const bestaand = lijst.find((i) => i.id === product.id);
    if (bestaand) bestaand.aantal = klem(bestaand.aantal + aantal);
    else lijst.push({
      id: product.id,
      naam: product.naam,
      afbeelding: product.afbeelding || "",
      prijs: product.actie && product.actie.prijs != null ? product.actie.prijs : null,
      aantal,
    });
    this.schrijf(lijst);
  },
  zetAantal(id, aantal) {
    const lijst = this.lees();
    const item = lijst.find((i) => i.id === id);
    if (!item) return;
    item.aantal = klem(aantal);
    this.schrijf(lijst);
  },
  verwijder(id) { this.schrijf(this.lees().filter((i) => i.id !== id)); },
  leeg() { this.schrijf([]); },
  totaal() { return this.lees().reduce((som, i) => som + i.aantal, 0); },
};

let zetZijbalkOpen = () => {};
function voegToeAanFactuur(product, aantal = 1) {
  Factuur.voegToe(product, aantal);
  toast(`${klem(aantal)}× ${product.naam} toegevoegd aan je factuur`);
  if (window.innerWidth > 650) zetZijbalkOpen(true);
}

function koppelAantalKnoppen(container, rijSelector) {
  container.addEventListener("click", (e) => {
    const knop = e.target.closest("button[data-actie]");
    if (!knop) return;
    const id = knop.closest(rijSelector)?.dataset.id;
    const item = Factuur.lees().find((i) => i.id === id);
    if (!item) return;
    const actie = knop.dataset.actie;
    if (actie === "plus") Factuur.zetAantal(id, item.aantal + 1);
    if (actie === "min" && item.aantal > 1) Factuur.zetAantal(id, item.aantal - 1);
    if (actie === "del") Factuur.verwijder(id);
  });
}


function zijbalkItemHTML(i) {
  return `
    <div class="factuur-product" data-id="${esc(i.id)}">
      <div class="factuur-product-aantal">x${i.aantal}</div>
      <img src="${esc(i.afbeelding || CONFIG.placeholderAfbeelding)}" alt="">
      <div class="factuur-product-bio">
        <div>
          <div class="factuur-product-naam">${esc(i.naam)}</div>
          ${i.prijs != null ? `<div class="factuur-product-prijs">${euro(i.prijs)}</div>` : ""}
          <div class="aantal-knoppen">
            <button type="button" data-actie="min" aria-label="Eén minder" ${i.aantal <= 1 ? "disabled" : ""}>−</button>
            <button type="button" data-actie="plus" aria-label="Eén meer">+</button>
            <button type="button" data-actie="del" class="verwijder" aria-label="Verwijder ${esc(i.naam)}">✕</button>
          </div>
        </div>
      </div>
    </div>`;
}

function bouwZijbalk() {
  if (document.body.dataset.pagina === "factuur" || $("#factuur-prompt")) return;

  document.body.insertAdjacentHTML("afterbegin", `
    <div id="factuur-prompt" class="ingeklapt">
      <div id="factuur-knop">
        <div id="close" class="factuur-knop">
          <a href="#" id="factuur-toggle" aria-label="Factuur tonen of verbergen">←</a>
          <span id="factuur-badge"></span>
        </div>
      </div>
      <div id="factuur-lijst">
        <div id="factuur-producten"></div>
        <div id="factuur-bio">
          <div id="factuur-totaal">
            <p>Totaal: </p>
            <h1 id="totaal">0</h1>
          </div>
          <div id="factuur-knop-finaal">
            <a href="factuur.html" id="factuur-pag">Naar Factuur</a>
            <a href="#" id="verstuur-fac">Verzenden</a>
          </div>
        </div>
      </div>
    </div>`);

  const prompt = $("#factuur-prompt");
  const toggle = $("#factuur-toggle");

  zetZijbalkOpen = (open) => {
    prompt.classList.toggle("ingeklapt", !open);
    toggle.textContent = open ? "→" : "←";
    Opslag.schrijf("sessionStorage", "dsFactuurOpen", open ? "1" : "0");
  };
  zetZijbalkOpen(Opslag.lees("sessionStorage", "dsFactuurOpen") === "1");

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    zetZijbalkOpen(prompt.classList.contains("ingeklapt"));
  });

  const render = () => {
    const lijst = Factuur.lees();
    const totaal = Factuur.totaal();
    $("#factuur-producten").innerHTML = lijst.length
      ? lijst.map(zijbalkItemHTML).join("")
      : `<p class="factuur-leeg">Je factuur is nog leeg.<br>Voeg producten toe om te starten.</p>`;
    $("#totaal").textContent = `${totaal} ${totaal === 1 ? "stuk" : "stuks"}`;
    const badge = $("#factuur-badge");
    badge.textContent = totaal;
    badge.classList.toggle("zichtbaar", totaal > 0);
    $("#verstuur-fac").classList.toggle("uitgeschakeld", totaal === 0);
  };
  render();
  document.addEventListener("factuur:wijzig", render);
  window.addEventListener("storage", (e) => { if (e.key === Factuur.SLEUTEL) render(); }); // andere tab

  koppelAantalKnoppen($("#factuur-producten"), ".factuur-product");

  $("#verstuur-fac").addEventListener("click", (e) => {
    e.preventDefault();
    openVerzendModal();
  });
}

function initMenu() {
  const knop = $("#menu-toggle");
  const nav = $("header nav");
  if (!knop || !nav) return;

  const zet = (open) => {
    nav.classList.toggle("open", open);
    knop.setAttribute("aria-expanded", String(open));
    knop.setAttribute("aria-label", open ? "Menu sluiten" : "Menu openen");
    knop.textContent = open ? "✕" : "☰";
    document.body.classList.toggle("geen-scroll", open);
  };
  knop.addEventListener("click", () => zet(!nav.classList.contains("open")));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => zet(false)));
  window.addEventListener("resize", () => { if (window.innerWidth > 650) zet(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) zet(false); });
}

function initNavHistory() {
  const el = $("#navhistory");
  if (!el) return;

  const labels = {
    index: "home",
    overons: "over ons",
    producten: "producten",
    "advies-service": "advies&service",
    contact: "contact",
    factuur: "factuur",
  };
  const bestandsnaam = location.pathname.split("/").pop();
  const sleutel = bestandsnaam.replace(/\.html$/, "") || "index";
  const huidig = {
    key: sleutel,
    label: labels[sleutel] || sleutel,
    href: (bestandsnaam || "index.html") + location.search,
  };

  let lijst;
  try { lijst = JSON.parse(Opslag.lees("sessionStorage", "dsNavGeschiedenis") || "[]"); } catch { lijst = []; }
  if (!Array.isArray(lijst)) lijst = [];

  const laatste = lijst[lijst.length - 1];
  if (laatste && laatste.key === huidig.key) lijst[lijst.length - 1] = huidig;
  else if (lijst.some((i) => i.key === huidig.key)) lijst = [huidig];
  else lijst.push(huidig);
  Opslag.schrijf("sessionStorage", "dsNavGeschiedenis", JSON.stringify(lijst));

  el.innerHTML = lijst
    .map((i, n) => `${n ? '<div class="link-arrow">→</div>' : ""}<a class="link" href="${esc(i.href)}">${esc(i.label)}</a>`)
    .join("");
}


const afbeeldingVan = (p) => esc(p.afbeelding || CONFIG.placeholderAfbeelding);


async function initUitgelicht() {
  const grid = $("#adv-producten");
  if (!grid) return;
  let producten;
  try {
    producten = (await haalJSON(CONFIG.jsonProducten)).filter((p) => p.actie).slice(0, CONFIG.uitgelichtMax);
  } catch {
    grid.innerHTML = `<p class="form-status fout">Producten konden niet geladen worden.</p>`;
    return;
  }
  grid.innerHTML = producten.map((p) => `
    <div class="adv-product" role="button" tabindex="0" data-id="${esc(p.id)}" aria-label="Voeg ${esc(p.naam)} toe aan je factuur">
      <img class="adv-product-img" src="${afbeeldingVan(p)}" alt="${esc(p.naam)}">
      <div class="adv-product-bio">
      <div class="adv-product-np">
        <p class="adv-product-naam">${esc(p.naam)}</p>
        <p class="adv-product-prijs">${euro(p.actie.prijs)}</p>
     </div>
        <p class="adv-product-voegtoe">+ Voeg toe aan factuur</p>
    </div>
    </div>`).join("");

  const voegToe = (kaart) => {
    const product = producten.find((p) => p.id === kaart.dataset.id);
    if (product) voegToeAanFactuur(product, 1);
  };
  grid.addEventListener("click", (e) => { const k = e.target.closest(".adv-product"); if (k) voegToe(k); });
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const k = e.target.closest(".adv-product");
    if (k) { e.preventDefault(); voegToe(k); }
  });
}

async function initProducten() {
  const grid = $("#product-grid");
  if (!grid) return;

  let categorieen, producten;
  try {
    [categorieen, producten] = await Promise.all([haalJSON(CONFIG.jsonCategorie), haalJSON(CONFIG.jsonProducten)]);
  } catch {
    grid.innerHTML = `<p class="form-status fout">De producten konden niet geladen worden. Open de site via een lokale server (bv. "Live Server" in VS Code) en controleer of json/categorie.json en json/producten.json bestaan.</p>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  const huidig = (params.get("c") || "").replace(/^\/+|\/+$/g, "");
  let zoekTekst = params.get("q") || "";
  let getoond = CONFIG.perPagina;

  const perPad = {};
  (function loop(nodes, ouder) {
    nodes.forEach((n) => {
      const pad = ouder ? `${ouder}/${n.id}` : n.id;
      perPad[pad] = n;
      loop(n.children || [], pad);
    });
  })(categorieen, "");

  const inCategorie = (p, pad) => {
    if (!pad) return true;
    if (pad === "lopende-acties") return !!p.actie;
    return (p.categorieen || []).some((c) => c === pad || c.startsWith(pad + "/"));
  };

  const tellers = {};
  const aantalIn = (pad) => (tellers[pad] ??= producten.filter((p) => inCategorie(p, pad)).length);

  function boomHTML(nodes, ouder) {
    return `<ul>${nodes.map((n) => {
      const pad = ouder ? `${ouder}/${n.id}` : n.id;
      const actief = huidig === pad;
      const open = huidig.startsWith(pad + "/");
      const kinderen = (n.children || []).length && (actief || open) ? boomHTML(n.children, pad) : "";
      return `<li class="${actief ? "actief" : ""}${open ? " open" : ""}">
        <a href="producten.html?c=${pad}">${esc(n.name)} <span class="aantal">${aantalIn(pad)}</span></a>${kinderen}</li>`;
    }).join("")}</ul>`;
  }

  $("#cat-lijst").innerHTML =
    `<ul><li class="${huidig ? "" : "actief"}"><a href="producten.html">Alle producten <span class="aantal">${producten.length}</span></a></li></ul>` +
    boomHTML(categorieen, "");

  // Op kleine schermen start de categorielijst ingeklapt
  const details = $("#cat-boom");
  if (details && window.innerWidth <= 1100 && !huidig) details.open = false;

  // Broodkruimel + titel
  const delen = huidig ? huidig.split("/") : [];
  const kruimels = delen.map((_, i) => {
    const pad = delen.slice(0, i + 1).join("/");
    return `<a href="producten.html?c=${pad}">${esc(perPad[pad]?.name || delen[i])}</a>`;
  });
  $("#broodkruimel").innerHTML = [`<a href="producten.html">Alle producten</a>`, ...kruimels].join(" › ");
  $("#producten-titel").textContent = huidig ? perPad[huidig]?.name || "Producten" : "Alle producten";

  const zoekveld = $("#zoek");
  zoekveld.value = zoekTekst;

  const perId = new Map(producten.map((p) => [p.id, p]));

  function render() {
    const termen = norm(zoekTekst).split(/\s+/).filter(Boolean);
    const lijst = producten.filter(
      (p) => inCategorie(p, huidig) && termen.every((t) => norm(p.naam).includes(t))
    );
    $("#producten-info").textContent = `${lijst.length} ${lijst.length === 1 ? "product" : "producten"}`;

    grid.innerHTML = lijst.length
      ? lijst.slice(0, getoond).map((p) => `
        <div class="product-kaart" data-id="${esc(p.id)}">
          <img class="adv-product-img" src="${afbeeldingVan(p)}" alt="${esc(p.naam)}" loading="lazy">
          <div class="adv-product-bio">
            <p class="adv-product-naam">${esc(p.naam)}</p>
            ${p.actie ? `<p class="adv-product-prijs">Actie: ${euro(p.actie.prijs)}</p>` : ""}
          </div>
          <div class="kaart-actie">
            <input type="number" class="kaart-aantal" min="1" max="999" value="1" aria-label="Aantal ${esc(p.naam)}">
            <button type="button" class="knop kaart-knop">Toevoegen</button>
          </div>
        </div>`).join("")
      : `<p class="factuur-leeg">Geen producten gevonden.</p>`;

    $("#toon-meer").hidden = lijst.length <= getoond;
  }
  render();

  grid.addEventListener("click", (e) => {
    const knop = e.target.closest(".kaart-knop");
    if (!knop) return;
    const kaart = knop.closest(".product-kaart");
    const invoer = $(".kaart-aantal", kaart);
    const product = perId.get(kaart.dataset.id);
    if (product) voegToeAanFactuur(product, invoer.value);
    invoer.value = 1;
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".kaart-aantal")) $(".kaart-knop", e.target.closest(".product-kaart")).click();
  });

  $("#toon-meer").addEventListener("click", () => { getoond += CONFIG.perPagina; render(); });

  zoekveld.addEventListener("input", () => {
    zoekTekst = zoekveld.value;
    getoond = CONFIG.perPagina;
    const nieuw = new URLSearchParams();
    if (huidig) nieuw.set("c", huidig);
    if (zoekTekst) nieuw.set("q", zoekTekst);
    history.replaceState(null, "", location.pathname + (nieuw.toString() ? "?" + nieuw.toString().replace(/%2F/g, "/") : ""));
    render();
  });
}

function contactBlok(v) {
  return [
    `Naam: ${v.naam}`,
    v.bedrijf ? `Bedrijf: ${v.bedrijf}` : null,
    `E-mail: ${v.email}`,
    v.nummer ? `Telefoon: ${v.nummer}` : null,
  ].filter(Boolean).join("\n");
}

function factuurBericht(lijst, v) {
  const regels = lijst.map(
    (i) => `- ${i.aantal}x ${i.naam}${i.prijs != null ? ` (actieprijs ${euro(i.prijs)} per stuk)` : ""}`
  );
  return [
    "Beste Nathalie,", "",
    "Graag ontving ik een prijs voor onderstaande producten.", "",
    contactBlok(v), "",
    "Producten:", ...regels, "",
    ...(v.bericht && v.bericht.trim() ? ["Vragen of opmerkingen:", v.bericht.trim(), ""] : []),
    "Met vriendelijke groeten,", v.naam,
  ].join("\n");
}

// Velden voor het factuurformulier (op de factuurpagina én in de popup). p = unieke id-voorvoegsel.
function factuurVelden(p, knopTekst = "Verstuur factuur") {
  return `
    <div class="input"><label for="${p}-naam">Naam *</label><input type="text" id="${p}-naam" name="naam" required autocomplete="name"></div>
    <div class="input"><label for="${p}-bedrijf">Bedrijf</label><input type="text" id="${p}-bedrijf" name="bedrijf" autocomplete="organization"></div>
    <div class="input"><label for="${p}-email">E-mail *</label><input type="email" id="${p}-email" name="email" required autocomplete="email"></div>
    <div class="input"><label for="${p}-nummer">Nummer</label><input type="tel" id="${p}-nummer" name="nummer" autocomplete="tel"></div>
    <div class="input"><label for="${p}-bericht">Bericht</label><textarea id="${p}-bericht" name="bericht" placeholder=" Vragen over bepaalde producten? Typ ze hier..."></textarea></div>
    <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="input"><span class="label-leeg"></span><label class="robot-check"><input type="checkbox" name="robot" required> Ik ben geen robot</label></div>
    <p class="form-status" role="status" aria-live="polite"></p>
    <div class="input knop-rij"><span class="label-leeg"></span><input type="submit" value="${knopTekst}"></div>`;
}

const maakMelder = (el) => (tekst, soort = "") => {
  el.textContent = tekst;
  el.className = "form-status " + soort;
};

function botControle(form) {
  const val = form.elements["website"];
  if (val && val.value) return "bot";
  if (Date.now() - Number(form.dataset.start || 0) < CONFIG.minSecondenFormulier * 1000) return "snel";
  return "ok";
}

async function stuurMail({ onderwerp, tekst, afzender, email, melding }) {
  if (CONFIG.formEndpoint) {
    try {
      melding("Bezig met verzenden…");
      const res = await fetch(CONFIG.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: CONFIG.formAccessKey,
          subject: onderwerp,
          name: afzender,
          email,
          message: tekst,
          botcheck: "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || res.status);
      melding("Bedankt! Je bericht is verzonden. Nathalie neemt zo snel mogelijk contact met je op.", "ok");
      return { ok: true, modus: "endpoint" };
    } catch {
      melding(`Verzenden is niet gelukt. Probeer het later opnieuw of mail naar ${CONFIG.mailTo}.`, "fout");
      return { ok: false };
    }
  }

  const mailtoUrl = (t) =>
    `mailto:${CONFIG.mailTo}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(t.replace(/\n/g, "\r\n"))}`;
  let body = tekst;
  let gekopieerd = false;
  let ingekort = false;
  if (mailtoUrl(body).length > CONFIG.maxMailtoLengte) {
    ingekort = true;
    const nota = "\n\n[Ingekort - de volledige tekst staat op het klembord: plak met Ctrl+V]";
    let n = tekst.length;
    while (n > 0 && mailtoUrl(tekst.slice(0, n) + nota).length > CONFIG.maxMailtoLengte) n = Math.floor(n * 0.9);
    body = tekst.slice(0, n) + nota;
    try { await navigator.clipboard.writeText(tekst); gekopieerd = true; } catch { /* geen toegang tot klembord */ }
  }
  window.location.href = mailtoUrl(body);
  melding(
    ingekort
      ? gekopieerd
        ? "Je e-mailprogramma wordt geopend. Je lijst is lang: de volledige tekst staat op je klembord, plak die (Ctrl+V) in het bericht en klik op verzenden."
        : `Je e-mailprogramma wordt geopend, maar je lijst was te lang om volledig mee te sturen. Mail ze eventueel rechtstreeks naar ${CONFIG.mailTo}.`
      : "Je e-mailprogramma wordt geopend met je bericht. Klik daar op verzenden om het te versturen.",
    "ok"
  );
  return { ok: true, modus: "mailto" };
}

function koppelFactuurFormulier(form, opSucces) {
  form.dataset.start = Date.now();
  const melding = maakMelder($(".form-status", form));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lijst = Factuur.lees();
    if (!lijst.length) return melding("Je factuur is nog leeg. Voeg eerst producten toe.", "fout");

    const check = botControle(form);
    if (check === "bot") return melding("Bedankt! Je bericht is verzonden.", "ok"); // bots krijgen niets te zien
    if (check === "snel") return melding("Dat ging wel erg snel. Probeer het over een paar seconden opnieuw.", "fout");

    const v = Object.fromEntries(new FormData(form));
    const knop = $('input[type="submit"]', form);
    knop.disabled = true;
    const res = await stuurMail({
      onderwerp: `Prijsaanvraag - ${v.naam}${v.bedrijf ? ` (${v.bedrijf})` : ""}`,
      tekst: factuurBericht(lijst, v),
      afzender: v.naam,
      email: v.email,
      melding,
    });
    knop.disabled = false;
    if (res.ok && res.modus === "endpoint") {
      Factuur.leeg();
      form.reset();
      form.dataset.start = Date.now();
      if (opSucces) opSucces();
    }
  });
}

function openVerzendModal() {
  const totaal = Factuur.totaal();
  if (!totaal) return toast("Voeg eerst producten toe aan je factuur.");
  if ($("#verzend-modal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="verzend-modal" role="dialog" aria-modal="true" aria-labelledby="modal-titel">
      <div class="modal-box">
        <button type="button" class="modal-sluit" aria-label="Sluiten">✕</button>
        <h1 id="modal-titel">Factuur verzenden</h1>
        <p>Je verstuurt ${totaal} ${totaal === 1 ? "artikel" : "artikelen"}. Laat hieronder je gegevens en eventuele vragen achter, ik reageer met een prijs op maat.</p>
        <form id="modal-formulier" class="form-stijl">${factuurVelden("modal", "Verstuur factuur")}</form>
      </div>
    </div>`);

  const modal = $("#verzend-modal");
  document.body.classList.add("geen-scroll");

  const sluit = () => {
    modal.remove();
    document.body.classList.remove("geen-scroll");
    document.removeEventListener("keydown", opEscape);
  };
  const opEscape = (e) => { if (e.key === "Escape") sluit(); };
  document.addEventListener("keydown", opEscape);
  modal.addEventListener("click", (e) => { if (e.target === modal) sluit(); });
  $(".modal-sluit", modal).addEventListener("click", sluit);

  koppelFactuurFormulier($("#modal-formulier"), () => { sluit(); toast("Bedankt! Je factuur is verzonden."); });
  $("#modal-naam").focus();
}

function factuurRijHTML(i) {
  return `
    <div class="factuur-rij" data-id="${esc(i.id)}">
      <img src="${esc(i.afbeelding || CONFIG.placeholderAfbeelding)}" alt="">
      <div class="factuur-rij-naam">
        <div>${esc(i.naam)}</div>
        ${i.prijs != null ? `<div class="adv-product-prijs">Actieprijs ${euro(i.prijs)} per stuk</div>` : ""}
      </div>
      <div class="aantal-regel">
        <button type="button" data-actie="min" aria-label="Eén minder" ${i.aantal <= 1 ? "disabled" : ""}>−</button>
        <input type="number" class="aantal-invoer" min="1" max="999" value="${i.aantal}" aria-label="Aantal ${esc(i.naam)}">
        <button type="button" data-actie="plus" aria-label="Eén meer">+</button>
      </div>
      <button type="button" class="verwijder" data-actie="del">Verwijderen</button>
    </div>`;
}

function initFactuurPagina() {
  const lijstEl = $("#factuur-overzicht-lijst");
  if (!lijstEl) return;

  const render = () => {
    const lijst = Factuur.lees();
    const totaal = Factuur.totaal();
    $("#factuur-teller").textContent = totaal
      ? `${lijst.length} ${lijst.length === 1 ? "product" : "producten"}, ${totaal} ${totaal === 1 ? "stuk" : "stuks"} in totaal`
      : "";
    lijstEl.innerHTML = lijst.length
      ? lijst.map(factuurRijHTML).join("")
      : `<p class="factuur-leeg">Je factuur is nog leeg.</p><a href="producten.html" class="knop">Bekijk de producten</a>`;
  };
  render();
  document.addEventListener("factuur:wijzig", render);
  window.addEventListener("storage", (e) => { if (e.key === Factuur.SLEUTEL) render(); });

  koppelAantalKnoppen(lijstEl, ".factuur-rij");
  lijstEl.addEventListener("change", (e) => {
    if (!e.target.matches(".aantal-invoer")) return;
    Factuur.zetAantal(e.target.closest(".factuur-rij").dataset.id, e.target.value);
  });

  const form = $("#factuur-formulier");
  form.innerHTML = factuurVelden("pagina");
  koppelFactuurFormulier(form);
}

function initContact() {
  const form = $("#contact-formulier");
  if (!form) return;
  form.dataset.start = Date.now();
  const melding = maakMelder($("#contact-status"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = botControle(form);
    if (check === "bot") return melding("Bedankt! Je bericht is verzonden.", "ok");
    if (check === "snel") return melding("Dat ging wel erg snel. Probeer het over een paar seconden opnieuw.", "fout");

    const v = Object.fromEntries(new FormData(form));
    const volledigeNaam = `${v.voornaam} ${v.name}`.trim();
    const knop = $('input[type="submit"]', form);
    knop.disabled = true;
    const res = await stuurMail({
      onderwerp: `Vraag via de website - ${volledigeNaam}`,
      tekst: `${contactBlok({ naam: volledigeNaam, email: v.email, nummer: v.nummer })}\n\nBericht:\n${v.bericht.trim()}`,
      afzender: volledigeNaam,
      email: v.email,
      melding,
    });
    knop.disabled = false;
    if (res.ok && res.modus === "endpoint") {
      form.reset();
      form.dataset.start = Date.now();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initNavHistory();
  bouwZijbalk();
  initUitgelicht();
  initProducten();
  initFactuurPagina();
  initContact();
});