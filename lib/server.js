// Helper bersama untuk semua fungsi di /api
const scrapr = require("@coflyn/scrapr");

function handler(fn, { cache = 0 } = {}) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const data = await fn({ ...req.query, ...body });
      res.setHeader(
        "Cache-Control",
        cache ? `s-maxage=${cache}, stale-while-revalidate=${cache * 5}` : "no-store",
      );
      res.status(200).json({ ok: true, data });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message || "Terjadi kesalahan" });
    }
  };
}

function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Coba scraper satu per satu sampai ada yang berhasil.
async function chain(fns, ...args) {
  let last = "";
  for (const f of fns.filter((x) => typeof x === "function")) {
    try {
      const r = await f(...args);
      if (r && r.status) return r.result;
      last = (r && r.message) || last;
    } catch (e) {
      last = e.message || last;
    }
  }
  throw fail(last || "Semua server gagal merespons", 502);
}

const EXT = { audio: "mp3", video: "mp4", photo: "jpg", image: "jpg" };
function normalize(platform, r) {
  const type = r.type || (r.downloads && r.downloads[0] && r.downloads[0].type) || "video";
  const downloads = (r.downloads || [])
    .filter((d) => d && d.url)
    .map((d) => {
      const t = d.type || type;
      const fromUrl = (String(d.url).split("?")[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1];
      return { url: d.url, type: t, quality: d.quality || "", ext: fromUrl || EXT[t] || "bin" };
    });
  return {
    platform,
    title: r.title || "Tanpa judul",
    author: r.author || r.artist || "",
    thumbnail: r.thumbnail || r.cover || "",
    type,
    items: r.items || null,
    itemCount: r.itemCount || (r.items ? r.items.length : 0),
    downloads,
  };
}

module.exports = { scrapr, handler, fail, chain, normalize };
