import { icon, EMPTY, DROP } from "./icons.js";
import { count, fmt, esc } from "./dom.js";
import { battery, tank, gauge, zoneChart, bars, RES } from "./charts.js";

export const hourLabel = (h) => `Jour ${Math.floor(h / 24) + 1}, ${String(h % 24).padStart(2, "0")} h`;
const card = (inner, cls = "", attrs = "") => `<section class="card ${cls}" ${attrs}>${inner}</section>`;
const head = (title, sub, ic, tone = "") =>
  `<div class="card-h"><span class="chip ${tone}">${icon(ic)}</span><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}</div></div>`;
const empty = (title, text) => `<div class="empty">${EMPTY}<b>${title}</b><span>${text}</span></div>`;
const kpi = (label, ic, tone, value, foot, cls) =>
  card(`<div class="top-row"><span class="lbl">${label}</span><span class="chip ${tone}">${icon(ic)}</span></div>${value}${foot ? `<small>${foot}</small>` : ""}`, `kpi ${cls}`);
const signed = (v) => (v > 0.05 ? `+${fmt(v)}` : v < -0.05 ? `−${fmt(-v)}` : "0");
const PRIO = { 1: "Eau potable et bétail", 2: "Cultures fragiles", 3: "Arbres" };

export function skeleton() {
  return `<div class="grid g-hero"><div class="sk" style="--i:0;min-height:320px"></div><div class="sk" style="--i:1;min-height:320px"></div></div>
  <div class="grid g-kpi">${[2, 3, 4, 5].map((i) => `<div class="sk" style="--i:${i}"></div>`).join("")}</div>
  <div class="sk" style="--i:6;min-height:180px"></div>`;
}

export function errorView(msg) {
  return card(`${head("Données indisponibles", "Le serveur n'a pas répondu.", "alert", "b")}<p class="note">${esc(msg)}</p>`, "err");
}

function decisions(c) {
  const s = c.s;
  const rows = [
    ...s.log.map(([id, kind, m3]) => {
      const [ic, tone, tag] = kind.startsWith("secours") ? ["sun", "e", "p2"] : kind.includes("rembours") ? ["swap", "a", "p3"] : ["pump", "", "w"];
      return `<div class="li" data-key="log-${id}"><span class="chip ${tone}">${icon(ic)}</span><div class="grow"><b>${c.name(id)}</b><span class="meta">${kind}</span></div><span class="tag ${tag}">+${fmt(m3)} m³</span></div>`;
    }),
    ...s.trades.map((t) => `<div class="li" data-key="t-${t.debt}"><span class="chip">${icon("swap")}</span><div class="grow"><b>${c.name(t.from)} → ${c.name(t.to)}</b><span class="meta">Échange × ${fmt(t.rate, 2)} · ${fmt(t.due_m3)} m³ à rendre</span></div><span class="tag w">${fmt(t.m3)} m³</span></div>`),
    ...s.repayments.map((r, i) => `<div class="li" data-key="r-${r.debt}-${i}"><span class="chip a">${icon("check")}</span><div class="grow"><b>${c.name(r.from)} → ${c.name(r.to)}</b><span class="meta">Remboursement en eau</span></div><span class="tag p3">${fmt(r.m3)} m³</span></div>`),
  ];
  return rows.length ? `<div class="list">${rows.join("")}</div>` : empty("Aucune action", `Les cuves tiennent. La réserve de ${RES} % est conservée.`);
}

export function overview(c) {
  const { s, b } = c;
  const dry = Object.keys(s.dry).length;
  return `<div class="grid g-hero">
    ${card(`${head("Batterie virtuelle de la zone", "Toutes les cuves réunies", "battery")}<div class="battery">${battery(s.stock_pct, "Stock d'eau de la zone")}<p class="note">Sans plateforme : <b>${fmt(b.stock_pct, 0)} %</b></p></div>`)}
    ${card(`${head("Niveau de la zone sur 72 h", "Les coupures sont en orange", "trend")}${zoneChart(c.sim, c.h, c.w("zone"))}`)}
  </div>
  <div class="grid g-kpi">
    ${kpi("Autonomie de la zone", "hourglass", "", `<div class="num">${count(s.autonomy, 1)}<span class="u">h</span></div>`, `sans plateforme : ${fmt(b.autonomy)} h`, "w")}
    ${kpi("Risque de coupure", "bolt", "e", gauge(s.risk, s.risk_label), "", "")}
    ${kpi("Fermes à sec", "alert", dry ? "b" : "a", `<div class="num">${count(dry)}</div>`, `sans plateforme : ${Object.keys(b.dry).length}`, dry ? "b" : "a")}
    ${kpi("Échanges cette heure", "swap", "a", `<div class="num">${count(s.trades.length)}</div>`, `${s.repayments.length} remboursement${s.repayments.length > 1 ? "s" : ""}`, "a")}
  </div>
  ${card(`${head("Décisions de l'heure", "Ce que Sakia commande", "pump")}${decisions(c)}`)}`;
}

