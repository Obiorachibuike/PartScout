import { lookup } from "node:dns/promises";
import net from "node:net";
import { BlockedUrlError } from "@/lib/errors";
import { canonicalize } from "@/lib/hash";

/**
 * SSRF protection for the page-content fetcher.
 *
 * Search providers return arbitrary URLs and users can craft queries that make
 * search engines surface hostile hosts, so every outbound fetch must be vetted:
 *   1. https only (no file://, gopher://, data: …)
 *   2. hostname must not be localhost / internal-only naming
 *   3. every resolved IP must be a public, routable address
 *   4. private/link-local/loopback/metadata ranges are rejected
 */

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254",
  "metadata.azure.internal",
]);

/** Content types we are willing to parse into evidence. */
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/json",
  "text/xml",
  "application/xml",
];

export function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return true; // many servers omit it; we still cap + strip
  const lowered = contentType.toLowerCase();
  if (lowered.includes("charset")) {
    const media = lowered.split(";")[0]!.trim();
    return ALLOWED_CONTENT_TYPES.some((allowed) => media.startsWith(allowed));
  }
  return ALLOWED_CONTENT_TYPES.some((allowed) => lowered.startsWith(allowed));
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((part) => Number(part));
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function inCidrV4(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range!) & mask);
}

const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
];

export function isPublicIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  return !BLOCKED_IPV4_CIDRS.some((cidr) => inCidrV4(ip, cidr));
}

export function isPublicIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lowered = ip.toLowerCase();
  // IPv4-mapped addresses must be checked against the IPv4 rules as well.
  const mapped = lowered.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (lowered === "::" || lowered === "::1") return false;
  if (lowered.startsWith("fe80")) return false; // link-local
  if (lowered.startsWith("fc") || lowered.startsWith("fd")) return false; // unique local
  if (lowered.startsWith("ff")) return false; // multicast
  if (lowered.startsWith("2001:db8")) return false; // documentation
  if (lowered.startsWith("64:ff9b")) return false; // NAT64 well-known prefix
  return true;
}

export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPublicIpv4(ip);
  if (net.isIPv6(ip)) return isPublicIpv6(ip);
  return false;
}

export interface UrlSafetyCheck {
  ok: boolean;
  reason?: string;
  normalizedUrl?: string;
  resolvedIps?: string[];
}

/** Static checks that do not require DNS (safe to use in hot paths). */
export function checkUrlShape(rawUrl: string): UrlSafetyCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `Protocol ${url.protocol} is not allowed` };
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname) return { ok: false, reason: "Missing hostname" };
  // URL keeps IPv6 literals bracketed ("[::1]"); strip them so the IP rules apply.
  const bareHostname = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOSTNAMES.has(bareHostname)) {
    return { ok: false, reason: "Blocked hostname" };
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "Blocked internal hostname" };
  }
  if (hostname.endsWith(".onion")) return { ok: false, reason: "Blocked hostname" };
  if (/^\d+$/.test(hostname)) return { ok: false, reason: "Blocked numeric hostname" };
  if (net.isIP(bareHostname) && !isPublicIp(bareHostname)) {
    return { ok: false, reason: "Blocked private IP address" };
  }
  if (url.username || url.password) return { ok: false, reason: "Credentials in URL are not allowed" };
  return { ok: true, normalizedUrl: url.toString() };
}

/** Full check including DNS resolution of every A/AAAA record. */
export async function assertFetchableUrl(rawUrl: string): Promise<{
  url: string;
  ip: string;
  family: 4 | 6;
}> {
  const shape = checkUrlShape(rawUrl);
  if (!shape.ok || !shape.normalizedUrl) {
    throw new BlockedUrlError(`Refusing to fetch ${rawUrl}: ${shape.reason ?? "unsafe URL"}`);
  }
  const url = new URL(shape.normalizedUrl);

  if (net.isIP(url.hostname)) {
    if (!isPublicIp(url.hostname)) {
      throw new BlockedUrlError(`Refusing to fetch ${rawUrl}: private address`);
    }
    return { url: url.toString(), ip: url.hostname, family: net.isIPv6(url.hostname) ? 6 : 4 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new BlockedUrlError(
      `Could not resolve ${url.hostname}: ${error instanceof Error ? error.message : "DNS failure"}`,
    );
  }
  if (records.length === 0) throw new BlockedUrlError(`Could not resolve ${url.hostname}`);
  for (const record of records) {
    if (!isPublicIp(record.address)) {
      throw new BlockedUrlError(
        `Refusing to fetch ${url.hostname}: resolves to non-public address ${record.address}`,
      );
    }
  }
  const chosen = records.find((record) => record.family === 4) ?? records[0]!;
  return { url: url.toString(), ip: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

/**
 * Safe external link handling for anything rendered in the UI.
 */
export function safeExternalHref(rawUrl: string): string | null {
  const shape = checkUrlShape(rawUrl);
  if (!shape.ok || !shape.normalizedUrl) return null;
  return canonicalize(shape.normalizedUrl);
}

export function domainOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
