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
  const v = { overview, farms, market, analysis, alerts, impact }[state.view];
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
    <div class="card kpi a"><small>Échanges en cours</small><div class="num">${s.trades.length}</div><small>prêts d'eau de cette heure</small></div>
  </div>
  <div class="card"><h2>Décisions de l'heure</h2><p class="sub">Ce que la plateforme commande</p>${decisions()}</div>`;
}

function decisions() {
  const s = cur();
  if (!s.log.length && !s.trades.length && !s.repayments.length) return `<p class="note">Aucune action : les cuves tiennent. La réserve de ${RES} % est conservée.</p>`;
  const a = s.log.map((l) => `<div class="row"><b>${farmName(l[0])}</b><span class="tag p2">${l[1]}</span><span>+${l[2]} m³</span></div>`);
  const t = s.trades.map((x) => `<div class="row"><b>${farmName(x.from)} → ${farmName(x.to)}</b><span class="tag p3">échange × ${fmt(x.rate, 2)}</span><span>${x.m3} m³, ${x.due_m3} m³ à rendre</span></div>`);
  const r = s.repayments.map((x) => `<div class="row"><b>${farmName(x.from)} → ${farmName(x.to)}</b><span class="tag p2">remboursement</span><span>${x.m3} m³</span></div>`);
  return a.concat(t, r).join("");
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

const fmt = (v, d = 1) => (+v).toFixed(d).replace(".", ",");
const URG = { "élevée": "p1", moyenne: "p2", faible: "p3" };
const ST = { rendue: "p3", "rendue en retard": "p2", "à rendre": "", "en retard": "p1" };

function debtsAt(h) {
  const paid = {};
  state.sim.platform.repayments.filter((r) => r.hour <= h).forEach((r) => (paid[r.debt] = (paid[r.debt] || 0) + r.m3));
  return state.sim.platform.ledger.filter((d) => d.hour <= h).map((d) => {
    const left = Math.max(0, d.due_m3 - (paid[d.id] || 0));
    const late = d.closed !== null && d.closed <= h ? d.closed > d.due_hour : h > d.due_hour;
    const status = left <= 0.05 ? (late ? "rendue en retard" : "rendue") : late ? "en retard" : "à rendre";
    return { ...d, left, status };
  });
}

function market() {
  const s = cur(), h = state.h, debts = debtsAt(h);
  const done = state.sim.platform.trades.filter((t) => t.hour <= h);
  const vol = done.reduce((a, t) => a + t.m3, 0);
  const rate = vol ? done.reduce((a, t) => a + t.m3 * t.rate, 0) / vol : 0;
  const closed = '<p class="note">Marché fermé : le courant est là, chaque ferme pompe pour elle-même. Avancer jusqu\'à une coupure.</p>';
  const table = (head, rows, empty) => (rows ? `<table class="tbl"><tr>${head.map((x) => `<th>${x}</th>`).join("")}</tr>${rows}</table>` : `<p class="note">${empty}</p>`);
  const offers = s.offers.map((o) => `<tr><td><b>${farmName(o.farm)}</b></td><td>${fmt(o.m3)} m³</td><td><span class="tag p3">× ${fmt(o.rate, 2)}</span></td></tr>`).join("");
  const demands = s.demands.map((d) => `<tr><td><b>${farmName(d.farm)}</b></td><td>${fmt(d.m3)} m³</td><td><span class="tag ${URG[d.urgency]}">${d.urgency}</span><small class="muted">à sec dans ${fmt(d.hours_to_dry)} h</small></td></tr>`).join("");
  const refused = s.refused.map((r) => `<div class="an"><b>${farmName(r.farm)} · demande refusée</b><span>${r.reason}</span></div>`).join("");
  const trades = debts.slice().reverse().map((d) => `<tr><td><div class="flow"><span>${farmName(d.lender)}</span><span class="arrow">→</span><span>${farmName(d.borrower)}</span></div><small class="muted">${hourLabel(d.hour)}</small></td><td>${fmt(d.m3)} m³</td><td>× ${fmt(d.rate, 2)}</td><td>${fmt(d.due_m3)} m³</td><td><span class="tag ${ST[d.status]}">${d.status}</span></td></tr>`).join("");
  const acc = state.sim.farms.map((f) => {
    const owes = debts.filter((d) => d.borrower === f.id).reduce((a, d) => a + d.left, 0);
    const owed = debts.filter((d) => d.lender === f.id).reduce((a, d) => a + d.left, 0);
    const rel = s.reliability[f.id] ?? 1, b = state.sim.accounts[f.id];
    const role = b.lent_m3 ? "prêteur" : b.borrowed_m3 ? "emprunteur" : "hors marché";
    const color = rel >= 0.9 ? "var(--agri)" : rel >= 0.7 ? "var(--energy)" : "var(--bad)";
    return `<tr><td><b>${f.name}</b><small class="muted">${role}</small></td><td>${owed > 0.05 ? "+" + fmt(owed) : "0"} m³</td><td>${owes > 0.05 ? "−" + fmt(owes) : "0"} m³</td>
      <td><div class="rel"><i style="width:${rel * 100}%;background:${color}"></i></div><small class="muted">${Math.round(rel * 100)} %</small></td>
      <td class="${b.net_gain_m3 > 0 ? "gain" : ""}">${b.net_gain_m3 > 0 ? "+" : ""}${fmt(b.net_gain_m3)} m³</td><td>${b.dry_hours_avoided} h</td></tr>`;
  }).join("");
  return `<div class="grid g4"><div class="card kpi w"><small>Eau échangée</small><div class="num">${fmt(vol)} m³</div><small>depuis le début</small></div><div class="card kpi a"><small>Échanges conclus</small><div class="num">${done.length}</div><small>chacun avec une dette</small></div><div class="card kpi e"><small>Taux moyen</small><div class="num">× ${fmt(rate, 2)}</div><small>m³ rendus pour 1 m³ reçu</small></div><div class="card kpi"><small>Règle</small><div class="num" style="font-size:20px;margin-top:6px">Eau contre eau</div><small>aucun prix, aucune vente</small></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><h2>Offres de prêt</h2><p class="sub">Une ferme prête seulement ce qui dépasse ses besoins jusqu'à la fin de la coupure, plus 2 h de marge. Meilleur taux en premier.</p>${s.grid ? closed : table(["Ferme", "Volume", "Taux"], offers, "Aucune ferme n'a d'excédent à cette heure.")}</div>
    <div class="card"><h2>Demandes</h2><p class="sub">Une ferme emprunte seulement si l'eau à rendre coûte moins que la perte évitée. Plus urgent en premier.</p>${s.grid ? closed : table(["Ferme", "Volume", "Urgence"], demands, "Aucune demande à cette heure.")}${refused}</div>
  </div>
  <div class="card"><h2>Échanges conclus</h2><p class="sub">Chaque prêt crée une dette dans le compte d'eau. Elle est rendue en eau après la coupure, avant que l'emprunteur ne remplisse sa cuve au-delà de sa réserve.</p>${table(["Prêteur → emprunteur", "Reçu", "Taux", "À rendre", "État"], trades, "Aucun échange pour le moment. Avancer le temps jusqu'à une coupure.")}</div>
  <div class="card"><h2>Compte d'eau et bilan de chaque ferme</h2><p class="sub">Créances et dettes à l'heure affichée. Gain net et heures à sec évitées sur 72 h, par rapport à la même plateforme sans marché (simulation).</p>
    ${table(["Ferme", "On lui doit", "Elle doit", "Fiabilité", "Gain net 72 h", "Heures à sec évitées"], acc, "")}
    <p class="note" style="margin-top:12px">Prêteur : il gagne la prime, l'eau rendue en plus. Emprunteur : il évite le manque d'eau, moins la prime. Une ferme qui rend en retard perd de la fiabilité et paie un taux plus élevé. Trop endettée, sa demande est refusée.</p></div>`;
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
  return `<div class="card hero"><h2>Avec la plateforme, ${i.reduction_pct} % d'eau manquante en moins</h2><p class="sub">Simulation : même canicule, mêmes coupures, 8 fermes, 72 h</p><div class="num">${i.saved_m3} m³</div><p class="sub">d'eau manquante évitée pour la zone</p></div>
  <div class="grid g4"><div class="card kpi b"><small>Heures à sec, sans plateforme</small><div class="num">${i.dry_hours_without}</div></div><div class="card kpi e"><small>Heures à sec, plateforme sans marché</small><div class="num">${i.dry_hours_no_market}</div></div><div class="card kpi a"><small>Heures à sec, plateforme + marché</small><div class="num">${i.dry_hours_with}</div></div><div class="card kpi w"><small>Eau échangée</small><div class="num">${i.traded_m3} m³</div><small>${i.trades} échanges, taux moyen × ${fmt(i.avg_rate, 2)}</small></div></div>
  <div class="card"><h2>Comparaison</h2><p class="sub">Rouge : sans plateforme. Vert : plateforme et marché de l'eau.</p><div class="cmp">${row("Eau manquante", i.unmet_without, i.unmet_with, "m³")}${row("Heures à sec", i.dry_hours_without, i.dry_hours_with, "h")}</div>
  <p class="note" style="margin-top:14px">Le marché évite ${i.market_saved_m3} m³ d'eau manquante par rapport à la même plateforme sans échange (${i.unmet_no_market} m³ → ${i.unmet_with} m³). ${i.repaid_m3} m³ ont été rendus après les coupures.</p>
  <p class="note">Chiffres issus de la simulation, pas de mesures réelles. Sans plateforme : une pompe qui démarre seulement sous 30 % de remplissage. Les données réelles viendront des capteurs ESP32 via l'API.</p></div>`;
}

boot();