export function farms(c) {
  const { s, b } = c;
  const list = c.sim.farms.map((f) => {
    const lv = s.levels[f.id], dry = !!s.dry[f.id];
    return card(`${tank(lv, f.name)}<div class="body-t"><h3>${f.name}</h3><p>${f.crop}</p>
      <span class="tag p${f.priority}">Priorité ${f.priority}</span>${dry ? `<span class="tag dry">${icon("alert", "i-sm")}À sec</span>` : ""}
      <div class="lv"><b>${count(lv)}%</b><span>avec Sakia · ${b.levels[f.id]} % sans · ${f.cap} m³</span></div></div>`, `farm hov ${dry ? "is-dry" : ""}`, `data-key="${f.id}"`);
  });
  return `<div class="grid g-3">${list.join("")}</div>
  ${card(`${head("Priorités", "Quand l'énergie de secours manque, l'eau va d'abord aux usages vitaux.", "shield", "a")}<div class="list">${[1, 2, 3].map((p) => `<div class="li"><span class="tag p${p}">Priorité ${p}</span><span class="grow">${PRIO[p]}</span></div>`).join("")}</div>`)}`;
}

function debtsAt(sim, h) {
  const paid = {};
  sim.platform.repayments.filter((r) => r.hour <= h).forEach((r) => (paid[r.debt] = (paid[r.debt] || 0) + r.m3));
  return sim.platform.ledger.filter((d) => d.hour <= h).map((d) => {
    const left = Math.max(0, d.due_m3 - (paid[d.id] || 0));
    const late = d.closed !== null && d.closed <= h ? d.closed > d.due_hour : h > d.due_hour;
    const status = left <= 0.05 ? (late ? "rendue en retard" : "rendue") : late ? "en retard" : "à rendre";
    return { ...d, left, status };
  });
}
const ST = { rendue: "p3", "rendue en retard": "p2", "à rendre": "w", "en retard": "p1" };
const URG = { "élevée": "p1", moyenne: "p2", faible: "p3" };

const pipe = (back) => `<div class="pipe ${back ? "back" : ""}" aria-hidden="true">${[0, 1, 2].map(() => `<span class="lane"><span class="drop">${DROP}</span></span>`).join("")}</div>`;

function flows(c) {
  const { s } = c;
  const t = s.trades.map((x) => `<div class="trade" data-key="ft-${x.debt}"><div class="end">${c.name(x.from)}<small>prête</small></div><div>${pipe(false)}<div class="pipe-lbl"><b>${fmt(x.m3)} m³</b> · × ${fmt(x.rate, 2)}</div></div><div class="end">${c.name(x.to)}<small>rendra ${fmt(x.due_m3)} m³</small></div></div>`);
  const r = s.repayments.map((x, i) => `<div class="trade" data-key="fr-${x.debt}-${i}"><div class="end">${c.name(x.from)}<small>rembourse</small></div><div>${pipe(true)}<div class="pipe-lbl"><b>${fmt(x.m3)} m³</b> rendus</div></div><div class="end">${c.name(x.to)}<small>prêteur</small></div></div>`);
  if (t.length || r.length) return t.concat(r).join("");
  return s.grid
    ? empty("Marché fermé", "Le courant est là : chaque ferme pompe pour elle-même. Le marché ouvre pendant une coupure.")
    : empty("Pas d'échange cette heure", "Aucune ferme n'a de besoin qu'un prêt rentable puisse couvrir.");
}

