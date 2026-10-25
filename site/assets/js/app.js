// Hash router and app shell. Pages are ES modules exporting render(root, params).

const ROUTES = [
  [/^$/, "home"],
  [/^explore$/, "explore"],
  [/^material\/([\w-]+)$/, "material"],
  [/^hall\/([\w-]+)$/, "hall"],
  [/^plugins$/, "plugins"],
  [/^tutorials$/, "tutorials"],
  [/^ontology$/, "ontology"],
  [/^about$/, "about"],
];

const main = document.getElementById("main");
let cleanup = null;

async function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  let page = "notfound", params = [];
  for (const [re, name] of ROUTES) {
    const m = path.match(re);
    if (m) { page = name; params = m.slice(1); break; }
  }
  document.querySelectorAll(".nav a").forEach((a) => {
    const target = a.getAttribute("href").replace(/^#\/?/, "");
    a.classList.toggle("active", target === "" ? path === "" : path.startsWith(target) || (target === "explore" && /^(material|hall)\//.test(path)));
  });
  if (typeof cleanup === "function") cleanup();
  cleanup = null;
  main.classList.add("leaving");
  try {
    const mod = await import(`./pages/${page === "notfound" ? "home" : page}.js`);
    main.innerHTML = "";
    main.classList.remove("leaving");
    window.scrollTo({ top: 0 });
    cleanup = await mod.render(main, params, new URLSearchParams(query || ""));
  } catch (err) {
    console.error(err);
    main.classList.remove("leaving");
    main.innerHTML = `<section class="page"><h1>Something went wrong</h1><p class="muted">${String(err.message || err)}</p>
      <p>If you are opening the site from disk, serve it instead: <code>python3 -m http.server -d site</code>.</p></section>`;
  }
}

window.addEventListener("hashchange", route);
document.getElementById("menu-toggle")?.addEventListener("click", () => document.body.classList.toggle("menu-open"));
document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));
route();
