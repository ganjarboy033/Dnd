// Pemutar musik: antrean, shuffle/repeat, kecepatan, sleep timer, lirik, Media Session.
import { api, emit, store, toast, fileSrc, kanade } from "./lib.js";
import { getFiles } from "./dl.js";

const audio = new Audio();
audio.preload = "auto";
audio.setAttribute("playsinline", "");

export const P = {
  queue: store.get("queue", []),
  index: store.get("qindex", -1),
  repeat: store.get("repeat", "off"), // off | all | one
  shuffle: store.get("shuffle", false),
  speed: 1,
  sleepAt: 0,
  loading: false,
  lyrics: null,
};
export const el = audio;
const cache = new Map(); // key -> src
let sleepTimer = null;
let seq = 0;

export const current = () => P.queue[P.index] || null;
const key = (t) => t.id || t.url;
const persist = () => { store.set("queue", P.queue.slice(0, 300)); store.set("qindex", P.index); };

async function sourceFor(t) {
  if (t.src) return t.src;
  const local = getFiles().find((f) => f.type === "audio" && f.id === t.fileId);
  if (local && local.path) return fileSrc(local.path);
  if (cache.has(key(t))) return cache.get(key(t));
  const r = await api("resolve", { url: t.url, mode: "audio" });
  const d = r.downloads.find((x) => x.type === "audio") || r.downloads[0];
  if (!d) throw new Error("Tidak ada stream audio");
  cache.set(key(t), d.url);
  return d.url;
}

async function load(i, autoplay = true) {
  if (i < 0 || i >= P.queue.length) return;
  const my = ++seq;
  P.index = i;
  P.loading = true;
  P.lyrics = null;
  persist();
  emit("player");
  const t = P.queue[i];
  try {
    const src = await sourceFor(t);
    if (my !== seq) return;
    audio.src = src;
    audio.playbackRate = P.speed;
    if (autoplay) await audio.play();
    P.loading = false;
    session(t);
    fetchLyrics(t, my);
    // siapkan lagu berikutnya di belakang layar
    const nx = P.queue[nextIndex(true)];
    if (nx && !nx.src) sourceFor(nx).catch(() => {});
  } catch (e) {
    if (my !== seq) return;
    P.loading = false;
    toast(e.message || "Gagal memutar");
    emit("player");
    if (P.queue.length > 1 && i < P.queue.length - 1) setTimeout(() => next(), 800);
  }
}

export function playQueue(list, i = 0) { P.queue = list.slice(); load(i); }
export function enqueue(t, playNext = false) {
  if (P.index < 0 || !P.queue.length) return playQueue([t], 0);
  P.queue.splice(playNext ? P.index + 1 : P.queue.length, 0, t);
  persist(); emit("player");
  toast(playNext ? "Diputar berikutnya" : "Masuk antrean");
}
export function removeAt(i) {
  if (i === P.index) return;
  P.queue.splice(i, 1);
  if (i < P.index) P.index--;
  persist(); emit("player");
}
export const jump = (i) => load(i);

function nextIndex(peek = false) {
  const n = P.queue.length;
  if (!n) return -1;
  if (P.shuffle && n > 1) {
    let r;
    do r = Math.floor(Math.random() * n); while (r === P.index);
    return r;
  }
  const i = P.index + 1;
  if (i < n) return i;
  return P.repeat === "all" || peek ? 0 : -1;
}
export function next() { const i = nextIndex(); if (i >= 0) load(i); else { audio.pause(); emit("player"); } }
export function prev() {
  if (audio.currentTime > 4 || P.index <= 0) { audio.currentTime = 0; return; }
  load(P.index - 1);
}
export function toggle() {
  if (!current()) return;
  if (!audio.src) return load(P.index);
  audio.paused ? audio.play() : audio.pause();
}
export const seek = (s) => { audio.currentTime = s; };
export function cycleRepeat() { P.repeat = { off: "all", all: "one", one: "off" }[P.repeat]; store.set("repeat", P.repeat); emit("player"); }
export function toggleShuffle() { P.shuffle = !P.shuffle; store.set("shuffle", P.shuffle); emit("player"); }
export function cycleSpeed() {
  const s = [1, 1.25, 1.5, 2, 0.75];
  P.speed = s[(s.indexOf(P.speed) + 1) % s.length];
  audio.playbackRate = P.speed;
  emit("player");
}
export function setSleep(min) {
  clearTimeout(sleepTimer);
  P.sleepAt = min ? Date.now() + min * 60000 : 0;
  if (min) sleepTimer = setTimeout(() => { audio.pause(); P.sleepAt = 0; emit("player"); toast("Sleep timer: musik dihentikan"); }, min * 60000);
  emit("player");
  toast(min ? `Berhenti otomatis dalam ${min} menit` : "Sleep timer dimatikan");
}

