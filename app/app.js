const $ = (s) => document.querySelector(s);
const state = { sim: null, an: null, h: 0, view: "overview", timer: null };
const RES = 30;
const ICONS = { sun: "☀️", tank: "🛢️", drop: "💧", bolt: "⚡", leaf: "🌿" };
const farmName = (id) => state.sim.farms.find((f) => f.id === id).name;
const hourLabel = (h) => `Jour ${Math.floor(h / 24) + 1}, ${String(h % 24).padStart(2, "0")} h`;
const cur = () => state.sim.platform.series[state.h];
const base = () => state.sim.baseline.series[state.h];

async function boot() {
  const [sim, an] = await Promise.all([fetch("/api/simulation").then((r) => r.json()), fetch("/api/analysis").then((r) => r.json())]);
  state.sim = sim; state.an = an;
  $("#slider").oninput = (e) => { state.h = +e.target.value; render(); };
  $("#play").onclick = togglePlay;
  document.querySelectorAll("#nav button").forEach((b) => (b.onclick = () => {
    state.view = b.dataset.v;
    document.querySelectorAll("#nav button").forEach((x) => x.classList.toggle("on", x === b));
    render();
  }));
  render();
}

function togglePlay() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; $("#play").textContent = "▶"; return; }
  $("#play").textContent = "❚❚";
  state.timer = setInterval(() => {
    state.h = (state.h + 1) % 72;
    $("#slider").value = state.h;
    render();
  }, 450);
}

function header() {
  const s = cur();
  $("#when").textContent = hourLabel(state.h);
  $("#whenSub").textContent = s.grid ? "Réseau électrique actif" : "Coupure de courant";
  $("#pTemp").textContent = `🌡️ ${s.temp} °C`;
  const g = $("#pGrid"); g.textContent = s.grid ? "⚡ Courant OK" : "⚡ Coupure"; g.className = "pill " + (s.grid ? "ok" : "bad");
  const r = $("#pRisk"); r.textContent = `Risque ${s.risk_label} (${s.risk})`;
  r.className = "pill " + (s.risk_label === "élevé" ? "bad" : s.risk_label === "moyen" ? "mid" : "ok");
}

function render() {
  header();
  const v = { overview, farms, aid, analysis, alerts, impact }[state.view];
  $("#view").innerHTML = v();
}

function tank(pct, big) {
  const low = pct <= RES ? " low" : "";
  return `<div class="tank"><div class="fill${low}" style="height:${pct}%"></div><div class="res" style="bottom:${RES}%"></div></div>`;
}

function chart() {
  const W = 760, H = 250, L = 38, B = 28, T = 10, R = 10;
  const n = 72, x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - v / 100) * (H - T - B);
  const line = (key, color, dash) => `<polyline fill="none" stroke="${color}" stroke-width="2.6" ${dash ? 'stroke-dasharray="6 5"' : ""} points="${state.sim[key].series.map((s, i) => `${x(i)},${y(s.stock_pct)}`).join(" ")}"/>`;
  const bands = state.sim.outages.map((h) => `<rect x="${x(h) - 4}" y="${T}" width="${x(1) - x(0)}" height="${H - T - B}" fill="#f5a524" opacity=".18"/>`).join("");
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4eaf1"/><text x="4" y="${y(v) + 4}">${v}%</text>`).join("");
  const days = [0, 24, 48].map((h) => `<text x="${x(h)}" y="${H - 8}">Jour ${h / 24 + 1}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${grid}${bands}<line x1="${L}" x2="${W - R}" y1="${y(RES)}" y2="${y(RES)}" stroke="#12263a" stroke-dasharray="3 4" opacity=".5"/>${line("baseline", "#e5484d", true)}${line("platform", "#1d8fe0")}<line x1="${x(state.h)}" x2="${x(state.h)}" y1="${T}" y2="${H - B}" stroke="#12263a" stroke-width="1.5"/>${days}</svg>
  <div class="legend"><span><i style="background:#1d8fe0"></i>Avec la plateforme</span><span><i style="background:#e5484d"></i>Sans plateforme</span><span><i style="background:#f5a524;opacity:.5"></i>Coupures</span><span>Ligne pointillée : réserve 30 %</span></div>`;
}

