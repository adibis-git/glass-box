import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Glass Box",
  description:
    "The terms governing use of Glass Box, including the 10-day trial, acceptable use, customer data ownership, disclaimers, and limitation of liability.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 10, 2026">
      <LegalP>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Glass
        Box website, hosted trial, and self-hosted software (collectively, the
        &ldquo;Service&rdquo;). By accessing or using the Service, you agree to these Terms. If
        you are entering into these Terms on behalf of an organization, you represent that you
        have authority to bind that organization.
      </LegalP>

      <LegalSection title="1. Acceptance of terms">
        <LegalP>
          Your use of the Service constitutes acceptance of these Terms and any deployment or
          order agreement executed between you and Glass Box. Where a signed agreement conflicts
          with these Terms, the signed agreement controls.
        </LegalP>
      </LegalSection>

      <LegalSection title="2. Description of the Service">
        <LegalP>
          Glass Box is a governed AI analyst that reasons over your spreadsheets and documents,
          runs analysis in a sandboxed environment, cites evidence, and produces decision
          reports. It is self-hosted by design; the primary offering is a customized deployment
          on your own infrastructure. The public website and hosted trial are provided as a
          showcase and evaluation environment.
        </LegalP>
      </LegalSection>

      <LegalSection title="3. Trial terms">
        <LegalP>
          We may offer a 10-day trial of the Service. Trials are provided for evaluation only,
          on an &ldquo;as is&rdquo; basis, and may be modified or discontinued at any time.
          Unless converted to a paid deployment, trial workspaces and their contents may be
          deactivated and deleted at the end of the trial period. You are responsible for
          exporting anything you wish to retain before the trial ends.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <LegalP>You agree not to:</LegalP>
        <LegalList
          items={[
            "Use the Service in violation of any applicable law or third-party rights.",
            "Upload content you are not authorized to process, or that infringes others' rights.",
            "Attempt to circumvent access controls, tenancy isolation, or the code sandbox.",
            "Reverse engineer, resell, or sublicense the Service except as expressly permitted.",
            "Use the Service to build a competing product or to benchmark for a competitor.",
            "Interfere with the integrity, security, or performance of the Service.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Customer data and ownership">
        <LegalP>
          As between the parties, you retain all right, title, and interest in the data,
          documents, and content you upload or generate through the Service
          (&ldquo;Customer Data&rdquo;). Glass Box claims no ownership of Customer Data. In a
          self-hosted deployment, Customer Data remains on your infrastructure. You grant Glass
          Box only the limited rights necessary to provide and support the Service, and, for the
          hosted trial, to operate the evaluation environment on your behalf.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Intellectual property">
        <LegalP>
          The Service, including its software, models integration, user interface, and
          documentation, is owned by Glass Box and its licensors and is protected by
          intellectual property laws. Subject to these Terms and any applicable license, we grant
          you a non-exclusive, non-transferable right to use the Service for your internal
          business purposes. All rights not expressly granted are reserved.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Confidentiality">
        <LegalP>
          Each party may receive confidential information from the other. The receiving party
          will use such information only to perform under these Terms and will protect it with
          the same care it uses for its own confidential information, and no less than
          reasonable care. This section does not apply to information that is public, already
          known, independently developed, or lawfully received from a third party.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Disclaimers and warranties">
        <LegalP>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
          warranties of any kind, whether express, implied, or statutory, including implied
          warranties of merchantability, fitness for a particular purpose, and non-infringement.
          Glass Box is an analytical aid: outputs, including AI-generated summaries and
          calculations, may contain errors and must be reviewed by qualified humans before you
          rely on them for decisions. We do not warrant that the Service will be uninterrupted,
          error-free, or that outputs will be accurate or complete.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <LegalP>
          To the maximum extent permitted by law, neither party will be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for lost profits, revenue,
          or data, arising out of or related to the Service. Each party&apos;s aggregate
          liability arising out of or related to these Terms will not exceed the amounts paid or
          payable by you for the Service in the twelve months preceding the event giving rise to
          the claim. Some jurisdictions do not allow certain limitations, so some of the above
          may not apply to you.
        </LegalP>
      </LegalSection>

      <LegalSection title="10. Termination">
        <LegalP>
          You may stop using the Service at any time. We may suspend or terminate access for
          breach of these Terms, for security reasons, or as otherwise set out in your
          deployment agreement. Upon termination, your right to use the Service ends. Provisions
          that by their nature should survive — including ownership, confidentiality,
          disclaimers, and limitation of liability — will survive termination.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <LegalP>
          These Terms are governed by the laws of [Governing Jurisdiction], without regard to
          its conflict-of-laws rules, and the parties submit to the exclusive jurisdiction of
          the courts located in [Venue]. Replace these placeholders with the jurisdiction and
          venue appropriate to your organization.
        </LegalP>
      </LegalSection>

      <LegalSection title="12. Changes to these terms">
        <LegalP>
          We may update these Terms from time to time. Material changes will be reflected by an
          updated &ldquo;Last updated&rdquo; date, and continued use of the Service after changes
          take effect constitutes acceptance.
        </LegalP>
      </LegalSection>

      <LegalSection title="13. Contact">
        <LegalP>
          Questions about these Terms can be directed to your Glass Box account contact or the
          contact designated in your deployment agreement. Replace this line with your
          organization&apos;s designated legal contact.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
