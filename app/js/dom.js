export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const fmt = (v, d = 1) =>
  Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

function parse(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
}

const same = (a, b) =>
  a.nodeType === b.nodeType && a.nodeName === b.nodeName &&
  (a.nodeType !== 1 || a.getAttribute("data-key") === b.getAttribute("data-key"));

function patchChildren(a, b) {
  const ac = [...a.childNodes];
  const bc = [...b.childNodes];
  bc.forEach((n, i) => {
    const o = ac[i];
    if (!o) a.appendChild(n);
    else if (!same(o, n)) a.replaceChild(n, o);
    else patch(o, n);
  });
  for (let i = bc.length; i < ac.length; i++) ac[i].remove();
}

function patch(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  if (a.hasAttribute("data-count")) return;
  patchChildren(a, b);
}

// Met à jour le DOM existant au lieu de le remplacer : les transitions CSS continuent.
export function morph(el, html) {
  patchChildren(el, parse(html));
}

export function counters(root) {
  for (const el of root.querySelectorAll("[data-count]")) {
    const to = +el.dataset.count;
    const d = +(el.dataset.dec || 0);
    const from = el._cur ?? 0;
    if (el._to === to) continue;
    el._to = to;
    cancelAnimationFrame(el._raf);
    if (reduced() || from === to) {
      el._cur = to;
      el.textContent = fmt(to, d);
      continue;
    }
    el.textContent = fmt(from, d);
    const t0 = performance.now();
    const dur = +(el.dataset.dur || 800);
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el._cur = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(el._cur, d);
      if (k < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  }
}

export const count = (v, d = 0, cls = "") =>
  `<span class="${cls}" data-count="${v}" data-dec="${d}">${fmt(v, d)}</span>`;
