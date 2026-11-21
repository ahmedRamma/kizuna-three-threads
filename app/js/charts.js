import { count, fmt } from "./dom.js";

export const RES = 30;
const WAVE = (cls) =>
  `<svg class="wave ${cls}" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6Q25 0 50 6T100 6T150 6T200 6V12H0Z"/></svg>`;

const water = () => `<div class="liq">${WAVE("back")}${WAVE("")}<div class="body"></div></div>`;

export function battery(pct, label) {
  const p = Math.round(pct);
  return `<div class="bat ${p < RES ? "low" : ""}" style="--lvl:${p}" role="img" aria-label="${label} : ${p} %">
    <div class="bat-in">${water()}<div class="res"><span>réserve 30 %</span></div></div>
    <div class="val"><span>${count(p)}<span>%</span></span><small>stock de la zone</small></div></div>`;
}

export function tank(pct, label) {
  const p = Math.round(pct);
  return `<div class="tank ${p < RES ? "low" : ""}" style="--lvl:${p}" role="img" aria-label="${label} : cuve à ${p} %">${water()}<div class="res"></div></div>`;
}

export function gauge(score, label) {
  const cls = label === "élevé" ? "bad" : label === "moyen" ? "mid" : "ok";
  return `<div class="gauge ${cls === "bad" ? "high" : ""}" role="img" aria-label="Risque de coupure ${label}, ${score} sur 100">
    <div class="glow"></div>
    <svg viewBox="0 0 120 68" aria-hidden="true">
      <path class="g-track" d="M12 60A48 48 0 0 1 108 60" fill="none" stroke-width="11" stroke-linecap="round"/>
      <path class="g-val ${cls}" d="M12 60A48 48 0 0 1 108 60" fill="none" stroke-width="11" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - score}"/>
    </svg>
    <div class="g-txt"><div class="num">${count(score)}<span class="u">/100</span></div><small>${label}</small></div></div>`;
}

function ranges(hours) {
  const out = [];
  for (const h of hours) {
    const last = out[out.length - 1];
    if (last && last[1] === h - 1) last[1] = h;
    else out.push([h, h]);
  }
  return out;
}

export function zoneChart(sim, h, W) {
  W = Math.max(280, Math.round(W));
  const H = Math.round(Math.min(280, Math.max(190, W * 0.42)));
  const L = 34, R = 10, T = 12, B = 26, n = 72;
  const x = (i) => L + (i / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const pts = (k) => sim[k].series.map((s, i) => `${x(i).toFixed(1)},${y(s.stock_pct).toFixed(1)}`).join(" ");
  const plat = pts("platform");
  const area = `M${x(0)},${y(0)} L${plat.replaceAll(" ", " L")} L${x(n - 1)},${y(0)}Z`;
  const bands = ranges(sim.outages).map(([a, b]) => `<rect class="ch-band" x="${x(a) - 2}" y="${T}" width="${x(b) - x(a) + 4}" height="${H - T - B}" rx="4"/>`).join("");
  const grid = [0, 50, 100].map((v) => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${v}%</text>`).join("");
  const days = [0, 24, 48].map((d) => `<text x="${x(d)}" y="${H - 6}">Jour ${d / 24 + 1}</text>`).join("");
  const cur = sim.platform.series[h];
  return `<div class="chart" data-chart="zone"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Niveau de la zone sur 72 heures. Avec la plateforme, le stock reste plus haut que sans plateforme pendant les coupures. Heure affichée : ${fmt(cur.stock_pct, 0)} %.">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c-water);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--c-water);stop-opacity:0"/></linearGradient></defs>
    ${grid}${bands}
    <line class="ch-res" x1="${L}" x2="${W - R}" y1="${y(RES)}" y2="${y(RES)}"/>
    <path class="ch-area" d="${area}"/>
    <polyline class="ch-line base" points="${pts("baseline")}"/>
    <polyline class="ch-line plat" pathLength="1" points="${plat}"/>
    <g class="ch-cursor" style="transform:translateX(${x(h).toFixed(1)}px)"><line x1="0" x2="0" y1="${T}" y2="${H - B}"/></g>
    <g class="ch-cursor" style="transform:translate(${x(h).toFixed(1)}px,${y(cur.stock_pct).toFixed(1)}px)"><circle r="5.5"/></g>
    ${days}</svg>
    <div class="legend"><span><i style="background:var(--c-water)"></i>Avec Sakia</span><span><i style="background:var(--c-bad)"></i>Sans plateforme</span><span><i style="background:var(--c-energy);opacity:.5"></i>Coupures</span><span><i style="background:var(--ink);opacity:.4"></i>Réserve 30 %</span></div></div>`;
}

export function bars({ key, vals, months, kind, flags, W, unit, thr, label }) {
  W = Math.max(260, Math.round(W));
  const H = 190, B = 22, T = 18;
  const max = Math.max(...vals, thr || 0) * 1.08;
  const bw = W / vals.length;
  const short = bw < 34;
  const y = (v) => H - B - (v / max) * (H - B - T);
  const rects = vals.map((v, i) => {
    const bad = flags.includes(i);
    const cx = i * bw + bw / 2;
    const name = short ? months[i].slice(0, 1) : months[i].slice(0, 4);
    return `<rect class="b ${bad ? "bad" : ""}" style="--j:${i}" x="${(i * bw + bw * 0.18).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - B - y(v)).toFixed(1)}" rx="${Math.min(6, bw * 0.2).toFixed(1)}"><title>${months[i]} : ${fmt(v, 0)} ${unit}</title></rect>
      <text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${name}</text>${bad ? `<text class="v" x="${cx.toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle">${fmt(v, 0)}</text>` : ""}`;
  }).join("");
  const line = thr ? `<line class="thr" x1="0" x2="${W}" y1="${y(thr)}" y2="${y(thr)}"/>` : "";
  return `<div class="chart bars ${kind}" data-chart="${key}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${line}${rects}</svg></div>`;
}
