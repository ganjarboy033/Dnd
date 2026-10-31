// GET /api/music?q=...  -> hasil pencarian YouTube (judul, channel, durasi, cover)
const axios = require("axios");
const { handler, fail } = require("../lib/server");

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

function collect(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.videoRenderer && node.videoRenderer.videoId) out.push(node.videoRenderer);
  for (const k in node) collect(node[k], out);
}
const secs = (t) => (t || "").split(":").reduce((a, b) => a * 60 + Number(b), 0);

module.exports = handler(
  async ({ q }) => {
    if (!q || !String(q).trim()) throw fail("Kata kunci kosong");
    const { data: html } = await axios.get("https://www.youtube.com/results", {
      params: { search_query: String(q).trim(), hl: "id", gl: "ID" },
      headers: { "User-Agent": UA, "Accept-Language": "id,en;q=0.8" },
      timeout: 12000,
    });
    const m = String(html).match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) throw fail("YouTube tidak mengembalikan data pencarian", 502);
    const found = [];
    collect(JSON.parse(m[1]), found);
    const seen = new Set();
    return found
      .filter((v) => !seen.has(v.videoId) && seen.add(v.videoId))
      .slice(0, 25)
      .map((v) => ({
        id: v.videoId,
        title: (v.title && v.title.runs && v.title.runs[0].text) || "",
        author: ((v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text) || "").replace(/ - Topic$/, ""),
        duration: secs(v.lengthText && v.lengthText.simpleText),
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }))
      .filter((v) => v.title && v.duration > 0);
  },
  { cache: 300 },
);
