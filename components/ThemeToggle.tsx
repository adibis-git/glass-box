"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sun/Moon theme toggle. Cycles light ↔ dark.
 * Mounted-guard avoids a hydration mismatch (server can't know the theme).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-foreground",
        className,
      )}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch. */}
      {mounted ? (
        isDark ? <Sun size={16} /> : <Moon size={16} />
      ) : (
        <Sun size={16} className="opacity-0" />
      )}
    </button>
  );
}
