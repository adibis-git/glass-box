import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Data Processing Addendum — Glass Box",
  description:
    "A template Data Processing Addendum for Glass Box covering roles, processing details, subprocessors, security, data subject requests, breach notification, and transfers.",
};

export default function DpaPage() {
  return (
    <LegalPage title="Data Processing Addendum" lastUpdated="July 10, 2026">
      <LegalP>
        This Data Processing Addendum (&ldquo;DPA&rdquo;) supplements the agreement between the
        customer (&ldquo;Customer&rdquo;) and Glass Box governing use of the Service. It is a
        template describing how personal data is processed. Because Glass Box is self-hosted by
        design, the allocation of roles differs from a typical multi-tenant SaaS DPA — read the
        roles section carefully and adapt the placeholders with counsel.
      </LegalP>

      <LegalSection title="1. Roles of the parties">
        <LegalP>
          For personal data processed through a self-hosted Glass Box deployment, the Customer is
          the data controller. Because the software runs on the Customer&apos;s own
          infrastructure and Glass Box does not receive or store the Customer&apos;s source data,
          the Customer is frequently also the sole processor of that data through its own
          systems and personnel.
        </LegalP>
        <LegalP>
          Glass Box acts as a processor only for the limited personal data it processes directly
          on the Customer&apos;s behalf — for example, information submitted through the hosted
          trial or support channels. Where Glass Box is a processor, it will process personal
          data only on documented instructions from the Customer.
        </LegalP>
      </LegalSection>

      <LegalSection title="2. Subject matter and duration">
        <LegalP>
          The subject matter is the provision of the Service. Processing continues for the term
          of the agreement and any wind-down period, after which data is deleted or returned as
          described below. For self-hosted deployments, duration and lifecycle are controlled by
          the Customer within its environment.
        </LegalP>
      </LegalSection>

      <LegalSection title="3. Nature and purpose of processing">
        <LegalP>
          Personal data is processed to operate the governed AI analyst: to authenticate users,
          enforce access control, store and version uploaded sources, run analysis, generate
          decision reports, and maintain audit logs. Glass Box does not use Customer source
          content to train foundation models.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Categories of data subjects and personal data">
        <LegalList
          items={[
            <>
              <strong>Data subjects.</strong> Customer&apos;s authorized users and administrators;
              individuals whose personal data may appear within uploaded sources.
            </>,
            <>
              <strong>Personal data.</strong> Account and contact details, role assignments, usage
              and audit records, and any personal data contained in the Customer&apos;s uploaded
              sources, which the Customer controls and which, in a self-hosted deployment, remains
              on the Customer&apos;s infrastructure.
            </>,
          ]}
        />
        <LegalP>
          Customer should avoid uploading special categories of personal data unless its
          deployment is configured and lawful to process them.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. Subprocessors">
        <LegalP>
          Where Glass Box acts as a processor, it engages a limited set of subprocessors, the
          most significant being the model provider (Anthropic) used to generate responses in
          hosted mode, along with infrastructure and email providers used to operate the website
          and trial. In a self-hosted deployment, the Customer configures the model provider and
          infrastructure under its own credentials, and those are not Glass Box subprocessors.
          Glass Box will provide notice of material changes to its subprocessor list so the
          Customer can object.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Security measures">
        <LegalP>
          The technical and organizational measures include role-based access control enforced on
          every request, audit logging, tenancy isolation, sandboxed code execution, minimized
          context to the model, encryption in transit and at rest via the Customer&apos;s
          provider, and configurable retention with hard deletion. These are described in more
          detail on the{" "}
          <a
            href="/security"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            Security &amp; Trust
          </a>{" "}
          page, which is incorporated here by reference.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Data subject requests">
        <LegalP>
          For self-hosted deployments, the Customer administers access, rectification, erasure,
          restriction, and portability requests directly through the product. Where Glass Box
          processes personal data on the Customer&apos;s behalf, it will, taking into account the
          nature of the processing, provide reasonable assistance to help the Customer respond to
          data subject requests.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Personal data breach notification">
        <LegalP>
          Where Glass Box acts as a processor and becomes aware of a personal data breach
          affecting Customer personal data, it will notify the Customer without undue delay and
          provide information reasonably available to assist the Customer&apos;s own notification
          obligations. In a self-hosted deployment, breach detection and notification within the
          Customer&apos;s environment are the Customer&apos;s responsibility.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. Audits">
        <LegalP>
          Glass Box will make available information reasonably necessary to demonstrate compliance
          with this DPA and, on reasonable notice and subject to confidentiality, allow for audits
          consistent with the agreement. Because the Customer operates the self-hosted environment,
          the Customer&apos;s own logs and controls are the primary evidence of processing within
          that environment.
        </LegalP>
      </LegalSection>

      <LegalSection title="10. Deletion or return on termination">
        <LegalP>
          On termination, and at the Customer&apos;s choice, Glass Box will delete or return
          personal data it processes as a processor, subject to any legal retention requirement.
          For self-hosted deployments, deletion and return are performed by the Customer within
          its own environment using the product&apos;s hard-delete capabilities.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. International transfers">
        <LegalP>
          Where Glass Box processes personal data as a processor and a transfer requires a
          safeguard, the parties will rely on an appropriate mechanism such as the Standard
          Contractual Clauses [insert applicable module and jurisdiction]. In a self-hosted
          deployment, transfer and residency are determined by where the Customer chooses to run
          the software. Complete these placeholders with counsel.
        </LegalP>
      </LegalSection>

      <LegalSection title="12. Contact">
        <LegalP>
          Requests under this DPA can be directed to the contact designated in your deployment
          agreement. Replace this line with your organization&apos;s designated data protection
          contact.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
