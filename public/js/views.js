import { h, icon, store, fmt, toast, api, share, tap, readClipboard, isNative, fileSrc, plugin, apiBase, on, bus } from "./lib.js";
import { download, activeTasks, getFiles, removeFile } from "./dl.js";
import * as pl from "./player.js";

// ---------- lapisan (sheet / layar penuh) ----------
const stack = [];
function layer(cls, node, onclose) {
  const root = h("div", { class: "layer " + cls }, node);
  const api_ = { root, close() { const i = stack.indexOf(api_); if (i >= 0) stack.splice(i, 1); root.remove(); onclose && onclose(); } };
  if (cls.includes("scrim")) root.addEventListener("click", (e) => e.target === root && api_.close());
  document.getElementById("layers").append(root);
  stack.push(api_);
  return api_;
}
export const closeTop = () => (stack.length ? (stack[stack.length - 1].close(), true) : false);
const sheet = (title, ...kids) => layer("scrim", h("div", { class: "sheet", role: "dialog", "aria-label": title }, h("h3", {}, title), kids));
const full = (node, onclose) => layer("full", node, onclose);
const topbar = (title, l) => h("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:8px" },
  h("button", { class: "ico", "aria-label": "Tutup", onclick: () => l().close() }, icon("close")), h("h1", { style: "font-size:20px" }, title));
const item = (label, fn, ic) => h("button", { class: "item", onclick: fn }, ic ? icon(ic) : null, label);

async function into(box, fn, render) {
  box.replaceChildren(h("div", { class: "skel" }), h("div", { class: "skel" }), h("div", { class: "skel" }));
  try { box.replaceChildren(render(await fn())); }
  catch (e) { box.replaceChildren(h("div", { class: "err" }, e.message, h("br"), h("button", { class: "btn sm ghost", style: "margin-top:8px", onclick: () => into(box, fn, render) }, "Coba lagi"))); }
}
const empty = (t) => h("div", { class: "empty" }, t);
const toTrack = (x) => ({ id: x.id || x.url, url: x.url, title: x.title, author: x.author || "", thumbnail: x.thumbnail || "", duration: x.duration || 0 });

async function dlAudio(t) {
  try {
    toast("Menyiapkan MP3…");
    const r = await api("resolve", { url: t.url, mode: "audio" });
    const d = r.downloads.find((x) => x.type === "audio") || r.downloads[0];
    if (!d) throw new Error("Tidak ada audio");
    return download({ url: d.url, title: t.title, type: "audio", ext: "mp3", thumbnail: t.thumbnail, author: t.author, id: t.id });
  } catch (e) { toast(e.message); }
}

