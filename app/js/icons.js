const P = {
  gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4.5-5"/><circle cx="12" cy="16" r="1.3"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4.2 3-6.5 7.5-6.5 0 4.2-3 6.5-7.5 6.5Z"/><path d="M12 15.5c0-3.3-2.4-5.5-6.5-5.5 0 3.3 2.4 5.5 6.5 5.5Z"/><path d="M6 21h12"/>',
  swap: '<path d="M4 8h14"/><path d="M14.5 4.5 18 8l-3.5 3.5"/><path d="M20 16H6"/><path d="M9.5 12.5 6 16l3.5 3.5"/>',
  chart: '<path d="M4 20h16"/><path d="M6.5 16v-5"/><path d="M11 16V6"/><path d="M15.5 16v-7"/><path d="M20 16v-3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  trend: '<path d="M3 17l6-6 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.6A8 8 0 1 1 9.4 4a6.4 6.4 0 0 0 10.6 10.6Z"/>',
  thermo: '<path d="M10 14.3V5a2 2 0 1 1 4 0v9.3a4 4 0 1 1-4 0Z"/><path d="M12 10v7"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z"/>',
  drop: '<path d="M12 3s-6.5 7-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 10 12 3 12 3Z"/>',
  tank: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><path d="M5 12.5h14"/><path d="M9 2.5h6"/>',
  leaf: '<path d="M5 19.5c0-8.5 5.5-14.5 15-14.5 0 9.5-6 14.5-14 14.5"/><path d="M5 19.5l8.5-8.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><path d="M12 17.4v.1"/>',
  chat: '<path d="M4 20l1.3-3.8A8.2 8.2 0 1 1 8 18.9L4 20Z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/>',
  msg: '<rect x="3" y="4.5" width="18" height="13" rx="3"/><path d="M8 17.5 7 21l4.5-3.5"/><path d="M7.5 9.5h9M7.5 13h6"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  pump: '<path d="M12 20V8"/><path d="M7.5 12.5 12 8l4.5 4.5"/><path d="M5 4h14"/>',
  shield: '<path d="M12 3 20 6v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6Z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M21.5 10.5v3"/><path d="M6.5 10v4M10 10v4M13.5 10v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 18 18 6"/>',
  hourglass: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 4.5 8 5 8 9s-8 4.5-8 9"/><path d="M16 3c0 4.5-8 5-8 9s8 4.5 8 9"/>',
  farm: '<path d="M3.5 20.5V10L12 4l8.5 6v10.5"/><path d="M9 20.5v-6h6v6"/><path d="M3.5 20.5h17"/>',
  scale: '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M5 7h14"/><path d="M5 7 2.5 13a3 3 0 0 0 5 0L5 7ZM19 7l-2.5 6a3 3 0 0 0 5 0L19 7Z"/>',
};

const FILLED = {
  play: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2Z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
};

export const icon = (name, cls = "") =>
  FILLED[name]
    ? `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${FILLED[name]}</svg>`
    : `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;

export const DROP = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8S2 5 2 7.6a4 4 0 0 0 8 0C10 5 6 .8 6 .8Z"/></svg>';

export const EMPTY = `<svg viewBox="0 0 84 84" aria-hidden="true"><circle class="e-ring" cx="42" cy="44" r="34"/><path class="e-drop" d="M42 18s-14 15-14 25a14 14 0 0 0 28 0c0-10-14-25-14-25Z"/><path d="M36 46a6 6 0 0 0 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/></svg>`;
