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

  function oneSentence15Words(text) {
    const raw = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    // Take first sentence-ish chunk.
    const first = raw.split(/(?<=[.!?])\s+/)[0] || raw;
    const words = first
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .split(/\s+/)
      .filter(Boolean);
    return words.slice(0, 15).join(" ").replace(/[.!?]$/, "") + (words.length > 15 ? "…" : "");
  }

  // Build a full, de-duplicated project list
  const seen = new Set();
  const cards = (Array.isArray(projects) ? projects : [])
    .map((p) => {
      const title = mdEscape(p?.title);
      const slug = mdEscape(p?.slug);
      const url = `${SITE}/projects/${slug}`;
      const date = mdEscape(p?.date ?? "");
      const desc = mdEscape(oneSentence15Words(p?.excerpt ?? ""));
      // Prefer the external project URL for favicon purposes.
      const siteUrl = p?.iframeSrc ? String(p.iframeSrc) : url;
      const image = p?.image ? `${SITE}${p.image}` : "";
      return { title, slug, url, date, desc, siteUrl, image };
    })
    .filter((p) => p.title && p.url && p.slug)
    .filter((p) => {
      if (seen.has(p.slug)) return false;
      seen.add(p.slug);
      return true;
    });

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

  // Header
  lines.push(`# Hello there, I'm Sergio 👋`);
  lines.push(`📍 London`);
  lines.push("");
  lines.push(`Deep in vibe-coding mode`);
  lines.push("");

  // Projects as “cards” (HTML for layout)
  // Projects (sorted newest → oldest)
  const cardsSorted = [...cards].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  async function urlLooksLoadable(url) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "github-profile-sync/1.0" },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (cardsSorted.length) {
    lines.push(`## Current Projects`);
    lines.push("");

    for (const c of cardsSorted) {
      // Goal: avoid broken icons in GitHub rendering.
      // 1) project image from sergiopesch.com (unique and reliable)
      // 2) external favicon via Google S2, but only if it actually exists
      // 3) deterministic identicon seeded by slug (always unique)
      const identicon = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(
        c.slug
      )}`;

      let icon = identicon;

      if (c.image) {
        icon = c.image;
      } else {
        const candidate = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
          c.siteUrl
        )}`;
        if (await urlLooksLoadable(candidate)) icon = candidate;
      }

      const tail = c.desc ? ` — ${c.desc}` : "";
      lines.push(
        `- <img src="${icon}" width="16" height="16" alt="" /> <a href="${c.url}"><b>${c.title}</b></a>${tail}`
      );
    }

    lines.push("");
    lines.push(`<sub>${cardsSorted.length} projects</sub>`);
    lines.push("");
  }

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
