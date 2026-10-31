// Pengelola unduhan. Native: Capacitor Filesystem (folder app, tanpa izin storage). Web: fetch -> blob.
import { store, emit, plugin, kanade, isNative, safeName, toast } from "./lib.js";

const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

const tasks = new Map();
export const activeTasks = () => [...tasks.values()];
export const getFiles = () => store.get("files", []);
const FOLDER = { audio: "Musik", video: "Video", photo: "Gambar", image: "Gambar" };

function update(t, patch) { Object.assign(t, patch); emit("dl"); }

export async function download(item) {
  const { url, title, type = "video", ext = "bin", thumbnail = "", author = "", id } = item;
  const t = { id: id || crypto.randomUUID(), title, type, progress: 0, state: "run", thumbnail };
  tasks.set(t.id, t);
  emit("dl");
  const rel = `Kanade/${FOLDER[type] || "Lainnya"}/${safeName(title)}.${ext}`;
  try {
    let path = "";
    const fs = plugin("Filesystem");
    if (isNative() && fs) {
      const h = await fs.addListener("progress", (e) => {
        if (e.url === url && e.contentLength > 0) update(t, { progress: e.bytes / e.contentLength });
      });
      try {
        const r = await fs.downloadFile({ url, path: rel, directory: "EXTERNAL", recursive: true, progress: true });
        path = r.path || "";
      } finally { h.remove(); }
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: rel.split("/").pop() });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    let exported = false;
    if (path && kanade() && store.get("exportPublic", true)) {
      try {
        await kanade().saveToMediaStore({ path, name: `${safeName(title)}.${ext}`, mime: MIME[ext.toLowerCase()] || "application/octet-stream", kind: type === "image" ? "photo" : type });
        exported = true;
      } catch (e) { toast(e.message || "Gagal menyalin ke galeri"); }
    }
    const file = { id: t.id, title, author, type, ext, thumbnail, path, rel, exported, size: 0, ts: Date.now() };
    store.set("files", [file, ...getFiles()]);
    update(t, { progress: 1, state: "done" });
    toast("Selesai: " + title);
    setTimeout(() => { tasks.delete(t.id); emit("dl"); }, 1500);
    return file;
  } catch (e) {
    update(t, { state: "error", error: e.message });
    toast("Gagal mengunduh. " + (isNative() ? "" : "Server asal mungkin memblokir unduhan dari browser."));
    setTimeout(() => { tasks.delete(t.id); emit("dl"); }, 6000);
  }
}

export async function removeFile(f) {
  try { if (f.rel && plugin("Filesystem")) await plugin("Filesystem").deleteFile({ path: f.rel, directory: "EXTERNAL" }); } catch {}
  store.set("files", getFiles().filter((x) => x.id !== f.id));
}
