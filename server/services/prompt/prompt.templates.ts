/**
 * Few-shot prompt templates for the Query Copilot.
 *
 * This module holds curated few-shot examples — pairs of analyst requests and
 * the KQL they should produce — grouped by {@link InvestigationType}. The
 * {@link PromptTemplateRegistry} exposes read-only access to these examples so
 * that the prompt-assembly layer can inject the most relevant ones into a model
 * request without being able to mutate the shared catalogue.
 */

import type { InvestigationType } from '../../../common/types';

/** A single few-shot example: an analyst request paired with the KQL it should produce. */
export interface FewShotExample {
  readonly userQuery: string;
  readonly expectedKQL: string;
  readonly explanation: string;
}

/**
 * Curated few-shot examples keyed by investigation type.
 *
 * The {@link Record} type makes this map compile-time exhaustive: adding a new
 * {@link InvestigationType} without a corresponding entry here is a type error.
 */
const FEW_SHOT_EXAMPLES: Record<InvestigationType, readonly FewShotExample[]> = {
  brute_force: [
    {
      userQuery: 'Show failed login attempts for the administrator account',
      expectedKQL: 'event.category : "authentication" and event.outcome : "failure" and user.name : "administrator"',
      explanation: 'Returns failed authentication events targeting the administrator account; a high volume in a short window indicates a brute-force attempt.',
    },
    {
      userQuery: 'Find repeated failed SSH logins coming from a single source IP',
      expectedKQL: 'event.category : "authentication" and event.outcome : "failure" and process.name : "sshd" and source.ip : "198.51.100.23"',
      explanation: 'Failed SSH authentications from one source IP; repeated failures suggest password guessing.',
    },
  ],
  privilege_escalation: [
    {
      userQuery: 'Show successful sudo elevations to root',
      expectedKQL: 'process.name : "sudo" and user.effective.name : "root" and event.outcome : "success"',
      explanation: 'Successful privilege transitions where the effective user becomes root via sudo.',
    },
    {
      userQuery: 'Detect use of Windows runas targeting the Administrator account',
      expectedKQL: 'process.name : "runas.exe" and user.target.name : "Administrator"',
      explanation: 'runas executions targeting Administrator, a common Windows privilege-escalation technique.',
    },
  ],
  lateral_movement: [
    {
      userQuery: 'Find internal RDP connections',
      expectedKQL: 'network.protocol : "rdp" and destination.port : 3389 and network.direction : "internal"',
      explanation: 'Internal RDP sessions on port 3389; lateral movement frequently pivots over RDP.',
    },
    {
      userQuery: 'Show SMB traffic from a specific workstation',
      expectedKQL: 'destination.port : 445 and network.transport : "tcp" and source.ip : "10.10.5.20"',
      explanation: 'TCP SMB (445) originating from a workstation; remote share access can indicate lateral movement.',
    },
  ],
  suspicious_process: [
    {
      userQuery: 'Find command shells spawned by Office applications',
      expectedKQL: 'process.parent.name : ("winword.exe" or "excel.exe" or "outlook.exe") and process.name : ("cmd.exe" or "powershell.exe")',
      explanation: 'Command interpreters launched by Office apps, a hallmark of malicious macro execution.',
    },
    {
      userQuery: 'Detect processes executing from a temp directory',
      expectedKQL: 'event.category : "process" and process.working_directory : "/tmp"',
      explanation: 'Processes whose working directory is /tmp; execution from world-writable temp paths is often malicious.',
    },
  ],
  persistence: [
    {
      userQuery: 'Show new files created under cron directories',
      expectedKQL: 'event.category : "file" and event.action : "creation" and file.directory : "/etc/cron.d"',
      explanation: 'Creation of files in cron directories, a common Linux persistence mechanism.',
    },
    {
      userQuery: 'Detect creation of systemd service unit files',
      expectedKQL: 'event.action : "creation" and file.directory : "/etc/systemd/system" and file.extension : "service"',
      explanation: 'New systemd unit files can run attacker code at boot to establish persistence.',
    },
  ],
  unusual_outbound: [
    {
      userQuery: 'Find large outbound data transfers',
      expectedKQL: 'network.direction : "outbound" and destination.bytes >= 100000000',
      explanation: 'Outbound flows moving more than 100MB to a destination; large egress can indicate data exfiltration.',
    },
    {
      userQuery: 'Detect outbound DNS lookups to a suspicious domain',
      expectedKQL: 'network.direction : "outbound" and dns.question.name : "malicious-c2.example.com"',
      explanation: 'Outbound DNS resolution for a known-bad domain; periodic lookups suggest C2 beaconing.',
    },
  ],
  suspicious_powershell: [
    {
      userQuery: 'Find PowerShell run with an encoded command',
      expectedKQL: 'process.name : "powershell.exe" and process.command_line : *enc*',
      explanation: 'PowerShell invoked with an encoded command, used to obfuscate malicious scripts.',
    },
    {
      userQuery: 'Detect PowerShell download cradles',
      expectedKQL: 'process.name : "powershell.exe" and process.command_line : *DownloadString*',
      explanation: 'PowerShell command lines containing a download cradle, common in fileless attacks.',
    },
  ],
  auth_anomaly: [
    {
      userQuery: 'Show successful logins for a user from an unexpected country',
      expectedKQL: 'event.category : "authentication" and event.outcome : "success" and user.name : "jdoe" and source.geo.country_name : "North Korea"',
      explanation: 'Successful authentications for a user sourced from an unusual country — an access anomaly.',
    },
    {
      userQuery: 'Find successful authentications over an admin protocol',
      expectedKQL: 'event.category : "authentication" and event.outcome : "success" and network.protocol : "rdp"',
      explanation: 'Successful RDP authentications; correlate with source.ip to spot anomalous access.',
    },
  ],
  failed_login: [
    {
      userQuery: 'Show all failed logins',
      expectedKQL: 'event.category : "authentication" and event.outcome : "failure"',
      explanation: 'All authentication failures across the environment; the baseline for failed-login monitoring.',
    },
    {
      userQuery: 'Failed logins for a service account on a specific host',
      expectedKQL: 'event.category : "authentication" and event.outcome : "failure" and user.name : "svc_backup" and host.name : "DB01"',
      explanation: 'Failed authentications for a service account on one host, which should rarely fail to log in.',
    },
  ],
  parent_child_anomaly: [
    {
      userQuery: 'Find command shells spawned by a web server process',
      expectedKQL: 'process.parent.name : ("w3wp.exe" or "httpd" or "nginx") and process.name : "cmd.exe"',
      explanation: 'A web server spawning a command shell suggests web-shell exploitation.',
    },
    {
      userQuery: 'Detect PowerShell launched by services.exe',
      expectedKQL: 'process.parent.name : "services.exe" and process.name : "powershell.exe"',
      explanation: 'Unusual parent-child lineage; services.exe spawning PowerShell is atypical and worth review.',
    },
  ],
  threat_hunting: [
    {
      userQuery: 'Hunt for HTTP POSTs to a suspect IP',
      expectedKQL: 'destination.ip : "203.0.113.66" and network.protocol : "http" and http.request.method : "POST"',
      explanation: 'HTTP POSTs to a suspect destination IP; a useful starting point for hunting C2 over HTTP.',
    },
    {
      userQuery: 'Pivot on a specific executable hash across hosts',
      expectedKQL: 'event.category : "process" and process.hash.sha256 : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"',
      explanation: 'Find every host that executed a specific binary by its SHA-256 hash.',
    },
  ],
  general: [
    {
      userQuery: 'Show all events from host web01',
      expectedKQL: 'host.name : "web01"',
      explanation: 'All events associated with a specific host.',
    },
    {
      userQuery: 'Find events involving a specific IP as source or destination',
      expectedKQL: 'source.ip : "192.168.1.50" or destination.ip : "192.168.1.50"',
      explanation: 'Events where the IP appears as either the source or the destination.',
    },
  ],
};

/**
 * Read-only registry over the curated few-shot examples.
 *
 * Instantiable to match the plugin's `PricingRegistry` pattern. All accessors
 * return fresh array copies so callers cannot mutate the shared catalogue.
 */
export class PromptTemplateRegistry {
  /** Returns the few-shot examples for an investigation type (empty array if none configured). */
  public getFewShotExamples(investigationType: InvestigationType): FewShotExample[] {
    const examples = FEW_SHOT_EXAMPLES[investigationType] ?? [];
    return [...examples];
  }

  /** Returns every configured example across all investigation types. */
  public getAllExamples(): FewShotExample[] {
    return Object.values(FEW_SHOT_EXAMPLES).flatMap((examples) => [...examples]);
  }
}
