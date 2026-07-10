// Shared chrome for every public marketing/legal/blog page: a sticky nav and the
// full footer. The /app product surface has its own AppShell and is unaffected —
// this route group only wraps the anonymous, lead-gen-facing pages.

import { auth } from "@/lib/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