export function market(c) {
  const { s, h, sim } = c;
  const debts = debtsAt(sim, h);
  const done = sim.platform.trades.filter((t) => t.hour <= h);
  const vol = done.reduce((a, t) => a + t.m3, 0);
  const rate = vol ? done.reduce((a, t) => a + t.m3 * t.rate, 0) / vol : 0;
  const closed = `<p class="note">Le marché ouvre pendant une coupure.</p>`;
  const offers = s.offers.map((o) => `<div class="li" data-key="o-${o.farm}"><div class="grow"><b>${c.name(o.farm)}</b><span class="meta">excédent après sa marge</span></div><span class="val">${fmt(o.m3)} m³</span><span class="tag p3">× ${fmt(o.rate, 2)}</span></div>`).join("");
  const demands = s.demands.map((d) => `<div class="li" data-key="d-${d.farm}"><div class="grow"><b>${c.name(d.farm)}</b><span class="meta">à sec dans ${fmt(d.hours_to_dry)} h</span></div><span class="val">${fmt(d.m3)} m³</span><span class="tag ${URG[d.urgency]}">${d.urgency}</span></div>`).join("");
  const refused = s.refused.map((r) => `<div class="an" data-key="x-${r.farm}"><span class="chip">${icon("ban")}</span><div><b>${c.name(r.farm)} · demande refusée</b><span>${r.reason}</span></div></div>`).join("");
  const ledger = debts.slice().reverse().map((d) => `<div class="li" data-key="l-${d.id}"><div class="grow"><b>${c.name(d.lender)} → ${c.name(d.borrower)}</b><span class="meta">${hourLabel(d.hour)} · reçu ${fmt(d.m3)} m³ · × ${fmt(d.rate, 2)}</span></div><span class="val">${fmt(d.due_m3)} m³</span><span class="tag ${ST[d.status]}">${d.status}</span></div>`).join("");
  const bal = {};
  sim.farms.forEach((f) => (bal[f.id] = debts.filter((d) => d.lender === f.id).reduce((a, d) => a + d.left, 0) - debts.filter((d) => d.borrower === f.id).reduce((a, d) => a + d.left, 0)));
  const maxBal = Math.max(1, ...Object.values(bal).map(Math.abs));
  const acc = sim.farms.map((f) => {
    const a = sim.accounts[f.id], v = bal[f.id], rel = s.reliability[f.id] ?? 1;
    const role = a.lent_m3 ? ["prêteur", "p3"] : a.borrowed_m3 ? ["emprunteur", "w"] : ["hors marché", ""];
    const color = rel >= 0.9 ? "var(--c-agri)" : rel >= 0.7 ? "var(--c-energy)" : "var(--c-bad)";
    return `<div class="acc" data-key="a-${f.id}"><div class="hd"><b>${f.name}</b><span class="tag ${role[1]}">${role[0]}</span>
      <span class="rel" title="Fiabilité">${icon("shield", "i-sm")}<span class="tr"><i style="transform:scaleX(${rel});background:${color}"></i></span>${Math.round(rel * 100)} %</span></div>
      <div class="row2"><div class="divb" role="img" aria-label="Solde du compte d'eau : ${signed(v)} m³"><i class="pos" style="transform:scaleX(${Math.max(0, v) / maxBal})"></i><i class="neg" style="transform:scaleX(${Math.max(0, -v) / maxBal})"></i></div>
      <span class="${v > 0.05 ? "gain" : v < -0.05 ? "loss" : "val"}">${signed(v)} m³</span></div>
      <div class="stats"><span>Gain net 72 h <b class="${a.net_gain_m3 > 0 ? "gain" : ""}">${a.net_gain_m3 > 0 ? "+" : ""}${fmt(a.net_gain_m3)} m³</b></span><span>Heures à sec évitées <b>${a.dry_hours_avoided} h</b></span><span>Prime ${a.premium_earned_m3 ? `gagnée <b>+${fmt(a.premium_earned_m3)} m³</b>` : a.premium_paid_m3 ? `payée <b>${fmt(a.premium_paid_m3)} m³</b>` : "<b>0</b>"}</span></div></div>`;
  }).join("");
  return `<div class="grid g-kpi">
    ${kpi("Eau échangée", "drop", "", `<div class="num">${count(vol, 1)}<span class="u">m³</span></div>`, "depuis le début", "w")}
    ${kpi("Échanges conclus", "swap", "a", `<div class="num">${count(done.length)}</div>`, "chacun avec une dette", "a")}
    ${kpi("Taux moyen", "scale", "e", `<div class="num">× ${count(rate, 2)}</div>`, "m³ rendus pour 1 m³ reçu", "e")}
    ${kpi("Règle", "shield", "", `<div class="num" style="font-size:var(--fs-md)">Eau contre eau</div>`, "aucun prix, aucune vente", "")}
  </div>
  ${card(`${head("Échanges de l'heure", "Donnant-donnant : chaque goutte prêtée revient avec une prime en eau.", "swap", "a")}${flows(c)}`)}
  <div class="grid g-2">
    ${card(`${head("Offres de prêt", "Une ferme prête seulement au-delà de ses besoins jusqu'à la fin de la coupure, plus 2 h de marge.", "farm", "a")}${s.grid ? closed : offers ? `<div class="list">${offers}</div>` : empty("Aucune offre", "Aucune ferme n'a d'excédent à cette heure.")}`)}
    ${card(`${head("Demandes", "Une ferme emprunte seulement si l'eau à rendre coûte moins que la perte évitée.", "alert", "e")}${s.grid ? closed : demands ? `<div class="list">${demands}</div>` : empty("Aucune demande", "Toutes les fermes couvrent leurs besoins.")}${refused}`)}
  </div>
  ${card(`${head("Compte d'eau", "Vert : on lui doit de l'eau. Rouge : elle doit de l'eau. Gain net et heures à sec évitées sur 72 h, comparés à la plateforme sans marché.", "scale")}<div class="list">${acc}</div>`)}
  ${card(`${head("Échanges conclus", "Chaque prêt crée une dette rendue en eau après la coupure, avant que l'emprunteur ne remplisse sa cuve au-delà de sa réserve.", "clock")}${ledger ? `<div class="list">${ledger}</div>` : empty("Aucun échange pour le moment", "Avancez le temps jusqu'à une coupure.")}`)}`;
}

