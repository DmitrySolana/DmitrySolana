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

  // --- Vibe Activity (parody grid; not real GitHub contributions) ---
  function vibeActivitySvg() {
    // Grid size similar-ish to GitHub contributions: 7 rows (days) x N cols (weeks)
    // This mask was derived from your logocrab.webp (downsampled).
    const rows = 7;
    const cols = 36;
    const cell = 12;
    const gap = 3;
    const w = cols * cell + (cols - 1) * gap;
    const h = rows * cell + (rows - 1) * gap;

    // Red palette (light -> dark)
    const palette = ["#2b0a0a", "#4a0f0f", "#7a1414", "#b91c1c", "#ef4444"]; // deep red → bright

    // Shape: your crab logo, downsampled into a 36x7 mask.
    // 1 = ink, 0 = empty
    const shape = [
      "000000000000011000000001011110000000",
      "000000000011111010011111111111000000",
      "000000001111111111111111111111100000",
      "000000001111111111111111111111000000",
      "000000111111111111111111111100000000",
      "000000111111111111111100000000000000",
      "000000001111101111111000000000000000",
    ].map((row) => row.split("").map((c) => c === "1"));

    // Sprinkle some "noise" inside the shape so it looks like activity, but keep the outline readable.
    // Deterministic based on GH_USER.
    let seed = 0;
    for (const ch of GH_USER) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    function rand() {
      // xorshift32
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    }

    const rects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = shape[r]?.[c] ?? false;
        const x = c * (cell + gap);
        const y = r * (cell + gap);

        // Background tiles: very dark red.
        let level = 0;

        if (on) {
          // Inside the "C": brighter reds, weighted toward mid/high.
          const t = rand();
          if (t < 0.15) level = 2;
          else if (t < 0.55) level = 3;
          else level = 4;
        } else {
          // Outside: mostly empty, occasional faint dot.
          level = rand() < 0.03 ? 1 : 0;
        }

        rects.push(
          `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${palette[level]}" />`
        );
      }
    }

    return `\n<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vibe Activity (parody)">\n  <rect width="100%" height="100%" fill="transparent"/>\n  ${rects.join("\n  ")}\n</svg>\n`;
  }

  lines.push(`## Vibe Activity`);
  lines.push("");
  lines.push(`<sub>Parody heatmap. Not real contributions. Crab-coded.</sub>`);
  lines.push("");
  lines.push(vibeActivitySvg());
  lines.push("");

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
