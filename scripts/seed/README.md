# Demo log seeder

Generates realistic, ECS-shaped synthetic security log datasets and indexes them
into Elasticsearch, then (optionally) creates matching Kibana data views so you
can immediately hunt with the Query Copilot in Discover.

## What it generates

| Index               | Volume | Dataset                              |
| ------------------- | ------ | ------------------------------------ |
| `logs-auth-demo`    | ~1000  | SSH authentication events            |
| `logs-process-demo` | ~500   | Process start events                 |
| `logs-network-demo` | ~300   | Network flow events                  |

Documents span a **7-day window ending now** (`@timestamp`).

### Planted signals (things to hunt for)

- **Brute-force clusters** (`logs-auth-demo`): a handful of external `source.ip`
  addresses each producing a tight burst of `ssh_login_failed` against a single
  `user.name` / `host.name` — ending with one `ssh_login_success` (simulated
  breach). ~60% of auth events overall are failures, and source IPs are a mix of
  internal (`10.0.x.x`, `172.16.x.x`, `192.168.x.x`) and routable external IPs.
- **Suspicious processes** (`logs-process-demo`, ~10%): `powershell.exe -Enc`/
  `-EncodedCommand`, `cmd.exe /c ...`, `certutil -urlcache -f http://...`,
  `whoami /priv`, `net user ... /add`, and base64-piped `bash` one-liners. The
  rest are benign (`bash`, `sshd`, `node`, `python3`, `nginx`, `systemd`, ...).
- **Unusual ports** (`logs-network-demo`, ~12%): `destination.port` in
  `4444, 1337, 31337, 8888, 6667, 9001`, usually `outbound` with large
  `network.bytes` (beaconing / exfil flavor). The rest use normal ports
  (`443, 80, 53, 22, 3306, 5601, 9200`).

## Prerequisites

- A running **Elasticsearch** and **Kibana** (the plugin's dev stack).
- Credentials for both (basic auth or an ES API key).

## Environment variables

| Variable          | Default                  | Purpose                                            |
| ----------------- | ------------------------ | -------------------------------------------------- |
| `ES_URL`          | `http://localhost:9200`  | Elasticsearch endpoint                             |
| `ES_USERNAME`     | _(none)_                 | ES basic-auth username (e.g. `elastic`)            |
| `ES_PASSWORD`     | _(none)_                 | ES basic-auth password                             |
| `ES_API_KEY`      | _(none)_                 | ES API key (alternative to username/password)      |
| `KIBANA_URL`      | `http://localhost:5601`  | Kibana endpoint                                    |
| `KIBANA_USERNAME` | falls back to `ES_USERNAME` | Kibana basic-auth username                      |
| `KIBANA_PASSWORD` | falls back to `ES_PASSWORD` | Kibana basic-auth password                      |

## CLI flags

- `--clean` — delete the three demo indices (and matching data views) first.
- `--no-kibana` — index into ES only; skip Kibana data-view creation.

## How to run

From the plugin directory (`plugins/query_copilot/`):

```bash
npx ts-node scripts/seed/generate-logs.ts
```

With inline credentials and a clean reseed:

```bash
ES_URL=http://localhost:9200 \
ES_USERNAME=elastic ES_PASSWORD=changeme \
KIBANA_URL=http://localhost:5601 \
  npx ts-node scripts/seed/generate-logs.ts --clean
```

ES-only (skip data views):

```bash
ES_USERNAME=elastic ES_PASSWORD=changeme \
  npx ts-node scripts/seed/generate-logs.ts --no-kibana
```

## What it creates

- **Elasticsearch**: index templates + the three indices above.
- **Kibana**: three data views (`Demo: Auth Logs`, `Demo: Process Logs`,
  `Demo: Network Logs`), each with `@timestamp` as the time field.

## Verify

```bash
# Doc counts
curl -u elastic:changeme http://localhost:9200/logs-auth-demo/_count
curl -u elastic:changeme http://localhost:9200/logs-process-demo/_count
curl -u elastic:changeme http://localhost:9200/logs-network-demo/_count
```

Or in **Discover**, select a demo data view and try:

- `event.action: ssh_login_failed` (then group by `source.ip`) to surface the
  brute-force clusters.
- `process.command_line: *EncodedCommand* or process.name: powershell.exe`.
- `destination.port: (4444 or 1337 or 31337) and network.direction: outbound`.