// ---------- baris lagu + menu ----------
export function trackMenu(t) {
  const s = sheet(t.title,
    item("Putar berikutnya", () => (s.close(), pl.enqueue(t, true)), "next"),
    item("Tambah ke antrean", () => (s.close(), pl.enqueue(t)), "list"),
    item(pl.isLiked(t) ? "Hapus dari Disukai" : "Suka", () => (s.close(), pl.toggleLike(t)), "heart"),
    item("Tambah ke playlist", () => (s.close(), pickPlaylist(t)), "lib"),
    item("Unduh MP3", () => (s.close(), dlAudio(t)), "down"),
    t.url ? item("Bagikan tautan", () => (s.close(), share({ title: t.title, url: t.url })), "share") : null);
}
function pickPlaylist(t) {
  const s = sheet("Tambah ke playlist",
    pl.playlists().map((p) => item(`${p.name} (${p.tracks.length})`, () => (s.close(), pl.addToPlaylist(p.id, t)))),
    item("Playlist baru…", () => { const n = prompt("Nama playlist"); if (n === null) return; const p = pl.newPlaylist(n); s.close(); pl.addToPlaylist(p.id, t); }));
}
function trackRow(t, list, i) {
  const cur = pl.current();
  return h("li", { class: "row" + (cur && pl.trackKey(cur) === pl.trackKey(t) ? " active" : "") },
    h("img", { src: t.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
    h("button", { class: "main", onclick: () => pl.playQueue(list, i) }, h("div", { class: "t1" }, t.title), h("div", { class: "t2" }, [t.author, t.duration ? fmt(t.duration) : ""].filter(Boolean).join(" • "))),
    h("button", { class: "ico", "aria-label": "Menu lagu", onclick: () => trackMenu(t) }, icon("more")));
}
const trackList = (list) => (list.length ? h("ul", {}, list.map((t, i) => trackRow(t, list, i))) : empty("Belum ada lagu."));

// ---------- BERANDA ----------
let lastClip = "";
let pending = null;
export const setPending = (u) => { pending = u; };
export function homeView() {
  const input = h("input", { type: "url", placeholder: "Tempel tautan TikTok, YouTube, Instagram, Spotify…", "aria-label": "Tautan", autocapitalize: "off" });
  const out = h("div");
  const go = () => {
    const url = input.value.trim();
    if (!url) return toast("Tempel tautan dulu");
    into(out, () => api("resolve", { url }), (d) => { addHistory(d, url); return resultCard(d); });
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  const view = h("div", {},
    h("h1", {}, "Simpan apa saja"), h("p", { class: "sub" }, "Video, foto, dan musik dari 20+ platform."),
    h("div", { class: "field" }, input, h("button", { class: "btn", onclick: go }, "Analisis")),
    h("div", { class: "chips" }, h("button", { class: "chip", onclick: async () => { const t = await readClipboard(); if (t) { input.value = t.trim(); go(); } else toast("Clipboard kosong"); } }, "Tempel dari clipboard")),
    out, h("h2", {}, "Riwayat"), historyList(input, go));
  if (pending) { input.value = pending; pending = null; setTimeout(go, 0); }
  else if (isNative()) readClipboard().then((t) => { t = (t || "").trim(); if (/^https?:\/\//i.test(t) && t !== lastClip) { lastClip = t; input.value = t; toast("Tautan dari clipboard terdeteksi"); } });
  return view;
}
function addHistory(d, url) {
  const hs = store.get("history", []).filter((x) => x.url !== url);
  hs.unshift({ url, title: d.title, thumbnail: d.thumbnail, platform: d.platform });
  store.set("history", hs.slice(0, 30));
}
function historyList(input, go) {
  const hs = store.get("history", []);
  if (!hs.length) return empty("Tautan yang kamu analisis muncul di sini.");
  return h("ul", {}, hs.slice(0, 8).map((x) => h("li", { class: "row" }, h("img", { src: x.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
    h("button", { class: "main", onclick: () => { input.value = x.url; go(); } }, h("div", { class: "t1" }, x.title), h("div", { class: "t2" }, x.platform)))));
}
const LABEL = { audio: "Audio", video: "Video", photo: "Foto", image: "Foto" };
function resultCard(d) {
  const card = h("div", { class: "card" });
  card.append(h("div", { class: "hero" }, h("img", { src: d.thumbnail, alt: "", referrerpolicy: "no-referrer" }),
    h("div", { style: "min-width:0" }, h("div", { class: "t1", style: "white-space:normal" }, d.title), h("div", { class: "t2" }, [d.author, d.platform].filter(Boolean).join(" • ")))));
  if (d.items && d.items.length) {
    const tracks = d.items.map(toTrack);
    card.append(h("div", { style: "display:flex;gap:8px;margin-top:12px" },
      h("button", { class: "btn sm", onclick: () => pl.playQueue(tracks, 0) }, icon("play", 18), "Putar semua"),
      h("button", { class: "btn sm ghost", onclick: async () => { toast(`Mengunduh ${tracks.length} lagu satu per satu`); for (const t of tracks) await dlAudio(t); } }, "Unduh semua MP3")),
      trackList(tracks));
    return card;
  }
  const photos = d.downloads.filter((x) => x.type === "photo" || x.type === "image");
  if (photos.length > 1) card.append(h("button", { class: "btn sm", style: "margin-top:12px", onclick: () => photos.forEach((p, i) => download({ url: p.url, title: `${d.title} ${i + 1}`, type: "photo", ext: p.ext, thumbnail: d.thumbnail })) }, `Unduh ${photos.length} foto`));
  if (!d.downloads.length) card.append(h("div", { class: "err" }, "Tidak ada file yang bisa diunduh dari tautan ini."));
  d.downloads.forEach((x, i) => card.append(h("div", { class: "opt" },
    h("div", { class: "main" }, h("span", { class: "tag" }, x.ext.toUpperCase()), LABEL[x.type] || x.type, x.quality ? " " + x.quality : "", photos.length > 1 && x.type === "photo" ? ` ${i + 1}` : ""),
    x.type === "audio" ? h("button", { class: "ico", "aria-label": "Putar", onclick: () => pl.playQueue([{ ...toTrack({ ...d, url: d.title }), id: "d" + i + d.title, src: x.url }], 0) }, icon("play")) : null,
    h("button", { class: "btn sm", onclick: () => download({ url: x.url, title: d.title + (x.quality ? " " + x.quality : ""), type: x.type, ext: x.ext, thumbnail: d.thumbnail, author: d.author }) }, "Unduh"))));
  return card;
}

// ---------- MUSIK ----------
const music = { q: "", res: null };
export function musicView() {
  const input = h("input", { type: "search", value: music.q, placeholder: "Cari lagu, artis, atau album", "aria-label": "Cari musik", enterkeyhint: "search" });
  const out = h("div");
  const search = (q) => {
    music.q = q = (q || input.value).trim(); input.value = q;
    if (!q) return;
    into(out, () => api("music", { q }), (r) => { music.res = r; return trackList(r.map((x) => ({ ...x, id: x.id }))); });
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && search());
  if (music.res) out.append(trackList(music.res));
  else out.append(empty("Cari lagu untuk mulai memutar. Hasil bisa diputar langsung, masuk antrean, atau diunduh jadi MP3."));
  return h("div", {}, h("h1", {}, "Musik"),
    h("div", { class: "field" }, input, h("button", { class: "btn", onclick: () => search() }, "Cari")),
    h("div", { class: "chips" }, ["Lagu Indonesia terbaru", "Lo-fi", "Anime OST", "Akustik", "Pop hits"].map((c) => h("button", { class: "chip", onclick: () => search(c) }, c))), out);
}

// ---------- JELAJAH (anime & komik) ----------
const SRC = { anime: ["otakudesu", "gogoanime"], comic: ["komiku", "komikindo", "asurascans"] };
const ex = { kind: "anime", source: { anime: "otakudesu", comic: "komiku" }, q: "", res: null };
export function exploreView() {
  const root = h("div");
  const draw = () => {
    const input = h("input", { type: "search", value: ex.q, placeholder: ex.kind === "anime" ? "Cari anime" : "Cari komik", "aria-label": "Cari" });
    const sel = h("select", { class: "select", style: "flex:none;width:120px", "aria-label": "Sumber", onchange: (e) => { ex.source[ex.kind] = e.target.value; } }, SRC[ex.kind].map((s) => h("option", { value: s, selected: s === ex.source[ex.kind] }, s)));
    const out = h("div");
    const search = () => {
      ex.q = input.value.trim(); if (!ex.q) return;
      const src = ex.source[ex.kind];
      into(out, () => api(ex.kind, { action: "search", q: ex.q, source: src }), (r) => {
        ex.res = r;
        return r.length ? h("div", { class: "grid" }, r.map((x) => h("button", { class: "tile", onclick: () => openDetail(x, src) }, h("img", { src: x.thumbnail || x.image || x.thumb || x.cover || "", alt: "", loading: "lazy", referrerpolicy: "no-referrer" }), h("div", { class: "t1" }, x.title)))) : empty("Tidak ada hasil.");
      });
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && search());
    root.replaceChildren(h("h1", {}, "Jelajah"),
      h("div", { class: "seg", role: "tablist" }, ["anime", "comic"].map((k) => h("button", { role: "tab", "aria-selected": String(ex.kind === k), onclick: () => { ex.kind = k; ex.res = null; draw(); } }, k === "anime" ? "Anime" : "Komik"))),
      h("div", { class: "field" }, input, sel), h("div", { class: "field" }, h("button", { class: "btn", style: "flex:1", onclick: search }, "Cari")), out);
  };
  draw();
  return root;
}
function openDetail(x, src) {
  const kind = ex.kind, box = h("div");
  const l = full(h("div", {}, topbar(x.title, () => l), box));
  const act = kind === "anime" ? "episodes" : "chapters";
  into(box, () => api(kind, { action: act, url: x.url, source: src }), (list) => list.length
    ? h("ul", {}, list.map((e, i) => h("li", {}, h("button", { class: "item", style: "border-bottom:1px solid var(--line)", onclick: () => (kind === "anime" ? openStream(e, src) : openReader(e, src)) }, e.title || `${kind === "anime" ? "Episode" : "Chapter"} ${i + 1}`))))
    : empty("Daftar kosong."));
}
function openStream(e, src) {
  const box = h("div"), s = sheet(e.title || "Episode", box);
  into(box, () => api("anime", { action: "stream", url: e.url, source: src }), (d) => h("div", {},
    d.downloads.length ? d.downloads.map((x) => h("div", { class: "opt" }, h("div", { class: "main" }, h("span", { class: "tag" }, x.ext.toUpperCase()), x.quality || "Video"),
      h("button", { class: "btn sm ghost", onclick: () => (s.close(), openVideo(x.url, d.title)) }, "Putar"),
      h("button", { class: "btn sm", style: "margin-left:6px", onclick: () => download({ url: x.url, title: d.title || e.title, type: "video", ext: x.ext, thumbnail: d.thumbnail }) }, "Unduh")))
      : empty("Tidak ada stream langsung. Coba sumber lain.")));
}
function openVideo(url, title) {
  const l = full(h("div", {}, topbar(title || "Video", () => l), h("video", { class: "player", src: url, controls: true, autoplay: true, playsInline: true })));
}
function openReader(c, src) {
  const box = h("div", { class: "reader" });
  const l = full(h("div", {}, topbar(c.title || "Chapter", () => l), box));
  into(box, () => api("comic", { action: "pages", url: c.url, source: src }), (d) => h("div", {}, d.downloads.map((p) => h("img", { src: p.url, loading: "lazy", alt: "", referrerpolicy: "no-referrer" }))));
}

// ---------- PUSTAKA ----------
let libTab = "liked";
export function libraryView() {
  const body = h("div");
  const draw = () => {
    const tabs = [["liked", "Disukai"], ["lists", "Playlist"], ["files", "Unduhan"], ["hist", "Riwayat"]];
    const view = { liked: likedTab, lists: listsTab, files: filesTab, hist: histTab }[libTab]();
    body.replaceChildren(h("h1", {}, "Pustaka"),
      h("div", { class: "seg", role: "tablist" }, tabs.map(([k, n]) => h("button", { role: "tab", "aria-selected": String(libTab === k), onclick: () => { libTab = k; draw(); } }, n))), h("div", { style: "margin-top:10px" }, view));
  };
  draw();
  return body;
}
function likedTab() {
  const l = pl.liked();
  return h("div", {}, l.length ? h("button", { class: "btn sm", onclick: () => pl.playQueue(l, 0) }, icon("play", 18), "Putar semua") : null, trackList(l));
}
function listsTab() {
  const all = pl.playlists();
  return h("div", {}, h("button", { class: "btn sm ghost", onclick: () => { const n = prompt("Nama playlist"); if (n !== null) { pl.newPlaylist(n); bus.dispatchEvent(new CustomEvent("store", { detail: "playlists" })); } } }, "Playlist baru"),
    all.length ? h("ul", {}, all.map((p) => h("li", { class: "row" }, h("button", { class: "main", onclick: () => { const l = full(h("div", {}, topbar(p.name, () => l), p.tracks.length ? h("button", { class: "btn sm", onclick: () => pl.playQueue(p.tracks, 0) }, "Putar semua") : null, trackList(p.tracks))); } }, h("div", { class: "t1" }, p.name), h("div", { class: "t2" }, `${p.tracks.length} lagu`))))) : empty("Belum ada playlist."));
}
function filesTab() {
  const files = getFiles(), act = activeTasks();
  const audio = files.filter((f) => f.type === "audio").map((f) => ({ id: f.id, fileId: f.id, title: f.title, author: f.author, thumbnail: f.thumbnail }));
  return h("div", {},
    act.map((t) => h("div", { class: "card", style: "margin-top:8px" }, h("div", { class: "t1" }, t.title), h("div", { class: "prog" }, h("i", { style: `width:${Math.round(t.progress * 100)}%` })), h("div", { class: "t2" }, t.state === "error" ? "Gagal: " + t.error : t.state === "done" ? "Selesai" : `${Math.round(t.progress * 100)}%`))),
    isNative() ? h("p", { class: "sub", style: "margin:10px 0" }, store.get("exportPublic", true) ? "Juga disalin ke Musik / Film / Gambar › Kanade" : "Disimpan di folder aplikasi saja") : null,
    files.length ? h("ul", {}, files.map((f) => h("li", { class: "row" }, h("img", { src: f.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
      h("button", { class: "main", onclick: () => openFile(f, audio) }, h("div", { class: "t1" }, f.title), h("div", { class: "t2" }, `${LABEL[f.type] || f.type} • ${f.ext.toUpperCase()}`)),
      h("button", { class: "ico", "aria-label": "Menu file", onclick: () => { const s = sheet(f.title, f.path ? item("Bagikan / simpan ke…", () => (s.close(), plugin("Share") && plugin("Share").share({ title: f.title, files: [f.path.startsWith("file://") ? f.path : "file://" + f.path] })), "share") : null, item("Hapus", async () => { s.close(); await removeFile(f); }, "close")); } }, icon("more"))))) : empty("Belum ada unduhan."));
}
function openFile(f, audio) {
  if (f.type === "audio") return pl.playQueue(audio, Math.max(0, audio.findIndex((a) => a.id === f.id)));
  const src = f.path ? fileSrc(f.path) : "";
  if (!src) return toast("File tersimpan di folder Unduhan perangkat");
  if (f.type === "video") return openVideo(src, f.title);
  const l = full(h("div", {}, topbar(f.title, () => l), h("img", { src, alt: f.title, style: "width:100%;border-radius:12px" })));
}
function histTab() {
  const hs = store.get("history", []);
  return hs.length ? h("div", {}, h("button", { class: "btn sm ghost", onclick: () => { store.set("history", []); } }, "Bersihkan"), h("ul", {}, hs.map((x) => h("li", { class: "row" }, h("img", { src: x.thumbnail, alt: "", referrerpolicy: "no-referrer" }), h("div", { class: "main" }, h("div", { class: "t1" }, x.title), h("div", { class: "t2" }, x.url)))))) : empty("Riwayat kosong.");
}

// ---------- SETELAN ----------
export function settingsView() {
  const url = h("input", { type: "url", value: store.get("apiBase", ""), placeholder: "https://proyek-kamu.vercel.app", autocapitalize: "off" });
  const theme = h("select", { class: "select", onchange: (e) => { store.set("theme", e.target.value); applyTheme(); } },
    [["auto", "Ikuti sistem"], ["dark", "Gelap"], ["light", "Terang"]].map(([v, n]) => h("option", { value: v, selected: store.get("theme", "auto") === v }, n)));
  return h("div", {}, h("h1", {}, "Setelan"),
    h("div", { class: "set" }, h("label", {}, "Alamat server (Vercel)"), h("p", { class: "sub" }, "Dipakai app Android untuk memanggil API scraper. Kosongkan bila membuka lewat web Vercel."),
      h("div", { class: "field", style: "margin-top:4px" }, url, h("button", { class: "btn", onclick: async () => { store.set("apiBase", url.value.trim()); try { await api("anime", { action: "sources" }); toast("Server terhubung"); } catch (e) { toast(e.message); } } }, "Simpan"))),
    h("div", { class: "set" }, h("label", {}, "Tema"), theme),
    isNative() ? h("div", { class: "set" }, h("label", {}, "Simpan ke galeri & pemutar musik"), h("p", { class: "sub" }, "Salin tiap unduhan ke Musik, Film, atau Gambar › Kanade agar terlihat di app lain. Memakai ruang dua kali."),
      h("select", { class: "select", onchange: (e) => store.set("exportPublic", e.target.value === "1") }, [["1", "Aktif"], ["0", "Mati"]].map(([v, n]) => h("option", { value: v, selected: String(store.get("exportPublic", true) ? 1 : 0) === v }, n)))) : null,
    h("div", { class: "set" }, h("label", {}, "Data"), h("button", { class: "btn ghost", onclick: () => { if (confirm("Hapus riwayat, antrean, dan cache?")) { ["history", "queue", "qindex"].forEach((k) => store.set(k, k === "qindex" ? -1 : [])); toast("Dibersihkan"); } } }, "Bersihkan riwayat & antrean")),
    h("p", { class: "sub", style: "margin-top:24px" }, "Kanade hanya perantara. Unduh konten milik sendiri atau yang diizinkan pemiliknya, dan patuhi ketentuan tiap platform."));
}
export function applyTheme() { const t = store.get("theme", "auto"); t === "auto" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.setAttribute("data-theme", t); }

// ---------- MINI PLAYER & NOW PLAYING ----------
export function miniView() {
  const t = pl.current();
  document.body.classList.toggle("has-mini", !!t);
  if (!t) return h("span");
  const d = pl.el.duration || t.duration || 0;
  return h("div", { class: "mini" },
    h("img", { src: t.thumbnail, alt: "", referrerpolicy: "no-referrer" }),
    h("button", { class: "meta", "aria-label": "Buka pemutar", onclick: openNowPlaying }, h("div", { class: "t1" }, t.title), h("div", { class: "t2" }, pl.P.loading ? "Memuat…" : t.author)),
    h("button", { class: "ico", "aria-label": pl.el.paused ? "Putar" : "Jeda", onclick: pl.toggle }, icon(pl.el.paused ? "play" : "pause")),
    h("button", { class: "ico", "aria-label": "Berikutnya", onclick: pl.next }, icon("next")),
    h("div", { class: "bar", id: "minibar", style: `width:${d ? (pl.el.currentTime / d) * 100 : 0}%` }));
}
export function tickMini() { const b = document.getElementById("minibar"), d = pl.el.duration || 0; if (b && d) b.style.width = (pl.el.currentTime / d) * 100 + "%"; }

export function openNowPlaying() {
  let tab = "cover", refs = {};
  const body = h("div"), onP = () => render(), onT = () => tick();
  bus.addEventListener("player", onP); bus.addEventListener("tick", onT);
  const l = full(body, () => { bus.removeEventListener("player", onP); bus.removeEventListener("tick", onT); });
  function tick() {
    const d = pl.el.duration || (pl.current() && pl.current().duration) || 0;
    if (refs.seek && !refs.drag) { refs.seek.max = d; refs.seek.value = pl.el.currentTime; }
    if (refs.cur) refs.cur.textContent = fmt(pl.el.currentTime);
    if (refs.lyr && pl.P.lyrics && pl.P.lyrics.synced) {
      const L = pl.P.lyrics.synced; let k = L.findIndex((x) => x.t > pl.el.currentTime) - 1; if (k < 0) k = 0;
      [...refs.lyr.children].forEach((c, n) => c.classList.toggle("cur", n === k));
      const c = refs.lyr.children[k]; if (c && refs.k !== k) { refs.k = k; c.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
  }
  function render() {
    const t = pl.current(); if (!t) return l.close();
    refs = {};
    const d = pl.el.duration || t.duration || 0;
    let middle;
    if (tab === "lyrics") {
      const ly = pl.P.lyrics;
      refs.lyr = h("div", { class: "lyrics" }, !ly ? "Mencari lirik…" : ly.none ? "Lirik tidak ditemukan." : ly.plain ? ly.plain : ly.synced.map((x) => h("p", {}, x.text || "♪")));
      middle = refs.lyr;
    } else if (tab === "queue") {
      middle = h("ul", { style: "max-height:46vh;overflow:auto" }, pl.P.queue.map((q, i) => h("li", { class: "row" + (i === pl.P.index ? " active" : "") },
        h("button", { class: "main", onclick: () => pl.jump(i) }, h("div", { class: "t1" }, q.title), h("div", { class: "t2" }, q.author)),
        i === pl.P.index ? null : h("button", { class: "ico", "aria-label": "Hapus dari antrean", onclick: () => pl.removeAt(i) }, icon("close")))));
    } else middle = h("img", { class: "np-cover", src: t.thumbnail.replace("mqdefault", "hqdefault"), alt: "", referrerpolicy: "no-referrer" });
    refs.seek = h("input", { class: "seek", type: "range", min: 0, max: d, step: 1, value: pl.el.currentTime, "aria-label": "Posisi",
      oninput: () => { refs.drag = true; refs.cur.textContent = fmt(refs.seek.value); }, onchange: () => { refs.drag = false; pl.seek(+refs.seek.value); } });
    refs.cur = h("span", {}, fmt(pl.el.currentTime));
    body.replaceChildren(
      h("div", { style: "display:flex;justify-content:space-between;align-items:center" },
        h("button", { class: "ico", "aria-label": "Tutup", onclick: () => l.close() }, icon("close")),
        h("div", { class: "seg", style: "margin:0;flex:1;max-width:260px" }, [["cover", "Cover"], ["lyrics", "Lirik"], ["queue", "Antrean"]].map(([k, n]) => h("button", { "aria-selected": String(tab === k), onclick: () => { tab = k; render(); } }, n))),
        h("button", { class: "ico", "aria-label": "Menu", onclick: () => trackMenu(t) }, icon("more"))),
      middle,
      h("div", { style: "display:flex;align-items:center;gap:8px" }, h("div", { style: "flex:1;min-width:0" }, h("div", { class: "np-title t1" }, t.title), h("div", { class: "t2" }, t.author)),
        h("button", { class: "ico" + (pl.isLiked(t) ? " on" : ""), "aria-label": "Suka", onclick: () => pl.toggleLike(t) }, icon("heart"))),
      refs.seek, h("div", { class: "times" }, refs.cur, h("span", {}, fmt(d))),
      h("div", { class: "ctrl" },
        h("button", { class: "ico" + (pl.P.shuffle ? " on" : ""), "aria-label": "Acak", onclick: pl.toggleShuffle }, icon("shuffle")),
        h("button", { class: "ico", "aria-label": "Sebelumnya", onclick: pl.prev }, icon("prev")),
        h("button", { class: "ico big", "aria-label": pl.el.paused ? "Putar" : "Jeda", onclick: pl.toggle }, icon(pl.el.paused ? "play" : "pause")),
        h("button", { class: "ico", "aria-label": "Berikutnya", onclick: pl.next }, icon("next")),
        h("button", { class: "ico" + (pl.P.repeat !== "off" ? " on" : ""), "aria-label": "Ulangi: " + pl.P.repeat, onclick: pl.cycleRepeat }, icon("repeat"), pl.P.repeat === "one" ? h("small", {}, "1") : null)),
      h("div", { class: "ctrl", style: "justify-content:center;gap:18px" },
        h("button", { class: "chip", onclick: pl.cycleSpeed }, `${pl.P.speed}x`),
        h("button", { class: "chip", "aria-pressed": String(!!pl.P.sleepAt), onclick: () => { const s = sheet("Sleep timer", [15, 30, 60, 0].map((m) => item(m ? `${m} menit` : "Matikan", () => (s.close(), pl.setSleep(m)), "moon"))); } }, "Sleep timer"),
        h("button", { class: "chip", onclick: () => { const f = getFiles().find((x) => x.id === t.id); f ? toast("Sudah diunduh") : dlAudio(t); } }, "Unduh")));
    tick();
  }
  render();
}
