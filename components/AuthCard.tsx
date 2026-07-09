"use client";

import Link from "next/link";
import * as React from "react";
import { ScanSearch } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
            <ScanSearch size={18} />
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">Glass Box</span>
        </Link>
        <div className="rounded-2xl border border-border bg-panel p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input
        {...props}
        className="h-10 w-full rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/60"
      />
    </label>
  );
}