const TIP = { sun: ["sun", "e"], tank: ["tank", ""], drop: ["drop", ""], bolt: ["bolt", "e"], leaf: ["leaf", "a"] };

export function analysis(c) {
  const d = c.an.data, an = c.an.anomalies;
  const fl = (m) => an.filter((a) => a.metric === m).map((a) => a.index);
  const anomalies = an.map((a, i) => `<div class="an" data-key="an-${i}"><span class="chip">${icon(a.metric === "Débit nocturne" ? "moon" : a.metric === "Eau" ? "drop" : "bolt")}</span><div><b>${a.type} · ${a.month}</b><span>${a.metric} : ${fmt(a.value, 0)} ${a.unit} (× ${fmt(a.ratio, 2)}). ${a.cause}.</span></div></div>`).join("");
  return `<div class="grid g-2">
    ${card(`${head("Électricité par mois", "kWh · rouge = anormal", "bolt", "e")}${bars({ key: "elec", vals: d.electricity_kwh, months: d.months, kind: "e", flags: fl("Électricité"), W: c.w("elec"), unit: "kWh", label: "Consommation électrique mensuelle en kWh" })}`)}
    ${card(`${head("Eau par mois", "m³ · rouge = anormal", "drop")}${bars({ key: "water", vals: d.water_m3, months: d.months, kind: "", flags: fl("Eau"), W: c.w("water"), unit: "m³", label: "Consommation d'eau mensuelle en mètres cubes" })}`)}
  </div>
  <div class="grid g-2">
    ${card(`${head("Eau consommée la nuit", "% entre 0 h et 5 h · au-dessus de 15 %, fuite probable", "moon", "a")}${bars({ key: "night", vals: d.night_flow_pct, months: d.months, kind: "a", flags: fl("Débit nocturne"), W: c.w("night"), unit: "%", thr: 15, label: "Part de l'eau consommée la nuit, en pourcentage" })}`)}
    ${card(`${head("Anomalies détectées", "Chaque mois comparé à ses voisins", "alert", "b")}${anomalies || empty("Aucune anomalie", "Les consommations restent régulières.")}<p class="note">Économie possible : environ <b>${fmt(c.an.potential.kwh, 0)} kWh</b> et <b>${fmt(c.an.potential.m3, 0)} m³</b> par an.</p>`)}
  </div>
  ${card(`${head("Comment économiser la batterie virtuelle", "Conseils selon les anomalies", "leaf", "a")}<div class="tips">${c.an.tips.map((t) => `<div class="tip"><span class="chip ${TIP[t.icon][1]}">${icon(TIP[t.icon][0])}</span><b>${t.title}</b><p>${t.text}</p></div>`).join("")}</div>`)}`;
}

