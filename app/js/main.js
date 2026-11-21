import { $, $$, morph, counters, reduced, fmt } from "./dom.js";
import { icon } from "./icons.js";
import * as V from "./views.js";

const VIEWS = [
  { id: "overview", short: "Accueil", long: "Vue d'ensemble", icon: "gauge" },
  { id: "farms", short: "Fermes", long: "Fermes", icon: "sprout" },
  { id: "market", short: "Marché", long: "Marché de l'eau", icon: "swap" },
  { id: "analysis", short: "Analyse", long: "Analyse mensuelle", icon: "chart" },
  { id: "alerts", short: "Alertes", long: "Alertes", icon: "bell" },
  { id: "impact", short: "Impact", long: "Impact", icon: "trend" },
];
const state = { sim: null, an: null, h: 0, view: "overview", timer: null, widths: {} };
const view = $("#view");

const routeFromHash = () => {
  const id = location.hash.replace(/^#\/?/, "");
  return VIEWS.some((v) => v.id === id) ? id : "overview";
};

function ctx() {
  const names = Object.fromEntries(state.sim.farms.map((f) => [f.id, f.name]));
  const content = view.clientWidth - parseFloat(getComputedStyle(view).paddingLeft) * 2;
  const pad = 44;
  const twoCol = content >= 760 - 64;
  const est = { zone: (twoCol ? (content - 16) * 0.68 : content) - pad, elec: (twoCol ? (content - 16) / 2 : content) - pad };
  est.water = est.night = est.elec;
  return {
    sim: state.sim, an: state.an, h: state.h,
    s: state.sim.platform.series[state.h], b: state.sim.baseline.series[state.h],
    name: (id) => names[id] || id,
    w: (k) => state.widths[k] || est[k] || content - pad,
  };
}

function html() {
  return V[state.view](ctx());
}

function measure() {
  let changed = false;
  for (const el of $$("[data-chart]", view)) {
    const w = Math.round(el.clientWidth);
    if (w && Math.abs((state.widths[el.dataset.chart] || 0) - w) > 3) {
      state.widths[el.dataset.chart] = w;
      changed = true;
    }
  }
  return changed;
}

function update() {
  header();
  morph(view, html());
  if (measure()) morph(view, html());
  counters(view);
}

function mount(dir) {
  view.innerHTML = html();
  $$(".card", view).forEach((c, i) => c.style.setProperty("--i", i));
  if (measure()) morph(view, html());
  counters(view);
  if (dir && !reduced()) {
    view.classList.add(dir === 1 ? "in-r" : "in-l");
    view.addEventListener("animationend", () => view.classList.remove("in-r", "in-l"), { once: true });
  }
}

function go(id) {
  if (!state.sim) { state.view = id; markNav(); return; }
  if (id === state.view && view.children.length) return;
  const order = (v) => VIEWS.findIndex((x) => x.id === v);
  const dir = order(id) >= order(state.view) ? 1 : -1;
  state.view = id;
  markNav();
  document.title = `${VIEWS[order(id)].long} · Sakia`;
  const swap = () => {
    view.classList.remove("out-l", "out-r");
    window.scrollTo({ top: 0, behavior: "instant" });
    mount(dir);
  };
  if (reduced()) return swap();
  view.classList.add(dir === 1 ? "out-l" : "out-r");
  setTimeout(swap, 140);
}

function markNav() {
  $$("#nav button").forEach((b) => (b.dataset.v === state.view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
}

function header() {
  const s = state.sim.platform.series[state.h];
  $("#when").textContent = V.hourLabel(state.h);
  $("#whenSub").textContent = s.grid ? "Réseau électrique actif" : "Coupure de courant";
  const slider = $("#slider");
  slider.value = state.h;
  slider.style.setProperty("--p", `${(state.h / 71) * 100}%`);
  slider.setAttribute("aria-valuetext", V.hourLabel(state.h));
  $("#pTemp").innerHTML = `${icon("thermo", "i-sm")}${fmt(s.temp, 0)} °C`;
  $("#pTemp").setAttribute("aria-label", `Température ${fmt(s.temp, 1)} degrés`);
  const g = $("#pGrid");
  g.className = `pill ${s.grid ? "ok" : "bad"}`;
  g.innerHTML = `${icon("bolt", "i-sm")}${s.grid ? '<span class="full">Courant </span>OK' : "Coupure"}`;
  g.setAttribute("aria-label", s.grid ? "Courant disponible" : "Coupure de courant");
  const r = $("#pRisk");
  const tone = s.risk_label === "élevé" ? "bad" : s.risk_label === "moyen" ? "mid" : "ok";
  r.className = `pill ${tone}`;
  r.innerHTML = `${icon("gauge", "i-sm")}<span class="full">Risque </span>${s.risk_label} · ${s.risk}`;
  r.setAttribute("aria-label", `Risque de coupure ${s.risk_label}, ${s.risk} sur 100`);
  const o = $("#outage");
  o.hidden = s.grid;
  if (!s.grid) o.innerHTML = `${icon("bolt")}<span>Coupure de courant</span><small>Autonomie ${fmt(s.autonomy)} h · marché ouvert</small>`;
}

function setHour(h) {
  state.h = (h + 72) % 72;
  update();
}

function togglePlay(force) {
  const playing = force ?? !state.timer;
  clearInterval(state.timer);
  state.timer = null;
  if (playing) state.timer = setInterval(() => setHour(state.h + 1), reduced() ? 900 : 500);
  const b = $("#play");
  b.innerHTML = icon(playing ? "pause" : "play");
  b.setAttribute("aria-label", playing ? "Pause" : "Lecture");
  b.setAttribute("aria-pressed", String(playing));
}

const THEME_KEY = "sakia-theme";
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function paintTheme() {
  const dark = currentTheme() === "dark";
  const b = $("#theme");
  b.innerHTML = icon(dark ? "sun" : "moon");
  b.setAttribute("aria-label", dark ? "Passer en mode clair" : "Passer en mode sombre");
  $('meta[name="theme-color"]:not([media])').setAttribute("content", dark ? "#0d1620" : "#f7f4ee");
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  paintTheme();
}

function buildNav() {
  $("#nav").innerHTML = VIEWS.map((v) => `<button type="button" data-v="${v.id}">${icon(v.icon)}<span class="lbl-s">${v.short}</span><span class="lbl-l">${v.long}</span></button>`).join("");
  $$("#nav button").forEach((b) => (b.onclick = () => {
    if (location.hash !== `#/${b.dataset.v}`) location.hash = `/${b.dataset.v}`;
    else go(b.dataset.v);
  }));
}

function hideSplash(t0) {
  const wait = reduced() ? 0 : Math.max(0, 1000 - (performance.now() - t0));
  setTimeout(() => $("#splash").classList.add("out"), wait);
}

async function boot() {
  const t0 = performance.now();
  buildNav();
  state.view = routeFromHash();
  markNav();
  paintTheme();
  view.innerHTML = V.skeleton();
  $("#theme").onclick = toggleTheme;
  $("#play").onclick = () => togglePlay();
  togglePlay(false);
  $("#slider").addEventListener("input", (e) => { togglePlay(false); setHour(+e.target.value); });
  addEventListener("hashchange", () => go(routeFromHash()));
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, button, a")) return;
    if (e.key === "ArrowRight") setHour(state.h + 1);
    if (e.key === "ArrowLeft") setHour(state.h - 1);
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintTheme);
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.sim && update(), 150); });
  try {
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} : ${r.status}`); return r.json(); });
    [state.sim, state.an] = await Promise.all([get("/api/simulation"), get("/api/analysis")]);
  } catch (err) {
    view.innerHTML = V.errorView(err.message);
    hideSplash(t0);
    return;
  }
  const h = +new URLSearchParams(location.search).get("h");
  state.h = Number.isFinite(h) ? Math.min(71, Math.max(0, h)) : 0;
  header();
  document.title = `${VIEWS.find((v) => v.id === state.view).long} · Sakia`;
  mount(0);
  hideSplash(t0);
}

boot();
