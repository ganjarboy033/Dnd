// GET /api/anime?action=search&q=...&source=otakudesu
//     /api/anime?action=episodes&url=...   |   /api/anime?action=stream&url=...
const { scrapr, handler, fail, chain, normalize } = require("../lib/server");

const group = scrapr.anime;
const get = (src, fn) => {
  const mod = group[src];
  if (!mod) throw fail("Sumber tidak dikenal: " + src);
  if (typeof mod[fn] !== "function") throw fail("Sumber " + src + " belum mendukung " + fn, 422);
  return mod[fn];
};

module.exports = handler(
  async ({ action = "search", source = "otakudesu", q, url }) => {
    if (action === "sources") return Object.keys(group);
    if (action === "search") {
      if (!q) throw fail("Kata kunci kosong");
      return chain([get(source, "search")], q);
    }
    if (!url) throw fail("Parameter url wajib diisi");
    if (action === "episodes") return chain([get(source, "getEpisodes")], url);
    if (action === "stream") return normalize(source, await chain([get(source, "scrape")], url));
    throw fail("action tidak dikenal");
  },
  { cache: 120 },
);
