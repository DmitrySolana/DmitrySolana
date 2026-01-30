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

  async function fetchAsFile(url, outPathBase) {
    // Downloads an image and saves it to disk.
    const res = await fetch(url, {
      headers: {
        "user-agent": "github-profile-sync/1.0 (+https://github.com/sergiopesch)",
        accept: "image/*",
      },
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let ext = "png";
    if (ct.includes("image/svg")) ext = "svg";
    else if (ct.includes("image/x-icon") || ct.includes("image/vnd.microsoft.icon")) ext = "ico";
    else if (ct.includes("image/jpeg")) ext = "jpg";
    else if (ct.includes("image/gif")) ext = "gif";
    else if (ct.includes("image/png")) ext = "png";

    const outPath = `${outPathBase}.${ext}`;
    await fs.mkdir("assets/icons", { recursive: true });
    await fs.writeFile(outPath, buf);
    return outPath;
  }

  async function ensureIconFileForProject({ slug, siteUrl }) {
    // Prefer fetching directly from the project origin to avoid broken/blocked third-party favicon services.
    try {
      const u = new URL(siteUrl);
      const origin = u.origin;

      const candidates = [
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/favicon.svg`,
        `${origin}/apple-touch-icon.png`,
      ];

      for (const cand of candidates) {
        const saved = await fetchAsFile(cand, `assets/icons/${slug}`);
        if (saved) return saved;
      }

      // Last resort: identicon (always available)
      const ident = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(slug)}`;
      const saved = await fetchAsFile(ident, `assets/icons/${slug}`);
      return saved;
    } catch {
      const ident = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(slug)}`;
      return await fetchAsFile(ident, `assets/icons/${slug}`);
    }
  }

  if (cardsSorted.length) {
    lines.push(`## Current Projects`);
    lines.push("");

    for (const c of cardsSorted) {
      // Prefer project images from your own site (most reliable, already hosted).
      // Otherwise, download and store each project's favicon locally in-repo (so GitHub never hotlinks it).
      let icon = c.image || "";

      if (!icon) {
        const saved = await ensureIconFileForProject({ slug: c.slug, siteUrl: c.siteUrl });
        icon = saved ? saved : "";
      }

      const tail = c.desc ? ` — ${c.desc}` : "";
      const iconHtml = icon ? `<img src="${icon}" width="16" height="16" alt="" /> ` : "";
      lines.push(`- ${iconHtml}<a href="${c.url}"><b>${c.title}</b></a>${tail}`);
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
