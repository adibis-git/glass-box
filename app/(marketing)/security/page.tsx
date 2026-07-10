import type { Metadata } from "next";
import {
  Server,
  Lock,
  ShieldCheck,
  ScrollText,
  Boxes,
  TerminalSquare,
  EyeOff,
  Trash2,
} from "lucide-react";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Security & Trust — Glass Box",
  description:
    "How Glass Box protects your data: self-hosted architecture, RBAC on every request, audit logging, tenancy isolation, sandboxed code execution, and minimal context to the model.",
};

const CONTROLS = [
  {
    icon: Server,
    title: "Self-hosted architecture",
    body: "Runs on your infrastructure — Docker Compose or your VPC. Sources, workspace, and audit logs stay in your environment. No data egress by default.",
  },
  {
    icon: Lock,
    title: "Encryption in transit & at rest",
    body: "TLS for traffic and encryption at rest are provided through your hosting and storage provider, under keys you control.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC on every request",
    body: "OWNER / ADMIN / MEMBER / VIEWER roles are enforced in the database on each request — not just hidden in the UI.",
  },
  {
    icon: ScrollText,
    title: "Full audit logging",
    body: "Uploads, queries, code runs, guardrail blocks, shares, and deletions are all recorded to an append-only audit trail.",
  },
  {
    icon: Boxes,
    title: "Tenancy isolation",
    body: "Every record is scoped to its organization and workspace, so one tenant can never read another's sources or conversations.",
  },
  {
    icon: TerminalSquare,
    title: "Sandboxed code execution",
    body: "Analytical Python runs in a Pyodide / WebAssembly sandbox with no ambient network or filesystem access to your host.",
  },
  {
    icon: EyeOff,
    title: "Minimal context to the model",
    body: "The model sees a schema, a small sample, and cited passages — never the whole file. What reaches the model is deliberately bounded.",
  },
  {
    icon: Trash2,
    title: "Retention & hard deletion",
    body: "Configurable retention windows; deletions are hard deletes of the underlying records and derived artifacts, not soft flags.",
  },
];

export default function SecurityPage() {
  return (
    <LegalPage title="Security & Trust" lastUpdated="July 10, 2026">
      <LegalP>
        Glass Box is built for enterprise buyers who cannot paste sensitive data into a public
        chat window. The design goal is simple: your data never leaves your infrastructure, and
        every action is governed and auditable. This page summarizes the mechanisms Glass Box
        ships. It describes capabilities, not certifications — see the note on compliance below.
      </LegalP>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CONTROLS.map((c) => (
          <div key={c.title} className="rounded-2xl border border-border bg-panel p-6">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
              <c.icon size={18} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>

      <LegalSection title="Self-hosted by design">
        <LegalP>
          The core offering is a customized deployment on your own infrastructure. Postgres and a
          single application service run in your environment; uploaded sources live in your object
          storage. Because Glass Box is not a multi-tenant SaaS that ingests your files, there is
          no copy of your data on our servers to breach, subpoena, or mishandle.
        </LegalP>
      </LegalSection>

      <LegalSection title="Encryption">
        <LegalP>
          Traffic to and within the deployment is protected with TLS. Data at rest is encrypted
          through your hosting and storage provider using keys that you manage. Because you own
          the environment, you control key rotation, backup encryption, and network policy.
        </LegalP>
      </LegalSection>

      <LegalSection title="Access control and isolation">
        <LegalP>
          Access is governed by role — OWNER, ADMIN, MEMBER, and VIEWER — evaluated on every
          request at the data layer rather than merely hidden in the interface. Records are
          scoped to their organization and workspace so tenants remain isolated. Share links are
          revocable, and every grant and revocation is recorded.
        </LegalP>
      </LegalSection>

      <LegalSection title="Sandboxed execution and what reaches the model">
        <LegalP>
          Analytical code runs in a Pyodide / WebAssembly sandbox without ambient access to your
          host&apos;s network or filesystem. When the analyst needs the model, it sends only the
          minimum required context — a data schema, a small representative sample, and cited
          passages retrieved from your documents. It does not upload whole files to the model.
          Numeric results are grounded against the underlying computation before they appear in a
          report.
        </LegalP>
      </LegalSection>

      <LegalSection title="Audit, retention, and deletion">
        <LegalP>
          Every meaningful action lands in an append-only audit log for governance and incident
          review. Retention windows for sources, conversations, and logs are configurable to
          match your policies, and deletions are hard deletes of the underlying data and derived
          artifacts.
        </LegalP>
      </LegalSection>

      <LegalSection title="Compliance-ready, not a certification claim">
        <LegalP>
          Glass Box ships mechanisms that support your own compliance program — access control,
          audit logging, data residency through self-hosting, configurable retention, and
          minimized data flow to the model. We do not, on this page, claim SOC 2, HIPAA, ISO
          27001, or any other certification. Where your program requires it, these mechanisms are
          designed to help you meet your obligations under your own controls and assessments.
        </LegalP>
      </LegalSection>

      <LegalSection title="Responsible disclosure">
        <LegalP>
          If you believe you have found a security vulnerability, please report it privately
          through our <a href="/demo" className="text-accent underline">contact page</a> rather
          than disclosing it publicly, and enterprise customers may also use the security contact
          in their deployment agreement. We appreciate good-faith reports and will work to
          validate and remediate confirmed issues promptly.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
