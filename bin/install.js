#!/usr/bin/env node
// dohctor installer — copies the skill into your agent's skills folder and
// downloads the doh-mcp binary (from the upstream 99apps-id/doh-mcp release)
// next to it, so the skill works out of the box.
//
// Usage:
//   npx github:neartana/dohctor [--dir <path>] [--agent <name>] [--local]
//   npx dohctor [--dir <path>] ...
//
// Targets:
//   --dir <path>        install exactly into <path>/dohctor
//   --agent claude      ~/.claude/skills/dohctor
//   --agent cursor      ~/.cursor/skills/dohctor
//   --agent agents      ~/.agents/skills/dohctor   (skills CLI default)
//   --local             ./.agents/skills/dohctor   (per-project)
//   (no flag)           ~/.agents/skills if present, else ~/.claude/skills
import { cpSync, existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DOH_MCP_VERSION = "v0.1.0";

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(`dohctor installer

  npx github:neartana/dohctor [--dir <path>] [--agent <claude|cursor|agents>] [--local]

Copies SKILL.md + scripts/ into <skills-dir>/dohctor and downloads the
doh-mcp binary (github.com/99apps-id/doh-mcp, Apache-2.0) into its bin/.
Requirements at runtime: node >= 18. No API keys.`);
  process.exit(0);
}

const home = homedir();
let skillsDir;
const dirFlag = flag("--dir");
const agentFlag = flag("--agent");
if (dirFlag) {
  skillsDir = resolve(dirFlag);
} else if (args.includes("--local")) {
  skillsDir = join(process.cwd(), ".agents", "skills");
} else if (agentFlag === "claude") {
  skillsDir = join(home, ".claude", "skills");
} else if (agentFlag === "cursor") {
  skillsDir = join(home, ".cursor", "skills");
} else if (agentFlag === "agents") {
  skillsDir = join(home, ".agents", "skills");
} else {
  skillsDir = existsSync(join(home, ".agents", "skills"))
    ? join(home, ".agents", "skills")
    : join(home, ".claude", "skills");
}

const dest = join(skillsDir, "dohctor");
mkdirSync(join(dest, "scripts"), { recursive: true });
mkdirSync(join(dest, "assets"), { recursive: true });
mkdirSync(join(dest, "bin"), { recursive: true });
for (const f of ["SKILL.md", "README.md", "LICENSE", "NOTICE"]) {
  cpSync(join(root, f), join(dest, f));
}
cpSync(join(root, "scripts", "doh.mjs"), join(dest, "scripts", "doh.mjs"));
cpSync(join(root, "assets", "logo.webp"), join(dest, "assets", "logo.webp"));

// --- download the doh-mcp binary for this platform -------------------------
const osMap = { linux: "linux", darwin: "darwin", win32: "windows" };
const archMap = { x64: "amd64", arm64: "arm64" };
const osName = osMap[process.platform];
const archName = archMap[process.arch];
const exeName = process.platform === "win32" ? "doh-mcp.exe" : "doh-mcp";
let binaryNote;
if (osName && archName) {
  const asset = `doh-mcp-${osName}-${archName}${process.platform === "win32" ? ".exe" : ""}`;
  const url = `https://github.com/99apps-id/doh-mcp/releases/download/${DOH_MCP_VERSION}/${asset}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const binPath = join(dest, "bin", exeName);
    writeFileSync(binPath, buf);
    try { chmodSync(binPath, 0o755); } catch {}
    binaryNote = `binary: ${asset} → ${join(dest, "bin", exeName)}`;
  } catch (e) {
    binaryNote = `⚠️  could not download the doh-mcp binary (${e.message}).
     Get it manually from https://github.com/99apps-id/doh-mcp/releases
     and either put it in ${join(dest, "bin")} or set DOHCTOR_BIN to its path.`;
  }
} else {
  binaryNote = `⚠️  no prebuilt doh-mcp binary for ${process.platform}/${process.arch}.
     Build it from source (go build) at https://github.com/99apps-id/doh-mcp
     and set DOHCTOR_BIN to the binary path.`;
}

console.log(`✅ dohctor installed → ${dest}
${binaryNote}
Next steps:
  1. Make sure node >= 18 is on PATH.
  2. Try it:  node ${join(dest, "scripts", "doh.mjs")} compare duckduckgo.com
  3. Ask your agent to check or fetch a page — the skill takes it from there.`);
