// GET /api/comic?action=search&q=...&source=komiku
//     /api/comic?action=chapters&url=...   |   /api/comic?action=pages&url=...
const { scrapr, handler, fail, chain, normalize } = require("../lib/server");

const group = scrapr.comic;
const get = (src, fn) => {
  const mod = group[src];
  if (!mod) throw fail("Sumber tidak dikenal: " + src);
  if (typeof mod[fn] !== "function") throw fail("Sumber " + src + " belum mendukung " + fn, 422);
  return mod[fn];
};

module.exports = handler(
  async ({ action = "search", source = "komiku", q, url }) => {
    if (action === "sources") return Object.keys(group);
    if (action === "search") {
      if (!q) throw fail("Kata kunci kosong");
      return chain([get(source, "search")], q);
    }
    if (!url) throw fail("Parameter url wajib diisi");
    if (action === "chapters") return chain([get(source, "getChapters")], url);
    if (action === "pages") return normalize(source, await chain([get(source, "scrape")], url));
    throw fail("action tidak dikenal");
  },
  { cache: 120 },
);
