"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setState("busy");
    setError(null);
    const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Not signed in — send through login/signup with return path.
      router.push(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    if (!res.ok) {
      setError(j.error ?? "Could not accept the invitation.");
      setState("error");
      return;
    }
    setState("done");
    setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 800);
  }

  return (
    <AuthShell
      title="Join workspace"
      subtitle="You've been invited to collaborate on Glass Box"
      footer={
        <>
          Don&apos;t have an account yet?{" "}
          <Link href={`/signup`} className="text-accent hover:underline">
            Create one first
          </Link>
          , then reopen this link.
        </>
      }
    >
      {state === "done" ? (
        <p className="text-sm text-green">You&apos;re in! Redirecting to the workspace…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Accepting adds this workspace to your account with the role your inviter chose. Your
            access is enforced by that role and every action is recorded in the workspace audit log.
          </p>
          {error && <p className="text-xs text-red">{error}</p>}
          <Button variant="primary" className="w-full" onClick={accept} disabled={state === "busy"}>
            {state === "busy" ? "Joining…" : "Accept invitation"}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
