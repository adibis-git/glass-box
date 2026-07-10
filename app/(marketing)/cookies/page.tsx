import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy — Glass Box",
  description:
    "How Glass Box uses cookies and local storage. We use only essential authentication and preference storage — no third-party advertising or tracking cookies.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" lastUpdated="July 10, 2026">
      <LegalP>
        This Cookie Policy explains how Glass Box uses cookies and similar technologies, such as
        browser local storage, on our website and product. We keep this minimal by design: we do
        not run advertising networks or third-party tracking on our surfaces.
      </LegalP>

      <LegalSection title="1. What we use">
        <LegalList
          items={[
            <>
              <strong>Essential authentication / session cookie.</strong> Used to keep you signed
              in and to secure your session. Without it, the product cannot function.
            </>,
            <>
              <strong>Theme preference (local storage).</strong> Stores your light or dark mode
              choice so the interface renders the way you last selected it.
            </>,
            <>
              <strong>Security cookies.</strong> Short-lived tokens used to protect against
              cross-site request forgery and similar abuse.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. What we do not use">
        <LegalP>
          We do not set third-party advertising cookies, cross-site tracking pixels, or
          data-broker tags. We do not sell or share cookie-derived information for advertising.
        </LegalP>
      </LegalSection>

      <LegalSection title="3. How to control cookies">
        <LegalP>
          Most browsers let you view, block, or delete cookies and clear local storage through
          their settings. Because our authentication cookie is essential, blocking it will
          prevent you from signing in and using the product. Clearing local storage will reset
          your theme preference to the default.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Changes to this policy">
        <LegalP>
          We may update this policy if our use of cookies changes. Material changes will be
          reflected by an updated &ldquo;Last updated&rdquo; date.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. Contact">
        <LegalP>
          Questions about this policy can be raised through our{" "}
          <a href="/demo" className="text-accent underline">contact page</a>.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