audio.addEventListener("ended", () => (P.repeat === "one" ? ((audio.currentTime = 0), audio.play()) : next()));
audio.addEventListener("play", () => emit("player"));
audio.addEventListener("pause", () => emit("player"));
audio.addEventListener("timeupdate", () => emit("tick"));
audio.addEventListener("error", () => { if (audio.src) { P.loading = false; emit("player"); } });

// ---- Media Session (kontrol layar kunci di browser; di WebView Android perlu plugin native, lihat README) ----
function session(t) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.author || "",
    artwork: t.thumbnail ? [{ src: t.thumbnail, sizes: "320x180", type: "image/jpeg" }] : [],
  });
  const m = navigator.mediaSession;
  m.setActionHandler("play", () => audio.play());
  m.setActionHandler("pause", () => audio.pause());
  m.setActionHandler("previoustrack", prev);
  m.setActionHandler("nexttrack", next);
  m.setActionHandler("seekto", (e) => seek(e.seekTime));
}

// ---- Notifikasi media native (plugin Kanade): lock screen, tombol notifikasi, audio hidup saat layar mati ----
const K = kanade();
function syncNative() {
  const t = current();
  if (!K || !t) return;
  K.updateMedia({
    title: t.title, artist: t.author || "", artwork: t.thumbnail || "",
    playing: !audio.paused, position: audio.currentTime || 0, duration: audio.duration || t.duration || 0, speed: P.speed,
  }).catch(() => {});
}
if (K) {
  ["play", "pause", "loadedmetadata", "seeked", "ratechange"].forEach((ev) => audio.addEventListener(ev, syncNative));
  K.addListener("mediaAction", (e) => {
    if (e.action === "play") audio.play();
    else if (e.action === "pause") audio.pause();
    else if (e.action === "next") next();
    else if (e.action === "prev") prev();
    else if (e.action === "seek") seek(e.seek);
  });
}

// ---- Lirik dari LRCLIB (sinkron bila tersedia) ----
async function fetchLyrics(t, my) {
  try {
    const clean = (s) => String(s || "").replace(/\(.*?\)|\[.*?\]|official|video|lyrics?|audio|mv/gi, " ").replace(/\s+/g, " ").trim();
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean(t.title) + " " + clean(t.author))}`);
    const list = await r.json();
    if (my !== seq) return;
    const hit = list.find((x) => x.syncedLyrics) || list.find((x) => x.plainLyrics);
    if (!hit) { P.lyrics = { none: true }; return emit("player"); }
    if (hit.syncedLyrics) {
      P.lyrics = {
        synced: hit.syncedLyrics.split("\n").map((l) => {
          const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
          return m ? { t: +m[1] * 60 + +m[2], text: m[3] } : null;
        }).filter(Boolean),
      };
    } else P.lyrics = { plain: hit.plainLyrics };
    emit("player");
  } catch { if (my === seq) { P.lyrics = { none: true }; emit("player"); } }
}

// ---- Perpustakaan sederhana: suka & playlist ----
export const liked = () => store.get("liked", []);
export const isLiked = (t) => liked().some((x) => key(x) === key(t));
export function toggleLike(t) {
  const l = liked();
  const i = l.findIndex((x) => key(x) === key(t));
  if (i >= 0) l.splice(i, 1); else l.unshift(strip(t));
  store.set("liked", l);
  emit("player");
}
export const playlists = () => store.get("playlists", []);
export function addToPlaylist(pid, t) {
  const all = playlists();
  const p = all.find((x) => x.id === pid);
  if (!p) return;
  if (!p.tracks.some((x) => key(x) === key(t))) p.tracks.push(strip(t));
  store.set("playlists", all);
  toast(`Ditambahkan ke ${p.name}`);
}
export function newPlaylist(name) {
  const all = playlists();
  const p = { id: crypto.randomUUID(), name: name.trim() || "Playlist baru", tracks: [] };
  all.push(p);
  store.set("playlists", all);
  return p;
}
export const strip = (t) => ({ id: t.id, url: t.url, title: t.title, author: t.author, thumbnail: t.thumbnail, duration: t.duration, fileId: t.fileId });
export const trackKey = key;
