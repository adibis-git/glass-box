"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/app/GlobalSearch";

// Longest-prefix wins — detail routes fall back to their parent label.
const LABELS: { prefix: string; label: string; exact?: boolean }[] = [
  { prefix: "/app/datasets", label: "Datasets" },
  { prefix: "/app/conversations", label: "Conversations" },
  { prefix: "/app/members", label: "Members" },
  { prefix: "/app/usage", label: "Usage" },
  { prefix: "/app/audit", label: "Audit log" },
  { prefix: "/app/settings", label: "Settings" },
  { prefix: "/app/admin/leads", label: "Leads" },
  { prefix: "/app", label: "Dashboard", exact: true },
];

function titleFor(pathname: string): string {
  for (const { prefix, label, exact } of LABELS) {
    if (exact ? pathname === prefix : pathname === prefix || pathname.startsWith(prefix + "/")) {
      return label;
    }
  }
  return "Dashboard";
}

/** Sticky top bar for the main app column — breadcrumb (left), search + theme
 * (right). Mirrors the marketing nav's sticky/blur treatment. */
export function TopBar({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const title = titleFor(pathname);

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <GlobalSearch orgId={orgId} variant="bar" enableHotkey />
        <ThemeToggle />
      </div>
    </div>
  );
}
