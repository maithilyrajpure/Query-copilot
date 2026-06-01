/**
 * ECS (Elastic Common Schema) field registry for the query copilot.
 *
 * This module exposes a static, in-memory catalogue of the ECS fields that are
 * most relevant to security investigations. It is intentionally a curated
 * subset of the full ECS specification — only the fields the copilot needs in
 * order to reason about, suggest, and validate queries for the supported
 * investigation types.
 *
 * Type/category reuse decision:
 *   The registry deliberately reuses the canonical {@link ECSField} contract
 *   (and the {@link ECSFieldCategory} union) defined in `common/types` and
 *   `common/constants` rather than declaring its own parallel shapes. This
 *   keeps the server-side registry structurally identical to the types the
 *   rest of the plugin (including the client) already consumes, so a field
 *   produced here can flow across the wire without translation and any change
 *   to the canonical contract is enforced here at compile time.
 *
 * The dataset is frozen at module load and exposed through the
 * {@link ECSRegistry} class, which provides cheap lookups by category,
 * investigation type, and exact field name.
 */

import type { ECSField, InvestigationType } from '../../../common/types';
import type { ECSFieldCategory } from '../../../common/constants';

/**
 * Curated catalogue of ECS fields, grouped by category. Frozen so consumers
 * cannot mutate the shared registry.
 */
