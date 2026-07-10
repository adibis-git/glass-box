import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Glass Box",
  description:
    "How Glass Box collects, uses, retains, and protects data. In self-hosted deployments the customer is the data controller and data stays on their own infrastructure.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 10, 2026">
      <LegalP>
        This Privacy Policy describes how Glass Box (&ldquo;Glass Box,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;) handles information in connection with our website, our hosted trial
        environment, and the self-hosted software we license to customers. Glass Box is a
        governed AI analyst that reasons over your spreadsheets and documents. It is
        self-hosted by design: in a customer deployment, your data lives on your own
        infrastructure and does not leave it.
      </LegalP>

      <LegalSection title="1. Who is the controller of your data">
        <LegalP>
          The controller depends on how you use Glass Box:
        </LegalP>
        <LegalList
          items={[
            <>
              <strong>Self-hosted deployments.</strong> When Glass Box runs on your own
              infrastructure, <em>you</em> are the data controller for the account, workspace,
              and source data you process. Glass Box does not receive or store that content.
            </>,
            <>
              <strong>This marketing website and hosted trial.</strong> Glass Box acts as the
              controller for information you submit to us directly — for example, a lead form,
              a demo request, or a hosted 10-day trial workspace we operate on your behalf.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <LegalList
          items={[
            <>
              <strong>Account information.</strong> Name, work email, organization, role, and
              authentication identifiers used to create and secure your account.
            </>,
            <>
              <strong>Workspace and organization data.</strong> Team and membership records,
              role assignments (OWNER / ADMIN / MEMBER / VIEWER), and workspace configuration.
            </>,
            <>
              <strong>Uploaded sources.</strong> Spreadsheets, documents, and files you upload
              for analysis, together with their derived profiles and versions. In a self-hosted
              deployment these remain on your infrastructure and are not transmitted to us.
            </>,
            <>
              <strong>Usage and audit logs.</strong> Records of actions taken in the product —
              uploads, queries, code runs, guardrail decisions, share events, and deletions —
              retained to support governance, security, and troubleshooting.
            </>,
            <>
              <strong>Lead form submissions.</strong> Information you voluntarily provide when
              you request a demo, contact sales, or subscribe to updates.
            </>,
            <>
              <strong>Technical data.</strong> Standard log data such as IP address, browser
              type, and timestamps collected when you interact with our website.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. How we use information">
        <LegalList
          items={[
            "To provide, secure, and operate the service and your workspace.",
            "To enforce role-based access control and produce audit trails.",
            "To respond to demo requests, sales inquiries, and support requests.",
            "To improve reliability and performance, and to detect and prevent abuse.",
            "To comply with legal obligations and enforce our agreements.",
          ]}
        />
        <LegalP>
          We do not use the contents of your uploaded sources to train foundation models, and
          we do not sell personal information.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Self-hosting and data residency">
        <LegalP>
          The core offering is a customized, self-hosted deployment. When you run Glass Box on
          your own infrastructure, your account data, workspace records, uploaded sources, and
          audit logs are stored in your environment (for example, your Postgres instance and
          object storage). Glass Box has no visibility into, and does not receive copies of,
          that content. You control retention, backups, encryption keys, and deletion.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. Sharing and subprocessors">
        <LegalP>
          We do not sell personal information and do not share it with third parties for their
          own marketing. We rely on a limited set of subprocessors to operate our website and
          hosted trial. The most significant is the model provider:
        </LegalP>
        <LegalList
          items={[
            <>
              <strong>Model provider (Anthropic).</strong> When you use a hosted mode, the
              minimum context required to answer a question — such as a data schema, a small
              sample, or cited passages — is sent to the model provider to generate a response.
              In a self-hosted deployment, this call originates from your infrastructure under
              your own provider credentials, and Glass Box is not an intermediary.
            </>,
            "Infrastructure and email providers used solely to run our website, trial environment, and transactional communications.",
          ]}
        />
        <LegalP>
          We may also disclose information where required by law or to protect our rights,
          users, or the public.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Retention and deletion">
        <LegalP>
          Retention is configurable. In self-hosted deployments you set retention windows for
          sources, conversations, and audit logs to match your own policies. When data is
          deleted through the product, Glass Box performs a hard delete of the underlying
          records and derived artifacts rather than a soft flag. For information we hold
          directly (such as lead submissions), we retain it only as long as necessary for the
          purpose it was collected or as required by law.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Security">
        <LegalP>
          We apply administrative, technical, and organizational measures appropriate to the
          risk, including role-based access control enforced on every request, audit logging,
          tenancy isolation, and sandboxed code execution. Encryption in transit and at rest is
          provided through your hosting provider in a self-hosted deployment. See our{" "}
          <a
            href="/security"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            Security &amp; Trust
          </a>{" "}
          page for detail. No system can be guaranteed perfectly secure.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Your rights">
        <LegalP>
          Depending on your jurisdiction, you may have the right to access, rectify, or erase
          your personal information, to restrict or object to certain processing, and to data
          portability. For self-hosted deployments, your organization administers these rights
          directly through the product. For information we hold, contact us using the details
          below and we will respond consistent with applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. International transfers">
        <LegalP>
          For our website and hosted trial, information may be processed in countries other than
          where you reside. Where required, we rely on appropriate safeguards such as standard
          contractual clauses. In a self-hosted deployment, data residency is determined by
          where you choose to run the software.
        </LegalP>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <LegalP>
          We may update this policy from time to time. Material changes will be reflected by an
          updated &ldquo;Last updated&rdquo; date, and, where appropriate, additional notice.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. Contact">
        <LegalP>
          Questions about this policy or your data can be directed to your Glass Box account
          contact or to the privacy contact designated in your deployment agreement. Replace
          this line with your organization&apos;s designated privacy contact and address.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