function overview() {
  const s = cur(), b = base();
  const low = s.stock_pct < 40 ? " low" : "";
  const dry = Object.keys(s.dry).length;
  return `<div class="grid g2">
    <div class="card battery"><h2>Batterie virtuelle de la zone</h2><p class="sub">Toutes les cuves réunies</p>
      <div class="bat"><div class="fill${low}" style="height:${s.stock_pct}%"></div><div class="res" style="bottom:${RES}%"></div><div class="val">${Math.round(s.stock_pct)}%</div></div>
      <p class="note">Sans plateforme : ${Math.round(b.stock_pct)} %</p></div>
    <div class="card"><h2>Niveau de la zone sur 72 h</h2><p class="sub">Les coupures sont en orange</p>${chart()}</div>
  </div>
  <div class="grid g4">
    <div class="card kpi w"><small>Autonomie de la zone</small><div class="num">${s.autonomy} h</div><small>sans plateforme : ${b.autonomy} h</small></div>
    <div class="card kpi e"><small>Risque de coupure</small><div class="num">${s.risk}/100</div><small>${s.risk_label}</small></div>
    <div class="card kpi ${dry ? "b" : "a"}"><small>Fermes à sec</small><div class="num">${dry}</div><small>sans plateforme : ${Object.keys(b.dry).length}</small></div>
    <div class="card kpi a"><small>Entraides en cours</small><div class="num">${s.transfers.length}</div><small>échanges de cette heure</small></div>
  </div>
  <div class="card"><h2>Décisions de l'heure</h2><p class="sub">Ce que la plateforme commande</p>${decisions()}</div>`;
}

function decisions() {
  const s = cur();
  if (!s.log.length && !s.transfers.length) return `<p class="note">Aucune action : les cuves tiennent. La réserve de ${RES} % est conservée.</p>`;
  const a = s.log.map((l) => `<div class="row"><b>${farmName(l[0])}</b><span class="tag p2">${l[1]}</span><span>+${l[2]} m³</span></div>`);
  const t = s.transfers.map((x) => `<div class="row"><b>${farmName(x.from)} → ${farmName(x.to)}</b><span class="tag p3">entraide</span><span>${x.m3} m³</span></div>`);
  return a.concat(t).join("");
}

function farms() {
  const s = cur(), b = base();
  return `<div class="grid g3">${state.sim.farms.map((f) => {
    const lv = s.levels[f.id], lb = b.levels[f.id];
    return `<div class="card farm">${tank(lv)}<div><h3>${f.name}</h3><p>${f.crop}</p>
      <span class="tag p${f.priority}">Priorité ${f.priority}</span>${s.dry[f.id] ? '<span class="tag dry">À sec</span>' : ""}
      <p style="margin-top:8px"><b>${lv}%</b> avec plateforme<br>${lb}% sans plateforme · ${f.cap} m³</p></div></div>`;
  }).join("")}</div>
  <p class="note">Priorité 1 : eau potable et bétail. Priorité 2 : cultures fragiles. Priorité 3 : arbres, plus résistants.</p>`;
}

function aid() {
  const all = state.sim.platform.transfers.filter((t) => t.hour <= state.h);
  const total = all.reduce((a, t) => a + t.m3, 0).toFixed(1);
  const rows = all.slice().reverse().map((t) => `<div class="row"><div class="flow"><span>${farmName(t.from)}</span><span class="arrow">→</span><span>${farmName(t.to)}</span></div><span>${t.m3} m³</span><small>${hourLabel(t.hour)}</small></div>`).join("");
  return `<div class="grid g3"><div class="card kpi w"><small>Eau partagée</small><div class="num">${total} m³</div></div><div class="card kpi a"><small>Échanges</small><div class="num">${all.length}</div></div><div class="card kpi e"><small>Règle</small><div class="num" style="font-size:20px">Don, jamais vente</div></div></div>
  <div class="card"><h2>Entraide entre voisins</h2><p class="sub">Pendant une coupure, les cuves pleines aident celles qui descendent sous la réserve.</p>${rows || '<p class="note">Aucun échange pour le moment. Avancer le temps jusqu\'à une coupure.</p>'}</div>`;
}

