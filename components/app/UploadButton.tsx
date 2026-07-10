"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function UploadButton({ orgId }: { orgId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/orgs/${orgId}/datasets`, { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? `Upload failed (${res.status})`);
        return;
      }
      router.refresh();
      if (j.dataset?.id) router.push(`/app/datasets/${j.dataset.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls,.pdf,.docx,.doc,.txt,.md,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <Button variant="primary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? (
          "Uploading…"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Upload size={15} /> Upload CSV / Excel / PDF / DOCX
          </span>
        )}
      </Button>
      {error && <span className="text-xs text-red">{error}</span>}
    </div>
  );
}
