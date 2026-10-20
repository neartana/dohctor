---
name: dohctor
description: "DNS-over-HTTPS doctor for AI agents: diagnose DNS blocking/poisoning (system resolver vs DoH), resolve names, and fetch pages through a DoH resolver (Cloudflare/Google/Quad9/AdGuard) — keyless, no API. Use when a domain fails to resolve, resolves to an ISP block page, or a fetch is suspected to be stopped by DNS-level filtering."
---

# Dohctor — DNS-over-HTTPS resolve & fetch (bypass DNS blocks, keyless)

Use when normal web access looks DNS-blocked or poisoned (a domain fails to
resolve, resolves to a block page / ISP redirect, or behaves differently than
expected), to diagnose whether DNS is the problem, or to fetch a page whose
host is blocked at DNS level only. Also for plain DNS lookups (A/AAAA/MX/TXT/
...) through a trusted public resolver.

Dohctor wraps [99apps-id/doh-mcp](https://github.com/99apps-id/doh-mcp)
(Apache-2.0), an MCP server for DNS-over-HTTPS. It resolves names and fetches
URLs through a DoH resolver (Cloudflare default; also google, quad9, adguard,
or any https DoH endpoint), so DNS-level ISP blocking/poisoning does not stop
the read. No API key.

Know the limits: DoH defeats **DNS-level** blocks only — if the block is at
IP/SNI level it will not help; and fetched search pages are scraping (can hit
CAPTCHA / rate limits), not a search API.

## Components

- MCP server binary: `doh-mcp` — the installer places it in `<skill-dir>/bin/`.
  Lookup order used by the helper: `$DOHCTOR_BIN` / `$DOH_MCP_BIN`, then
  `<skill-dir>/bin/doh-mcp`, then `~/.local/bin/doh-mcp`, then PATH.
- Helper (the agent's way in — speaks MCP over stdio to the binary):
  `<skill-dir>/scripts/doh.mjs` (Node >= 18, zero dependencies).
- Resolver: env `DOH_RESOLVER` = cloudflare (default) | google | quad9 |
  adguard | any `https://.../dns-query` URL.

## Usage

```sh
DOH=<skill-dir>/scripts/doh.mjs

# Resolve a name through DoH (types: A AAAA CNAME MX TXT NS SOA PTR SRV CAA)
node $DOH resolve example.com A
node $DOH resolve gmail.com MX

# Diagnose: system resolver vs DoH — reports whether they disagree
# (block, hijack, or local override)
node $DOH compare duckduckgo.com

# Fetch a page whose host is DNS-blocked; HTML is reduced to text
node $DOH fetch https://example.com 20000
```

Or register the binary as a native MCP server in your agent instead
(stdio transport):

```json
{
  "mcpServers": {
    "doh": { "command": "<skill-dir>/bin/doh-mcp", "args": ["-resolver", "cloudflare"] }
  }
}
```

Tools exposed by the server: `doh_resolve`, `doh_compare`, `doh_fetch`.
The server refuses cloud metadata endpoints (169.254.169.254,
metadata.google.internal), re-checks every redirect, and pins each connection
to the address it resolved (defeats DNS rebinding). Loopback and private
addresses are allowed, so a local documentation server can be read.

## When to prefer this over the agent's built-in search/fetch

- Suspected DNS poisoning/block: run `compare` FIRST to prove DNS is the
  problem before blaming the site.
- `fetch` when the page is needed as plain text and normal fetch fails on DNS.
- Otherwise the agent's normal browser/search tools are richer (rendering,
  links, images) — Dohctor is the fallback and the diagnostic, not the default.
