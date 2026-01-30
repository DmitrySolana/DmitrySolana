import fs from "node:fs/promises";

const SITE = "https://www.sergiopesch.com";

function mdEscape(s = "") {
  return String(s).replace(/\|/g, "\\|").trim();
}

function truncate(s, n) {
  const str = String(s ?? "").trim();
  if (!str) return "";
  if (str.length <= n) return str;
  return str.slice(0, n - 1).trimEnd() + "…";
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "github-profile-sync/1.0 (+https://github.com/sergiopesch)",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function extractNextData(html, urlForError) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
  );
  if (!m) throw new Error(`Could not find __NEXT_DATA__ on ${urlForError}`);
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`Failed to parse __NEXT_DATA__ JSON on ${urlForError}: ${e?.message ?? e}`);
  }
}

function pick(arr, n) {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

async function main() {
  // Pull structured data from your site (Next.js SSG embeds JSON into the HTML)
  const [homeHtml, projectsHtml, thoughtsHtml] = await Promise.all([
    fetchHtml(`${SITE}/`),
    fetchHtml(`${SITE}/projects`),
    fetchHtml(`${SITE}/raw-thoughts`),
  ]);

  const home = extractNextData(homeHtml, `${SITE}/`);
  const projectsPage = extractNextData(projectsHtml, `${SITE}/projects`);
  const thoughtsPage = extractNextData(thoughtsHtml, `${SITE}/raw-thoughts`);

  const latestProject = home?.props?.pageProps?.latestProject;
  const projects = projectsPage?.props?.pageProps?.projects ?? [];
  const thoughts = thoughtsPage?.props?.pageProps?.posts ?? [];

  const topProjects = pick(projects, 6)
    .map((p) => ({
      title: mdEscape(p?.title),
      url: `${SITE}/projects/${mdEscape(p?.slug)}`,
      desc: mdEscape(truncate(p?.excerpt ?? "", 110)),
      date: mdEscape(p?.date ?? ""),
    }))
    .filter((p) => p.title && p.url);

  const topThoughts = pick(thoughts, 5)
    .map((t) => ({
      title: mdEscape(t?.title),
      url: `${SITE}/raw-thoughts/${mdEscape(t?.slug)}`,
      date: mdEscape(t?.date ?? ""),
    }))
    .filter((t) => t.title && t.url);

  const latestProjectLine = latestProject?.slug
    ? `**Latest:** [${mdEscape(latestProject.title)}](${SITE}/projects/${mdEscape(
        latestProject.slug
      )}) — ${mdEscape(truncate(latestProject.excerpt ?? "", 140))}`
    : "";

  const ogDefault = `${SITE}/images/og-default.png`;

  const cards = pick(projects, 6)
    .map((p) => {
      const title = mdEscape(p?.title);
      const slug = mdEscape(p?.slug);
      const url = `${SITE}/projects/${slug}`;
      const date = mdEscape(p?.date ?? "");
      const excerpt = mdEscape(truncate(p?.excerpt ?? "", 120));
      const img = p?.image ? `${SITE}${p.image}` : ogDefault;
      // Prefer the external project URL for favicon purposes.
      const siteUrl = p?.iframeSrc ? String(p.iframeSrc) : url;
      return { title, url, date, excerpt, img, siteUrl };
    })
    .filter((p) => p.title && p.url);

  const thoughtCards = pick(thoughts, 5)
    .map((t) => {
      const title = mdEscape(t?.title);
      const slug = mdEscape(t?.slug);
      const url = `${SITE}/raw-thoughts/${slug}`;
      const date = mdEscape(t?.date ?? "");
      const excerpt = mdEscape(truncate(t?.excerpt ?? "", 140));
      return { title, url, date, excerpt };
    })
    .filter((t) => t.title && t.url);

  const lines = [];

  // Minimal header
  lines.push(`<div align="center">`);
  lines.push("");
  lines.push(`# Sergio Peschiera`);
  lines.push("");
  lines.push(`</div>`);
  lines.push("");

  // Projects as “cards” (HTML for layout)
  // Projects (sorted newest → oldest)
  const cardsSorted = [...cards].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (cardsSorted.length) {
    lines.push(`## Projects`);
    lines.push("");
    lines.push(`<div>`);
    for (const c of cardsSorted) {
      // "Favicon as emoji" → render favicon as a tiny inline image next to the title.
      // Prefer the project external site (if any) by using Google's favicon service on the project URL.
      const favicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
        c.siteUrl
      )}`;

      lines.push(
        `<a href="${c.url}"><img src="${c.img}" alt="${c.title}" width="420" /></a>`
      );
      lines.push(
        `<div><img src="${favicon}" alt="" width="16" height="16" /> <a href="${c.url}"><b>${c.title}</b></a>${c.date ? ` · <sub>${c.date}</sub>` : ""}<br/><sub>${c.excerpt}</sub></div>`
      );
      lines.push(`<br/>`);
    }
    lines.push(`</div>`);
    lines.push("");
  }

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
