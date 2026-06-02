/**
 * Node-env unit tests for the PURE synthetic log generators.
 *
 * These tests exercise only the exported pure functions — no live Elasticsearch
 * or Kibana, no network. Importing the module must NOT trigger main() (it is
 * guarded behind `require.main === module`).
 */

import {
  generateAuthEvents,
  generateProcessEvents,
  generateNetworkEvents,
  buildTimeWindow,
  AUTH_VOLUME,
  PROCESS_VOLUME,
  NETWORK_VOLUME,
  TimeWindow,
} from './generate-logs';

const FIXED_NOW = Date.parse('2026-06-02T00:00:00.000Z');
const WINDOW: TimeWindow = buildTimeWindow(FIXED_NOW);

describe('generate-logs pure generators', () => {
  describe('generateAuthEvents', () => {
    const docs = generateAuthEvents(AUTH_VOLUME, WINDOW);

    it('produces exactly the requested volume', () => {
      expect(docs.length).toBe(AUTH_VOLUME);
      expect(generateAuthEvents(250, WINDOW).length).toBe(250);
    });

    it('keeps every @timestamp within the window', () => {
      for (const doc of docs) {
        const ts = Date.parse(doc['@timestamp']);
        expect(ts).toBeGreaterThanOrEqual(WINDOW.startMs);
        expect(ts).toBeLessThanOrEqual(WINDOW.endMs);
      }
    });

    it('includes both internal (10.x) and external source IPs', () => {
      const hasInternal = docs.some((d) => d.source.ip.startsWith('10.'));
      const hasExternal = docs.some(
        (d) =>
          !d.source.ip.startsWith('10.') &&
          !d.source.ip.startsWith('172.16.') &&
          !d.source.ip.startsWith('192.168.')
      );
      expect(hasInternal).toBe(true);
      expect(hasExternal).toBe(true);
    });

    it('includes both ssh_login_failed and ssh_login_success', () => {
      const actions = new Set(docs.map((d) => d.event.action));
      expect(actions.has('ssh_login_failed')).toBe(true);
      expect(actions.has('ssh_login_success')).toBe(true);
    });

    it('plants a brute-force cluster: one external IP with many failures vs one user/host', () => {
      const byKey = new Map<string, number>();
      for (const d of docs) {
        if (d.event.action !== 'ssh_login_failed') {
          continue;
        }
        const key = `${d.source.ip}|${d.user.name}|${d.host.name}`;
        byKey.set(key, (byKey.get(key) ?? 0) + 1);
      }
      const maxCluster = Math.max(0, ...byKey.values());
      expect(maxCluster).toBeGreaterThanOrEqual(10);
    });

    it('emits ECS-correct event metadata', () => {
      for (const doc of docs) {
        expect(doc.event.category).toBe('authentication');
        expect(doc.event.dataset).toBe('system.auth');
        expect(['failure', 'success']).toContain(doc.event.outcome);
      }
    });
  });

  describe('generateProcessEvents', () => {
    const docs = generateProcessEvents(PROCESS_VOLUME, WINDOW);

    it('produces exactly the requested volume', () => {
      expect(docs.length).toBe(PROCESS_VOLUME);
    });

    it('keeps every @timestamp within the window', () => {
      for (const doc of docs) {
        const ts = Date.parse(doc['@timestamp']);
        expect(ts).toBeGreaterThanOrEqual(WINDOW.startMs);
        expect(ts).toBeLessThanOrEqual(WINDOW.endMs);
      }
    });

    it('includes at least one suspicious process entry', () => {
      const suspicious = docs.some(
        (d) =>
          d.process.name === 'powershell.exe' ||
          /-enc|EncodedCommand|certutil|\/c |whoami \/priv|\/add|base64 -d/i.test(
            d.process.command_line
          )
      );
      expect(suspicious).toBe(true);
    });

    it('is mostly benign processes', () => {
      const suspiciousCount = docs.filter(
        (d) =>
          d.process.name === 'powershell.exe' ||
          /-enc|EncodedCommand|certutil|net user|whoami \/priv/i.test(d.process.command_line)
      ).length;
      expect(suspiciousCount).toBeLessThan(docs.length / 2);
    });

    it('emits ECS-correct event metadata', () => {
      for (const doc of docs) {
        expect(doc.event.category).toBe('process');
        expect(doc.event.type).toBe('start');
        expect(doc.event.action).toBe('process_started');
      }
    });
  });

  describe('generateNetworkEvents', () => {
    const docs = generateNetworkEvents(NETWORK_VOLUME, WINDOW);
    const SUSPICIOUS_PORTS = [4444, 1337, 31337, 8888, 6667, 9001];

    it('produces exactly the requested volume', () => {
      expect(docs.length).toBe(NETWORK_VOLUME);
    });

    it('keeps every @timestamp within the window', () => {
      for (const doc of docs) {
        const ts = Date.parse(doc['@timestamp']);
        expect(ts).toBeGreaterThanOrEqual(WINDOW.startMs);
        expect(ts).toBeLessThanOrEqual(WINDOW.endMs);
      }
    });

    it('includes at least one unusual/suspicious destination port', () => {
      const hasUnusual = docs.some((d) => SUSPICIOUS_PORTS.includes(d.destination.port));
      expect(hasUnusual).toBe(true);
    });

    it('emits ECS-correct event metadata and valid enums', () => {
      for (const doc of docs) {
        expect(doc.event.category).toBe('network');
        expect(['inbound', 'outbound']).toContain(doc.network.direction);
        expect(['tcp', 'udp']).toContain(doc.network.transport);
        expect(doc.network.bytes).toBeGreaterThan(0);
      }
    });
  });
});