const ECS_FIELDS: readonly ECSField[] = Object.freeze([
  // ── BASE ──
  {
    name: '@timestamp',
    type: 'date',
    category: 'base',
    description:
      'Date and time when the event originated; the primary event time field.',
    isRequired: true,
    isMultiValue: false,
    normalizationLevel: 'core',
  },

  // ── EVENT ──
  {
    name: 'event.action',
    type: 'keyword',
    category: 'event',
    description:
      'The action captured by the event (e.g. "user-login", "file-created").',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.category',
    type: 'keyword',
    category: 'event',
    description:
      'High-level event categorization used for filtering (e.g. authentication, process, network).',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'core',
  },
  {
    name: 'event.type',
    type: 'keyword',
    category: 'event',
    description:
      'Event sub-categorization that refines event.category (e.g. start, end, denied).',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'core',
  },
  {
    name: 'event.outcome',
    type: 'keyword',
    category: 'event',
    description:
      'Result of the transaction the event describes: success, failure, or unknown.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.kind',
    type: 'keyword',
    category: 'event',
    description:
      'High-level bucket of the event: event, alert, metric, state, or signal.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.dataset',
    type: 'keyword',
    category: 'event',
    description: 'Name of the dataset the event originates from.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.module',
    type: 'keyword',
    category: 'event',
    description: 'Name of the module that generated the event.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.severity',
    type: 'long',
    category: 'event',
    description: 'Numeric severity of the event as reported by the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.code',
    type: 'keyword',
    category: 'event',
    description: 'Source-specific event code (e.g. Windows Event ID 4625).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'event.id',
    type: 'keyword',
    category: 'event',
    description: 'Unique identifier of the event.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'event.provider',
    type: 'keyword',
    category: 'event',
    description: 'Source or subsystem that produced the event.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'event.created',
    type: 'date',
    category: 'event',
    description:
      'Time the event was first captured by the collecting agent or pipeline.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },

  // ── SOURCE ──
  {
    name: 'source.ip',
    type: 'ip',
    category: 'source',
    description: 'IP address of the source of the connection or event.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.port',
    type: 'long',
    category: 'source',
    description: 'Port of the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.address',
    type: 'keyword',
    category: 'source',
    description:
      'Source address before resolution (IP, hostname, or domain).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'source.domain',
    type: 'keyword',
    category: 'source',
    description: 'Domain associated with the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'source.bytes',
    type: 'long',
    category: 'source',
    description: 'Bytes sent from the source to the destination.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.packets',
    type: 'long',
    category: 'source',
    description: 'Packets sent from the source to the destination.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.mac',
    type: 'keyword',
    category: 'source',
    description: 'MAC address of the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.user.name',
    type: 'keyword',
    category: 'source',
    description: 'Short name of the user associated with the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'source.geo.country_name',
    type: 'keyword',
    category: 'source',
    description: 'Country name resolved from the source IP.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── DESTINATION ──
  {
    name: 'destination.ip',
    type: 'ip',
    category: 'destination',
    description: 'IP address of the destination of the connection or event.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'destination.port',
    type: 'long',
    category: 'destination',
    description: 'Port of the destination.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'destination.address',
    type: 'keyword',
    category: 'destination',
    description:
      'Destination address before resolution (IP, hostname, or domain).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'destination.domain',
    type: 'keyword',
    category: 'destination',
    description: 'Domain associated with the destination.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'destination.bytes',
    type: 'long',
    category: 'destination',
    description: 'Bytes sent from the destination to the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'destination.packets',
    type: 'long',
    category: 'destination',
    description: 'Packets sent from the destination to the source.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'destination.mac',
    type: 'keyword',
    category: 'destination',
    description: 'MAC address of the destination.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'destination.geo.country_name',
    type: 'keyword',
    category: 'destination',
    description: 'Country name resolved from the destination IP.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── PROCESS ──
  {
    name: 'process.name',
    type: 'keyword',
    category: 'process',
    description: 'Name of the process executable (basename).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'process.pid',
    type: 'long',
    category: 'process',
    description: 'Process identifier (PID).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'process.ppid',
    type: 'long',
    category: 'process',
    description: 'Parent process identifier (PPID).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.args',
    type: 'keyword',
    category: 'process',
    description: 'Array of process command-line arguments.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.command_line',
    type: 'keyword',
    category: 'process',
    description: 'Full command line that started the process.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.executable',
    type: 'keyword',
    category: 'process',
    description: 'Absolute path to the process executable.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.working_directory',
    type: 'keyword',
    category: 'process',
    description: 'Working directory of the process.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.start',
    type: 'date',
    category: 'process',
    description: 'Time the process started.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.entity_id',
    type: 'keyword',
    category: 'process',
    description:
      'Unique identifier of the process across restarts and PID reuse.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.parent.name',
    type: 'keyword',
    category: 'process',
    description: 'Name of the parent process executable.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.parent.pid',
    type: 'long',
    category: 'process',
    description: 'Parent process identifier.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.parent.executable',
    type: 'keyword',
    category: 'process',
    description: 'Absolute path to the parent process executable.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'process.hash.sha256',
    type: 'keyword',
    category: 'process',
    description: 'SHA-256 hash of the process executable.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── USER ──
  {
    name: 'user.name',
    type: 'keyword',
    category: 'user',
    description: 'Short name or login of the user.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'user.id',
    type: 'keyword',
    category: 'user',
    description: 'Unique identifier of the user.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'user.domain',
    type: 'keyword',
    category: 'user',
    description: 'Domain the user belongs to.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'user.email',
    type: 'keyword',
    category: 'user',
    description: 'Email address of the user.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'user.full_name',
    type: 'keyword',
    category: 'user',
    description: 'Full name of the user.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'user.hash',
    type: 'keyword',
    category: 'user',
    description:
      'Unique user hash for correlation when name or id is unavailable.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'user.roles',
    type: 'keyword',
    category: 'user',
    description: 'Array of roles assigned to the user.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'extended',
  },
  {
    name: 'user.effective.name',
    type: 'keyword',
    category: 'user',
    description:
      'Short name of the effective user after a privilege change (su, runas, sudo).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'user.target.name',
    type: 'keyword',
    category: 'user',
    description:
      'Short name of the target user an action was performed against.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── HOST ──
  {
    name: 'host.name',
    type: 'keyword',
    category: 'host',
    description:
      'Name of the host as configured or reported by the hostname command.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'host.hostname',
    type: 'keyword',
    category: 'host',
    description: 'Hostname of the host as reported by the operating system.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'host.id',
    type: 'keyword',
    category: 'host',
    description: 'Unique host identifier.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'host.ip',
    type: 'ip',
    category: 'host',
    description: 'Array of IP addresses assigned to the host.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'core',
  },
  {
    name: 'host.mac',
    type: 'keyword',
    category: 'host',
    description: 'Array of MAC addresses of the host.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'core',
  },
  {
    name: 'host.domain',
    type: 'keyword',
    category: 'host',
    description: 'Domain the host belongs to.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'host.architecture',
    type: 'keyword',
    category: 'host',
    description: 'CPU architecture of the host.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'host.os.name',
    type: 'keyword',
    category: 'host',
    description: 'Operating system name.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'host.os.version',
    type: 'keyword',
    category: 'host',
    description: 'Operating system version.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'host.os.family',
    type: 'keyword',
    category: 'host',
    description:
      'Operating system family (e.g. windows, debian, redhat).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'host.os.type',
    type: 'keyword',
    category: 'host',
    description:
      'Operating system type: windows, linux, macos, unix, etc.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── NETWORK ──
  {
    name: 'network.direction',
    type: 'keyword',
    category: 'network',
    description:
      'Direction of network traffic: inbound, outbound, internal, or external.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.protocol',
    type: 'keyword',
    category: 'network',
    description: 'Application-layer (L7) protocol such as http, dns, or ssh.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.transport',
    type: 'keyword',
    category: 'network',
    description: 'Transport-layer (L4) protocol such as tcp or udp.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.type',
    type: 'keyword',
    category: 'network',
    description: 'Network-layer (L3) protocol such as ipv4 or ipv6.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.bytes',
    type: 'long',
    category: 'network',
    description: 'Total bytes transferred in both directions.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.packets',
    type: 'long',
    category: 'network',
    description: 'Total packets transferred in both directions.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'core',
  },
  {
    name: 'network.community_id',
    type: 'keyword',
    category: 'network',
    description:
      'Community ID flow hash used to correlate network events.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'network.iana_number',
    type: 'keyword',
    category: 'network',
    description: 'IANA protocol number of the transport protocol.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'network.application',
    type: 'keyword',
    category: 'network',
    description: 'Application identified for the network traffic.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── FILE ──
  {
    name: 'file.name',
    type: 'keyword',
    category: 'file',
    description:
      'Name of the file including extension, without the directory.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.path',
    type: 'keyword',
    category: 'file',
    description: 'Full path to the file, including the file name.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.directory',
    type: 'keyword',
    category: 'file',
    description: 'Directory containing the file, without the file name.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.extension',
    type: 'keyword',
    category: 'file',
    description: 'File extension, excluding the leading dot.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.size',
    type: 'long',
    category: 'file',
    description: 'Size of the file in bytes.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.type',
    type: 'keyword',
    category: 'file',
    description: 'File type: file, dir, or symlink.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.created',
    type: 'date',
    category: 'file',
    description: 'File creation time.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.mtime',
    type: 'date',
    category: 'file',
    description: 'Last time the file content was modified.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.accessed',
    type: 'date',
    category: 'file',
    description: 'Last time the file was accessed.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.hash.sha256',
    type: 'keyword',
    category: 'file',
    description: 'SHA-256 hash of the file.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'file.hash.md5',
    type: 'keyword',
    category: 'file',
    description: 'MD5 hash of the file.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── DNS ──
  {
    name: 'dns.question.name',
    type: 'keyword',
    category: 'dns',
    description: 'Name of the record being queried.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.question.type',
    type: 'keyword',
    category: 'dns',
    description: 'Type of record being queried (e.g. A, AAAA, MX, TXT).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.question.registered_domain',
    type: 'keyword',
    category: 'dns',
    description:
      'Registered domain (eTLD plus one label) of the queried name.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.answers.data',
    type: 'keyword',
    category: 'dns',
    description: 'Array of answer-record data returned by the resolver.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.resolved_ip',
    type: 'ip',
    category: 'dns',
    description: 'Array of IP addresses the query resolved to.',
    isRequired: false,
    isMultiValue: true,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.response_code',
    type: 'keyword',
    category: 'dns',
    description:
      'DNS response code (e.g. NOERROR, NXDOMAIN, SERVFAIL).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.type',
    type: 'keyword',
    category: 'dns',
    description: 'Whether the DNS message is a query or an answer.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'dns.id',
    type: 'keyword',
    category: 'dns',
    description: 'DNS transaction identifier.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── HTTP ──
  {
    name: 'http.request.method',
    type: 'keyword',
    category: 'http',
    description: 'HTTP request method (e.g. GET, POST).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.request.bytes',
    type: 'long',
    category: 'http',
    description:
      'Total size in bytes of the HTTP request including headers and body.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.request.referrer',
    type: 'keyword',
    category: 'http',
    description: 'Referrer of the HTTP request.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.request.body.bytes',
    type: 'long',
    category: 'http',
    description: 'Size in bytes of the HTTP request body.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.response.status_code',
    type: 'long',
    category: 'http',
    description: 'HTTP response status code (e.g. 200, 404, 500).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.response.bytes',
    type: 'long',
    category: 'http',
    description:
      'Total size in bytes of the HTTP response including headers and body.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.response.body.bytes',
    type: 'long',
    category: 'http',
    description: 'Size in bytes of the HTTP response body.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.response.mime_type',
    type: 'keyword',
    category: 'http',
    description: 'MIME type of the HTTP response body.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'http.version',
    type: 'keyword',
    category: 'http',
    description: 'HTTP version used in the exchange (e.g. 1.1, 2).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },

  // ── TLS ──
  {
    name: 'tls.version',
    type: 'keyword',
    category: 'tls',
    description: 'Numeric TLS version of the connection (e.g. 1.2, 1.3).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.version_protocol',
    type: 'keyword',
    category: 'tls',
    description: 'Protocol name of the secure connection (e.g. tls, ssl).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.cipher',
    type: 'keyword',
    category: 'tls',
    description: 'Cipher suite negotiated for the connection.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.established',
    type: 'boolean',
    category: 'tls',
    description: 'Whether a TLS connection was successfully established.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.resumed',
    type: 'boolean',
    category: 'tls',
    description:
      'Whether the TLS connection was resumed from a previous session.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.next_protocol',
    type: 'keyword',
    category: 'tls',
    description:
      'Application-layer protocol negotiated via ALPN (e.g. http/1.1, h2).',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.client.server_name',
    type: 'keyword',
    category: 'tls',
    description:
      'Server Name Indication (SNI) hostname requested by the client.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.client.ja3',
    type: 'keyword',
    category: 'tls',
    description: 'JA3 fingerprint of the TLS client.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.server.ja3s',
    type: 'keyword',
    category: 'tls',
    description: 'JA3S fingerprint of the TLS server.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
  {
    name: 'tls.server.issuer',
    type: 'keyword',
    category: 'tls',
    description:
      'Distinguished name of the issuer of the server certificate.',
    isRequired: false,
    isMultiValue: false,
    normalizationLevel: 'extended',
  },
]);

/**
 * Maps each supported {@link InvestigationType} to the ordered list of ECS
 * field categories most relevant to that investigation. The `Record` key type
 * makes this exhaustive: every `InvestigationType` value must appear here, or
 * the file fails to compile.
 *
 * The string literals used as category values are valid
 * {@link ECSFieldCategory} members.
 */
export const INVESTIGATION_TYPE_CATEGORIES: Record<
  InvestigationType,
  readonly ECSFieldCategory[]
> = {
  brute_force: ['event', 'source', 'destination', 'user', 'host', 'base'],
  privilege_escalation: ['process', 'user', 'host', 'event', 'base'],
  lateral_movement: [
    'source',
    'destination',
    'network',
    'user',
    'host',
    'event',
    'base',
  ],
  suspicious_process: ['process', 'user', 'host', 'event', 'base'],
  persistence: ['process', 'file', 'event', 'user', 'host', 'base'],
  unusual_outbound: [
    'destination',
    'source',
    'network',
    'dns',
    'process',
    'host',
    'base',
  ],
  suspicious_powershell: ['process', 'user', 'host', 'event', 'base'],
  auth_anomaly: ['user', 'source', 'event', 'host', 'base'],
  failed_login: ['user', 'source', 'event', 'host', 'base'],
  parent_child_anomaly: ['process', 'host', 'event', 'base'],
  threat_hunting: [
    'event',
    'network',
    'dns',
    'http',
    'tls',
    'host',
    'user',
    'process',
    'base',
  ],
  general: ['event', 'host', 'user', 'source', 'base'],
};

/**
 * Index of field name → field, built once at module load so
 * {@link ECSRegistry.getFieldByName} can resolve in O(1).
 */
const FIELDS_BY_NAME: ReadonlyMap<string, ECSField> = new Map(
  ECS_FIELDS.map((field) => [field.name, field] as const)
);

/**
 * Static accessor for the curated ECS field registry.
 *
 * All methods are static — the registry is a singleton, immutable dataset and
 * holds no per-instance state.
 */
export class ECSRegistry {
  /**
   * Returns all registered ECS fields.
   *
   * @returns The full, frozen list of registry fields.
   */
  static getAllFields(): readonly ECSField[] {
    return ECS_FIELDS;
  }

  /**
   * Returns all fields whose category equals the given category.
   *
   * @param category - The ECS category name to match (e.g. `'process'`).
   * @returns A new array of matching fields; empty if the category is unknown.
   */
  static getFieldsByCategory(category: string): ECSField[] {
    return ECS_FIELDS.filter((field) => field.category === category);
  }

  /**
   * Maps an investigation type to its relevant ECS categories, then returns
   * every registry field belonging to one of those categories.
   *
   * @param type - The investigation type to resolve fields for.
   * @returns A new array of fields relevant to the investigation type; empty
   *   if the type has no configured categories.
   */
  static getFieldsByInvestigationType(type: InvestigationType): ECSField[] {
    const categories = INVESTIGATION_TYPE_CATEGORIES[type] ?? [];
    const categorySet = new Set<ECSFieldCategory>(categories);
    return ECS_FIELDS.filter((field) =>
      categorySet.has(field.category)
    );
  }

  /**
   * Returns the relevant ECS categories for an investigation type.
   *
   * @param type - The investigation type to resolve categories for.
   * @returns The ordered, read-only list of categories; empty if none are
   *   configured for the type.
   */
  static getCategoriesForInvestigationType(
    type: InvestigationType
  ): readonly ECSFieldCategory[] {
    return INVESTIGATION_TYPE_CATEGORIES[type] ?? [];
  }

  /**
   * Returns a single field by exact name.
   *
   * @param name - The exact ECS field name (e.g. `'source.ip'`).
   * @returns The matching field, or `undefined` if no field has that name.
   */
  static getFieldByName(name: string): ECSField | undefined {
    return FIELDS_BY_NAME.get(name);
  }
}
