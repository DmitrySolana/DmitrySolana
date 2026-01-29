import fs from "node:fs/promises";

const PROFILE_JSON_URL = "https://www.sergiopesch.com/profile.json";

function mdEscape(s = "") {
  return String(s).replace(/\|/g, "\\|").trim();
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

async function main() {
  const res = await fetch(PROFILE_JSON_URL, {
    headers: { "user-agent": "github-profile-sync/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch profile.json: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  const name = mdEscape(data.name ?? "Sergio Peschiera");
  const headline = mdEscape(data.headline ?? "");
  const location = mdEscape(data.location ?? "");
  const now = ensureArray(data.now).map(mdEscape).filter(Boolean);
  const projects = ensureArray(data.projects)
    .map((p) => ({
      title: mdEscape(p?.title),
      url: mdEscape(p?.url),
      desc: mdEscape(p?.description ?? ""),
    }))
    .filter((p) => p.title && p.url)
    .slice(0, 6);

  const thoughts = ensureArray(data.thoughts)
    .map((t) => ({
      title: mdEscape(t?.title),
      url: mdEscape(t?.url),
      date: mdEscape(t?.date ?? ""),
    }))
    .filter((t) => t.title && t.url)
    .slice(0, 4);

  const links = data.links ?? {};
  const website = mdEscape(links.website ?? "https://www.sergiopesch.com");
  const linkedin = mdEscape(links.linkedin ?? "");
  const x = mdEscape(links.x ?? "");
  const github = mdEscape(links.github ?? "https://github.com/sergiopesch");

  const lines = [];

  lines.push(`# ${name}`);
  lines.push(
    [location && `📍 ${location}`, headline && `🛠️ ${headline}`].filter(Boolean).join(" · ")
  );
  lines.push("");

  if (data.tagline) {
    lines.push(`> ${mdEscape(data.tagline)}`);
    lines.push("");
  }

  if (now.length) {
    lines.push(`## Now`);
    for (const item of now.slice(0, 5)) lines.push(`- ${item}`);
    lines.push("");
  }

  if (projects.length) {
    lines.push(`## Selected projects`);
    for (const p of projects) {
      const suffix = p.desc ? ` — ${p.desc}` : "";
      lines.push(`- [${p.title}](${p.url})${suffix}`);
    }
    lines.push("");
  }

  if (thoughts.length) {
    lines.push(`## Writing / notes`);
    for (const t of thoughts) {
      const suffix = t.date ? ` — ${t.date}` : "";
      lines.push(`- [${t.title}](${t.url})${suffix}`);
    }
    lines.push("");
  }

  lines.push(`## Links`);
  lines.push(`- Website: ${website}`);
  lines.push(`- GitHub: ${github}`);
  if (linkedin) lines.push(`- LinkedIn: ${linkedin}`);
  if (x) lines.push(`- X: ${x}`);
  lines.push("");

  lines.push(`---`);
  lines.push(`_This README is auto-generated from \`${PROFILE_JSON_URL}\`._`);
  lines.push("");

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
