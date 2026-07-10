import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { AppShell } from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveOrg();
  if (!ctx) redirect("/login");
  if (!ctx.active) {
    // Signed in but no org (shouldn't happen — signup creates one). Recover politely.
    redirect("/signup");
  }

  return (
    <AppShell
      orgs={ctx.orgs}
      active={ctx.active}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
      canSeeLeads={isPlatformAdmin(ctx.userEmail)}
    >
      {children}
    </AppShell>
  );
}
