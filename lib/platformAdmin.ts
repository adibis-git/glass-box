// Platform operator (super-admin) allowlist — the people who RUN this deployment,
// which is distinct from a workspace OWNER/ADMIN. A workspace owner governs their
// own org's data; a platform admin governs the deployment itself (e.g. the global
// marketing-leads inbox). Every signup becomes an OWNER of their personal
// workspace, so org role must NOT gate platform-level surfaces.
//
// Configured via the PLATFORM_ADMIN_EMAILS env var (comma-separated, case-insensitive).
// Example: PLATFORM_ADMIN_EMAILS="adityabiswas15@gmail.com,ops@yourco.com"

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email?: string | null): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase());
}