function bars(vals, months, color, flags, unit) {
  const W = 520, H = 200, L = 10, B = 24, max = Math.max(...vals) * 1.1, bw = (W - L) / 12;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${vals.map((v, i) => {
    const h = (v / max) * (H - B - 10), bad = flags.includes(i);
    return `<rect x="${L + i * bw + 4}" y="${H - B - h}" width="${bw - 8}" height="${h}" rx="5" fill="${bad ? "#e5484d" : color}"/><text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${months[i]}</text>${bad ? `<text x="${L + i * bw + bw / 2}" y="${H - B - h - 5}" text-anchor="middle" style="fill:#e5484d;font-weight:700">${v}</text>` : ""}`;
  }).join("")}</svg>`;
}

function analysis() {
  const d = state.an.data, an = state.an.anomalies;
  const fl = (m) => an.filter((a) => a.metric === m).map((a) => a.index);
  const night = an.filter((a) => a.metric === "Débit nocturne").map((a) => a.index);
  return `<div class="grid g2" style="grid-template-columns:1fr 1fr">
    <div class="card"><h2>⚡ Électricité par mois</h2><p class="sub">kWh · rouge = anormal</p>${bars(d.electricity_kwh, d.months, "#f5a524", fl("Électricité"))}</div>
    <div class="card"><h2>💧 Eau par mois</h2><p class="sub">m³ · rouge = anormal</p>${bars(d.water_m3, d.months, "#1d8fe0", fl("Eau"))}</div>
  </div>
  <div class="grid g2" style="grid-template-columns:1fr 1fr">
    <div class="card"><h2>🌙 Part de l'eau consommée la nuit</h2><p class="sub">% entre 0 h et 5 h · au-dessus de 15 %, fuite probable</p>${bars(d.night_flow_pct, d.months, "#2fa36b", night)}</div>
    <div class="card"><h2>Anomalies détectées</h2><p class="sub">Comparaison de chaque mois avec ses voisins</p>
      ${an.map((a) => `<div class="an"><b>${a.type} · ${a.month}</b><span>${a.metric} : ${a.value} ${a.unit} (x${a.ratio}). ${a.cause}.</span></div>`).join("")}
      <p class="note">Économie possible : environ ${state.an.potential.kwh} kWh et ${state.an.potential.m3} m³ par an.</p></div>
  </div>
  <div class="card"><h2>Comment économiser la batterie virtuelle</h2><p class="sub">Conseils selon les anomalies</p><div class="tips">${state.an.tips.map((t) => `<div class="tip"><div class="ico">${ICONS[t.icon]}</div><b>${t.title}</b><p>${t.text}</p></div>`).join("")}</div></div>`;
}

function alerts() {
  const list = state.sim.alerts.filter((a) => a.hour <= state.h).reverse();
  return `<div class="card"><h2>Alertes envoyées aux agriculteurs</h2><p class="sub">WhatsApp et SMS, en français et en arabe tunisien</p><div class="feed">${list.map((a) => `<div class="msg ${a.channel === "SMS" ? "sms" : ""}"><b>${a.channel} · risque ${a.level}</b><br>${a.text}<small>${hourLabel(a.hour)}</small></div>`).join("") || '<p class="note">Aucune alerte. Avancer le temps.</p>'}</div></div>`;
}

function impact() {
  const i = state.sim.impact;
  const row = (l, a, b, unit) => { const m = Math.max(a, b, 1); return `<div class="cmpbar"><span>${l}</span><div><div class="bar" style="width:${(a / m) * 100}%"></div><div class="bar g" style="width:${(b / m) * 100}%;margin-top:4px"></div></div><span>${a} / ${b} ${unit}</span></div>`; };
  return `<div class="card hero"><h2>Avec la plateforme, ${i.reduction_pct} % d'eau manquante en moins</h2><p class="sub">Même canicule, mêmes coupures, 8 fermes, 72 h</p><div class="num">${i.saved_m3} m³</div><p class="sub">d'eau sauvés pour la zone</p></div>
  <div class="grid g3"><div class="card kpi b"><small>Heures à sec, sans plateforme</small><div class="num">${i.dry_hours_without}</div></div><div class="card kpi a"><small>Heures à sec, avec plateforme</small><div class="num">${i.dry_hours_with}</div></div><div class="card kpi w"><small>Eau partagée entre voisins</small><div class="num">${i.transferred_m3} m³</div></div></div>
  <div class="card"><h2>Comparaison</h2><p class="sub">Rouge : sans plateforme. Vert : avec plateforme.</p><div class="cmp">${row("Eau manquante", i.unmet_without, i.unmet_with, "m³")}${row("Heures à sec", i.dry_hours_without, i.dry_hours_with, "h")}</div>
  <p class="note" style="margin-top:14px">Simulation : le comportement sans plateforme est une pompe qui démarre seulement sous 30 % de remplissage. Les données réelles viendront des capteurs ESP32 via l'API.</p></div>`;
}

boot();
