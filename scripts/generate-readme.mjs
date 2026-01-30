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

  const lines = [];

  // Header / “hero”
  lines.push(`<div align=\"center\">`);
  lines.push("");
  lines.push(`# Sergio Peschiera`);
  lines.push("");
  lines.push(`Building small products, writing things down, and iterating in public.`);
  lines.push("");
  lines.push(
    `[Website](${SITE}) · [Projects](${SITE}/projects) · [Thoughts](${SITE}/raw-thoughts) · [X](https://x.com/sergiopesch)`
  );
  lines.push("");
  lines.push(`</div>`);
  lines.push("");

  if (latestProjectLine) {
    lines.push(latestProjectLine);
    lines.push("");
  }

  // Projects
  if (topProjects.length) {
    lines.push(`## Projects`);
    for (const p of topProjects) {
      const suffix = [p.desc && `— ${p.desc}`, p.date && `(${p.date})`].filter(Boolean).join(" ");
      lines.push(`- [${p.title}](${p.url}) ${suffix}`.trim());
    }
    lines.push("");
  }

  // Writing
  if (topThoughts.length) {
    lines.push(`## Recent thoughts`);
    for (const t of topThoughts) {
      const suffix = t.date ? `— ${t.date}` : "";
      lines.push(`- [${t.title}](${t.url}) ${suffix}`.trim());
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(
    `_Auto-generated from ${SITE} (parsing Next.js __NEXT_DATA__). Updated: ${new Date().toISOString()}_`
  );
  lines.push("");

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
