// Helper umum: DOM, penyimpanan, API, jembatan Capacitor.
export const $ = (s, r = document) => r.querySelector(s);
export const bus = new EventTarget();
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
export const on = (n, f) => bus.addEventListener(n, (e) => f(e.detail));

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" || k.startsWith("aria-") || k === "role" || k === "referrerpolicy") el.setAttribute(k, v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

const ICONS = {
  home: "M12 3 3 10v10h6v-6h6v6h6V10z",
  music: "M12 3v10.6A4 4 0 1 0 14 17V7h4V3z",
  compass: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4 6-2 6-6 2 2-6z",
  lib: "M4 4h3v16H4zm5 0h3v16H9zm5.5.5 2.8-.8 4 15.3-2.8.8z",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 5v-2l-2.2-.7-.5-1.2 1-2-1.4-1.4-2 1-1.2-.5L14 3h-2l-.7 2.2-1.2.5-2-1L6.700 6.100l1 2-.5 1.200L5 10v2l2.200.7.500 1.200-1 2L8.100 17.300l2-1 1.200.5L12 19h2l.7-2.200 1.200-.5 2 1 1.400-1.400-1-2 .5-1.200z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  next: "M6 6l9 6-9 6zm10 0h2v12h-2z",
  prev: "M18 6l-9 6 9 6zM6 6h2v12H6z",
  heart: "M12 21s-8-5.200-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 5.800-8 11-8 11z",
  more: "M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  down: "M11 3h2v10l3.500-3.500 1.400 1.400L12 16.800 6.100 10.900l1.400-1.400L11 13zM5 19h14v2H5z",
  close: "M6 6l12 12M18 6 6 18",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z",
  shuffle: "M16 3h5v5l-2-2-4 4-1.400-1.400L17.600 4.600zM3 7h3.500l8.500 10H21v2h-7L5.500 9H3zm0 10h3l2-2.400 1.400 1.600L7.500 19H3zm13-1 3-3 2 2v5h-5l2-2z",
  moon: "M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z",
  list: "M4 6h12v2H4zm0 5h12v2H4zm0 5h8v2H4zm13-5v5.500a2.500 2.500 0 1 0 2 2.400V13h3v-2z",
  speed: "M12 4a9 9 0 0 0-9 9c0 2 .7 3.800 1.800 5.300h3.300L12 10l1.400 1.400-4 6.900h9.800A9 9 0 0 0 12 4z",
  lyric: "M4 4h16v12H8l-4 4zm3 4v2h10V8zm0 3v2h7v-2z",
  share: "M18 16a3 3 0 0 0-2.200 1l-6.700-3.800L9 13l6.800-3.900A3 3 0 1 0 15 7l-6.800 3.900a3 3 0 1 0 0 2.200L15 17a3 3 0 1 0 3-1z",
};
export const icon = (n, size) =>
  h("span", { class: "i", "aria-hidden": "true", style: size ? `width:${size}px;height:${size}px` : null, html: null }, (() => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[n] || "");
    if (n === "close") { p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2.200"); p.setAttribute("stroke-linecap", "round"); }
    s.append(p);
    return s;
  })());

export const store = {
  get(k, d) { try { const v = localStorage.getItem("kn:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kn:" + k, JSON.stringify(v)); } catch {} emit("store", k); },
};

export const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), r = String(s % 60).padStart(2, "0");
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${r}` : `${m}:${r}`;
};
export const safeName = (s) => String(s || "file").replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "file";

let toastTimer;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---- Capacitor ----
export const cap = () => window.Capacitor || null;
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
const _plugins = {};
// Tanpa bundler, plugin harus didaftarkan lewat registerPlugin agar terhubung ke sisi native.
export function plugin(n) {
  if (!isNative()) return null;
  return _plugins[n] || (_plugins[n] = cap().Plugins?.[n] || cap().registerPlugin(n));
}
export const kanade = () => plugin("Kanade");
export const fileSrc = (path) => (isNative() ? cap().convertFileSrc(path) : path);

export async function readClipboard() {
  try {
    const c = plugin("Clipboard");
    if (c) return (await c.read()).value || "";
    return isNative() ? "" : await navigator.clipboard.readText();
  } catch { return ""; }
}
export const tap = () => { try { plugin("Haptics")?.impact({ style: "LIGHT" }); } catch {} };
export async function share(opts) {
  const s = plugin("Share");
  if (s) return s.share(opts);
  if (navigator.share) return navigator.share(opts);
  await navigator.clipboard?.writeText(opts.url || opts.text || "");
  toast("Tautan disalin");
}

// ---- API (Vercel) ----
export const apiBase = () => String(store.get("apiBase", "") || window.KANADE_API || "").replace(/\/+$/, "");
export async function api(name, params = {}) {
  const base = apiBase();
  if (!base && isNative()) throw new Error("Isi alamat server Vercel di Setelan dulu");
  const u = new URL(`${base}/api/${name}`, location.origin);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  let r, j;
  try { r = await fetch(u); } catch { throw new Error("Tidak bisa terhubung ke server. Cek internet atau alamat server."); }
  try { j = await r.json(); } catch { throw new Error(`Respons server tidak valid (${r.status})`); }
  if (!j.ok) throw new Error(j.error || "Permintaan gagal");
  return j.data;
}
