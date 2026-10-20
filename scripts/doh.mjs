#!/usr/bin/env node
// doh.mjs — tiny stdio client for the doh-mcp MCP server (Dohctor skill).
// Spawns the doh-mcp binary, does the initialize handshake, calls one tool,
// prints its text output, exits.
//
// Usage:
//   node doh.mjs resolve <name> [type=A]      doh_resolve  (A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, SRV, CAA)
//   node doh.mjs compare <name>               doh_compare  (system resolver vs DoH — detects DNS block/poisoning)
//   node doh.mjs fetch  <url> [max_chars]     doh_fetch    (fetch URL, host resolved via DoH, HTML->text)
//
// Binary lookup order:
//   1. $DOHCTOR_BIN or $DOH_MCP_BIN
//   2. <skill-dir>/bin/doh-mcp   (placed there by the installer)
//   3. ~/.local/bin/doh-mcp
//   4. "doh-mcp" on PATH
// Resolver: env DOH_RESOLVER (cloudflare|google|quad9|adguard|https URL), default cloudflare.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const [cmd, ...rest] = process.argv.slice(2);
const RESOLVER = process.env.DOH_RESOLVER || 'cloudflare';
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? 'doh-mcp.exe' : 'doh-mcp';

function findBinary() {
  const candidates = [
    process.env.DOHCTOR_BIN,
    process.env.DOH_MCP_BIN,
    join(skillDir, 'bin', exe),
    join(homedir(), '.local', 'bin', exe),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return 'doh-mcp'; // last resort: PATH
}
const BIN = findBinary();

const tools = {
  resolve: () => ['doh_resolve', { name: rest[0], type: rest[1] || 'A' }],
  compare: () => ['doh_compare', { name: rest[0] }],
  fetch: () => ['doh_fetch', { url: rest[0], max_chars: Number(rest[1] || 20000) }],
};

if (!cmd || !tools[cmd] || !rest[0]) {
  console.error('usage: node doh.mjs resolve <name> [type] | compare <name> | fetch <url> [max_chars]');
  process.exit(2);
}
const [toolName, toolArgs] = tools[cmd]();

const child = spawn(BIN, ['-resolver', RESOLVER], { stdio: ['pipe', 'pipe', 'inherit'] });
child.on('error', (e) => {
  console.error(`dohctor: cannot start doh-mcp binary (${BIN}): ${e.message}`);
  console.error('Re-run the installer (npx github:neartana/dohctor) or set DOHCTOR_BIN to the binary path.');
  process.exit(1);
});
let buf = '';
const timer = setTimeout(() => { console.error('doh-mcp: timeout'); child.kill(); process.exit(1); }, 60000);

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1) {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
    } else if (msg.id === 2) {
      clearTimeout(timer);
      if (msg.error) { console.error('MCP error:', JSON.stringify(msg.error)); child.kill(); process.exit(1); }
      const content = msg.result?.content || [];
      for (const c of content) if (c.type === 'text') console.log(c.text);
      if (msg.result?.isError) process.exitCode = 1;
      child.kill();
      process.exit(process.exitCode ?? 0);
    }
  }
});

function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dohctor-skill', version: '1.0.0' } } });
