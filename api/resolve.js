// GET /api/resolve?url=...&mode=audio|video|all
const { scrapr: s, handler, fail, chain, normalize } = require("../lib/server");

const PLATFORMS = [
  ["youtube", /youtu\.?be/i],
  ["tiktok", /tiktok\.com|tt\.site/i, [s.tiktok.snaptik, s.tiktok.tiktokio, s.tiktok.ssstik, s.tiktok.tikdownloader]],
  ["instagram", /instagram\.com/i, [s.instagram.direct, s.instagram.indown, s.instagram.snapsave]],
  ["spotify", /spotify\.com/i, [s.spotify.spotisaver, s.spotify.spotidown, s.spotify.spotmate, s.spotify.soundloaders]],
  ["twitter", /twitter\.com|x\.com/i, [s.twitter.direct, s.twitter.tweeload, s.twitter.savetwt, s.twitter.tvd]],
  ["facebook", /facebook\.com|fb\.watch/i, [s.facebook.snapsave]],
  ["soundcloud", /soundcloud\.com/i, [s.soundcloud.klickaud]],
  ["applemusic", /music\.apple\.com/i, [s.applemusic.aplmate]],
  ["pinterest", /pinterest\.|pin\.it/i, [s.pinterest.direct, s.pinterest.pindown]],
  ["reddit", /reddit\.com|redd\.it/i, [s.reddit.rapidsave]],
  ["threads", /threads\.(net|com)/i, [s.threads.threadster]],
  ["bandcamp", /bandcamp\.com/i, [s.bandcamp.direct]],
  ["bilibili", /bilibili\.(com|tv)|b23\.tv/i, [s.bilibili.direct]],
  ["douyin", /douyin\.com/i, [s.douyin.direct]],
  ["pixiv", /pixiv\.net/i, [s.pixiv.ajax]],
  ["rednote", /xiaohongshu\.com|xhslink/i, [s.rednote.direct]],
  ["terabox", /terabox|1024tera/i, [s.terabox.sechno]],
  ["mediafire", /mediafire\.com/i, [s.resolver.mediafire]],
  ["pixeldrain", /pixeldrain\.com/i, [s.resolver.pixeldrain]],
  ["gdrive", /drive\.google\.com/i, [s.resolver.gdrive]],
  ["catbox", /catbox\.moe/i, [s.resolver.catbox]],
];

async function youtube(url, mode) {
  const isList = /[?&]list=/.test(url) && !/[?&]v=|youtu\.be\//.test(url);
  if (isList) return chain([s.youtube.playlist], url);

  const formats = mode === "audio" ? ["mp3"] : mode === "video" ? ["mp4"] : ["mp3", "mp4"];
  const settled = await Promise.allSettled(formats.map((f) => s.youtube.ytmp3(url, f)));
  let base = null;
  const downloads = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value && r.value.status) {
      base = base || r.value.result;
      downloads.push(...r.value.result.downloads);
    }
  }
  if (!base) return chain([s.youtube.ytmp3gg], url);
  return { ...base, downloads };
}

async function run(url, mode, depth = 0) {
  const hit = PLATFORMS.find((p) => p[1].test(url));
  if (!hit) {
    if (depth) throw fail("Platform belum didukung", 422);
    // Link pendek / tak dikenal: buka dulu, lalu coba lagi sekali.
    const r = await chain([s.resolver.unshorten], url).catch(() => null);
    if (r && r.url && r.url !== url) return run(r.url, mode, 1);
    throw fail("Platform belum didukung", 422);
  }
  const [id, , fns] = hit;
  const result = id === "youtube" ? await youtube(url, mode) : await chain(fns, url);
  return normalize(id, result);
}

module.exports = handler(async ({ url, mode = "all" }) => {
  if (!url) throw fail("Parameter url wajib diisi");
  url = String(url).trim();
  if (!/^https?:\/\//i.test(url)) throw fail("URL tidak valid");
  return run(url, mode);
});
