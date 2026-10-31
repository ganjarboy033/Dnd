import { $, h, icon, on, plugin, kanade, isNative } from "./lib.js";
import * as V from "./views.js";
import { activeTasks } from "./dl.js";

V.applyTheme();
const TABS = [["home", "Beranda", "home", V.homeView], ["music", "Musik", "music", V.musicView], ["explore", "Jelajah", "compass", V.exploreView], ["lib", "Pustaka", "lib", V.libraryView], ["set", "Setelan", "gear", V.settingsView]];
let tab = "home";

function show() {
  const t = TABS.find((x) => x[0] === tab);
  $("#view").replaceChildren(t[3]());
  $("#view").scrollTop = 0;
  drawNav();
}
function drawNav() {
  const n = activeTasks().filter((t) => t.state === "run").length;
  $("#nav").replaceChildren(...TABS.map(([id, label, ic]) => h("button", { "aria-current": tab === id ? "page" : null, onclick: () => { tab = id; show(); } },
    icon(ic), label, id === "lib" && n ? h("span", { class: "badge" }, n) : null)));
}
const mini = () => $("#mini").replaceChildren(V.miniView());

on("player", mini);
on("tick", V.tickMini);
on("dl", () => { drawNav(); if (tab === "lib") { const y = $("#view").scrollTop; show(); $("#view").scrollTop = y; } });
on("store", (k) => { if (tab === "lib" && ["files", "liked", "playlists", "history"].includes(k)) show(); });

show();
mini();

const App = plugin("App");
if (App) {
  App.addListener("backButton", () => {
    if (V.closeTop()) return;
    if (tab !== "home") { tab = "home"; show(); return; }
    (App.minimizeApp || App.exitApp).call(App);
  });
  App.addListener("appStateChange", (s) => { if (s.isActive && tab === "home") show(); });
}
if (isNative() && plugin("StatusBar")) plugin("StatusBar").setBackgroundColor?.({ color: "#17131f" });

const K = kanade();
if (K) {
  K.addListener("sharedText", (e) => {
    const m = String(e.text || "").match(/https?:\/\/\S+/);
    if (!m) return;
    V.closeTop();
    tab = "home";
    V.setPending(m[0]);
    show();
  });
}