export function alerts(c) {
  const list = c.sim.alerts.filter((a) => a.hour <= c.h).reverse();
  if (!list.length) return card(`${head("Alertes envoyées aux agriculteurs", "WhatsApp et SMS, en français et en arabe tunisien", "bell")}${empty("Aucune alerte pour le moment", "Avancez le temps : Sakia prévient avant chaque coupure.")}`);
  let day = null;
  const items = list.map((a) => {
    const d = Math.floor(a.hour / 24) + 1;
    const sep = d !== day ? `<div class="day-sep" data-key="day-${d}">Jour ${d}</div>` : "";
    day = d;
    const sms = a.channel === "SMS";
    const tone = a.level === "élevé" ? "p1" : a.level === "moyen" ? "p2" : "p3";
    return `${sep}<div class="msg ${sms ? "sms" : ""}" data-key="m-${a.hour}-${a.channel}"><span class="av" aria-hidden="true">${icon(sms ? "msg" : "chat", "i-sm")}</span><div class="bubble"><b>${a.channel}<span class="tag ${tone}">risque ${a.level}</span></b>${a.text}<time>${String(a.hour % 24).padStart(2, "0")} h 00</time></div></div>`;
  }).join("");
  return card(`${head("Alertes envoyées aux agriculteurs", "WhatsApp et SMS, en français et en arabe tunisien", "bell")}<div class="feed" role="log" aria-label="Fil des alertes">${items}</div>`);
}

export function impact(c) {
  const i = c.sim.impact;
  const cmp = (label, rows, unit) => {
    const m = Math.max(...rows.map((r) => r[1]), 1);
    return `<div class="cmpbar"><div class="hd"><b>${label}</b></div>${rows.map(([name, v, cls]) => `<div class="lg"><span>${name}</span><span><b>${fmt(v, unit === "h" ? 0 : 1)} ${unit}</b></span></div><div class="track" role="img" aria-label="${name} : ${fmt(v, 1)} ${unit}"><i class="${cls}" style="transform:scaleX(${v / m})"></i></div>`).join("")}</div>`;
  };
  return `${card(`<h2>Avec Sakia, ${count(i.reduction_pct)} % d'eau manquante en moins</h2><p class="sub">Simulation : même canicule, mêmes coupures, 8 fermes, 72 h</p><div class="num">${count(i.saved_m3, 1)}<span class="u" style="color:inherit">m³</span></div><p class="sub">d'eau manquante évitée pour la zone</p>`, "hero")}
  <div class="grid g-kpi">
    ${kpi("Heures à sec, sans plateforme", "alert", "b", `<div class="num">${count(i.dry_hours_without)}</div>`, "", "b")}
    ${kpi("Sakia sans marché", "battery", "e", `<div class="num">${count(i.dry_hours_no_market)}</div>`, "heures à sec", "e")}
    ${kpi("Sakia + marché", "check", "a", `<div class="num">${count(i.dry_hours_with)}</div>`, "heures à sec", "a")}
    ${kpi("Eau échangée", "swap", "", `<div class="num">${count(i.traded_m3, 1)}<span class="u">m³</span></div>`, `${i.trades} échanges, × ${fmt(i.avg_rate, 2)} en moyenne`, "w")}
  </div>
  ${card(`${head("Avec et sans plateforme", "Même scénario, trois façons de gérer l'eau", "chart")}<div class="cmp">
    ${cmp("Eau manquante", [["Sans plateforme", i.unmet_without, "r"], ["Sakia sans marché", i.unmet_no_market, "o"], ["Sakia + marché", i.unmet_with, "g"]], "m³")}
    ${cmp("Heures à sec", [["Sans plateforme", i.dry_hours_without, "r"], ["Sakia sans marché", i.dry_hours_no_market, "o"], ["Sakia + marché", i.dry_hours_with, "g"]], "h")}
  </div>
  <p class="note" style="margin-top:var(--sp-4)">Le marché évite ${fmt(i.market_saved_m3)} m³ d'eau manquante par rapport à Sakia sans échange. ${fmt(i.repaid_m3)} m³ ont été rendus après les coupures.</p>
  <p class="note">Chiffres issus de la simulation, pas de mesures réelles. Sans plateforme : une pompe qui démarre seulement sous 30 % de remplissage.</p>`)}`;
}
