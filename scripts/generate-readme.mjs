import fs from "node:fs/promises";

const GH_USER = "sergiopesch";
const GH_GRAPHQL = "https://api.github.com/graphql";

function mdEscape(s = "") {
  return String(s).replace(/\|/g, "\\|").trim();
}

function clipWords(text, n) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, n).join(" ");
}

function enforceTenWordsFunny(line) {
  const trimmed = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
  const clipped = clipWords(firstSentence, 10);
  return clipped.replace(/[.!?]$/, "") + (clipWords(firstSentence, 11) !== clipped ? "…" : "");
}

async function ghGraphql(query, variables = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. In GitHub Actions this is available automatically as secrets.GITHUB_TOKEN."
    );
  }

  const res = await fetch(GH_GRAPHQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "github-profile-readme-generator",
      authorization: `bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = JSON.stringify(json.errors || json, null, 2);
    throw new Error(`GitHub GraphQL failed: ${res.status} ${res.statusText}\n${msg}`);
  }

  return json.data;
}

async function main() {
  const taglines = JSON.parse(await fs.readFile("scripts/taglines.json", "utf8"));
  const emojis = JSON.parse(await fs.readFile("scripts/emojis.json", "utf8"));

  const data = await ghGraphql(
    `query($login:String!) {
      user(login:$login) {
        repositories(
          first: 30,
          orderBy: {field: PUSHED_AT, direction: DESC},
          ownerAffiliations: OWNER,
          privacy: PUBLIC
        ) {
          nodes {
            name
            description
            url
            pushedAt
            isPrivate
            isArchived
            isFork
          }
        }
      }
    }`,
    { login: GH_USER }
  );

  const reposRaw = data?.user?.repositories?.nodes ?? [];
  const repos = reposRaw
    .filter(Boolean)
    .filter((r) => !r.isPrivate)
    .filter((r) => !r.isArchived)
    .filter((r) => !r.isFork)
    .filter((r) => r.name !== GH_USER) // hide the profile repo itself
    .slice(0, 20)
    .map((r) => {
      const custom = taglines?.[r.name] || "";
      const fallback = r.description ? `"${r.description}"` : "";
      const desc = mdEscape(enforceTenWordsFunny(custom || fallback));
      const emoji = emojis?.[r.name] || "✨";
      return {
        name: mdEscape(String(r.name).toLowerCase()),
        url: r.url,
        pushedAt: r.pushedAt || "",
        desc,
        emoji,
      };
    });

  const lines = [];

  lines.push(
    `# Hello there, I'm Sergio <img src="https://media.giphy.com/media/hvRJCLFzcasrR4ia7z/giphy.gif" width="28" alt="hi" />`
  );
  lines.push(`📍 London`);
  lines.push("");
  lines.push(`Deep in vibe-coding mode`);
  lines.push("");

  lines.push(`## Current Projects`);
  lines.push("");

  for (const r of repos) {
    const tail = r.desc ? ` — ${r.desc}` : "";
    lines.push(`- ${r.emoji} <a href="${r.url}"><b>${r.name}</b></a>${tail}`);
  }

  lines.push("");
  lines.push(`<sub>${repos.length} repos</sub>`);
  lines.push("");

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
