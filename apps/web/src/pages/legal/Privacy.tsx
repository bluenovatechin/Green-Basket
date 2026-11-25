import { Link } from "react-router-dom";
import { openCookieSettings } from "../../lib/consent";
import { BUSINESS, GA4_ID } from "../../lib/site";
import LegalPage, { ContactBlock, type Section } from "./LegalPage";

export default function Privacy() {
  const sections: Section[] = [
    {
      id: "who-we-are",
      title: "Who we are",
      body: (
        <>
          <p>
            {BUSINESS.legalName || BUSINESS.name} ("we", "us") runs the {BUSINESS.name} website and app, which sell fresh
            vegetables and fruit for home delivery in {BUSINESS.city ? `${BUSINESS.city}, ` : ""}{BUSINESS.region}, India.
            We decide why and how your personal data is used, so under India's Digital Personal Data Protection Act, 2023
            ("DPDP Act") we are the <strong>Data Fiduciary</strong>. Where the EU or UK GDPR applies to you, we are the
            data controller.
          </p>
          <ContactBlock />
        </>
      ),
    },
    {
      id: "data-we-collect",
      title: "What we collect",
      body: (
        <>
          <p>We only collect what we need to take, deliver and support your orders:</p>
          <ul>
            <li><strong>Account details:</strong> your name, email address and password (stored only as a secure hash by our login provider). If you use "Continue with Google", we receive your name and email from Google.</li>
            <li><strong>Delivery details:</strong> addresses, pincode, landmark and the phone number you give for delivery.</li>
            <li><strong>Orders:</strong> what you bought, prices, delivery slot, order status and delivery notes.</li>
            <li><strong>Payments:</strong> payment status and transaction references from PhonePe. We never see or store your card number, UPI PIN or bank login.</li>
            <li><strong>Messages:</strong> anything you send us when asking for help.</li>
            <li><strong>Technical data:</strong> basic logs (IP address, browser type, time of request) kept by our hosting providers for security, and the items listed under <a href="#cookies">Cookies and device storage</a>.</li>
          </ul>
          <p>We do not collect sensitive data such as health, financial account or biometric information, and we do not knowingly collect data from children.</p>
        </>
      ),
    },
    {
      id: "how-we-use",
      title: "How we use it and our legal basis",
      body: (
        <ul>
          <li><strong>To take and deliver your order</strong>, send order emails, collect payment and handle refunds. Basis: your consent when you place an order and the contract between us.</li>
          <li><strong>To keep your account secure</strong> and prevent fraud or abuse, including bot checks on login forms. Basis: legitimate use / legitimate interests.</li>
          <li><strong>To meet legal duties</strong>, such as keeping tax and accounting records. Basis: legal obligation.</li>
          <li><strong>To improve the shop</strong> using anonymous page statistics, only if you opt in. Basis: consent, which you can withdraw at any time.</li>
        </ul>
      ),
    },
    {
      id: "sharing",
      title: "Who we share it with",
      body: (
        <>
          <p>We do not sell your data or share it for advertising. We share it only with service providers that help us run the shop, under contracts that require them to protect it:</p>
          <ul>
            <li><strong>Supabase</strong>: database, login and file storage.</li>
            <li><strong>Cloudflare</strong>: website hosting, security and bot protection (Turnstile).</li>
            <li><strong>PhonePe</strong>: online payments and refunds.</li>
            <li><strong>Our email provider</strong>: sending order and password emails.</li>
            <li><strong>Google</strong>: only if you choose "Continue with Google"{GA4_ID ? ", or opt in to analytics (Google Analytics 4)" : ""}.</li>
            <li><strong>Our delivery staff</strong>: your name, address, phone number and order, only for the orders they deliver.</li>
          </ul>
          <p>We may also disclose data when the law requires it, for example to comply with a court order.</p>
          <p>
            Some providers store data on servers outside India. Where that happens we rely on the safeguards in their
            contracts and on transfers being permitted under the DPDP Act and, where it applies, the GDPR.
          </p>
        </>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <ul>
          <li><strong>Account and addresses:</strong> while your account is open. When you ask us to delete it, we delete or anonymise it within 30 days.</li>
          <li><strong>Orders and payment records:</strong> as long as Indian tax and accounting laws require (currently up to 8 years), then deleted.</li>
          <li><strong>Security logs:</strong> usually no longer than 90 days.</li>
        </ul>
      ),
    },
    {
      id: "your-rights",
      title: "Your rights",
      body: (
        <>
          <p>You can ask us to:</p>
          <ul>
            <li>tell you what personal data we hold about you and how we use it;</li>
            <li>correct or update it (you can also edit your addresses in <Link to="/account">Account</Link>);</li>
            <li>delete it, unless we must keep it by law;</li>
            <li>withdraw a consent you gave, for example to analytics, as easily as you gave it;</li>
            <li>nominate another person to act for you if you die or become unable to (DPDP Act);</li>
            <li>under the GDPR, also object to processing, restrict it, or receive your data in a portable format.</li>
          </ul>
          <p>
            Write to the contact in section 1. We reply within 30 days. If you are not satisfied with our answer, you can
            complain to the Data Protection Board of India or, under the GDPR, to your local data protection authority.
          </p>
        </>
      ),
    },
    {
      id: "security",
      title: "How we protect it",
      body: (
        <p>
          All traffic is encrypted with HTTPS. Access to customer data is limited by role, so a rider only sees the
          orders they deliver. Passwords are never stored in readable form and secret keys stay on our servers, never in
          the app. No system is perfectly secure; if a breach affects you, we will tell you and the authorities as the law
          requires.
        </p>
      ),
    },
    {
      id: "cookies",
      title: "Cookies and device storage",
      body: (
        <>
          <p>We keep a few small items in your browser's storage. Necessary items can't be switched off, because the shop does not work without them.</p>
          <div className="not-prose -mx-1 mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-line text-ink">
                <tr><th className="px-1 py-2 font-semibold">Name</th><th className="px-1 py-2 font-semibold">Purpose</th><th className="px-1 py-2 font-semibold">Type</th><th className="px-1 py-2 font-semibold">Kept for</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><td className="px-1 py-2 font-mono text-xs">sb-…-auth-token</td><td className="px-1 py-2">Keeps you logged in</td><td className="px-1 py-2">Necessary</td><td className="px-1 py-2">Until you log out</td></tr>
                <tr><td className="px-1 py-2 font-mono text-xs">gb_cart_…</td><td className="px-1 py-2">Remembers your basket</td><td className="px-1 py-2">Necessary</td><td className="px-1 py-2">Until you order or empty it</td></tr>
                <tr><td className="px-1 py-2 font-mono text-xs">gb_consent</td><td className="px-1 py-2">Remembers this choice</td><td className="px-1 py-2">Necessary</td><td className="px-1 py-2">12 months</td></tr>
                <tr><td className="px-1 py-2 font-mono text-xs">gb_install_dismissed_at</td><td className="px-1 py-2">Hides the "install app" note for a week</td><td className="px-1 py-2">Necessary</td><td className="px-1 py-2">7 days</td></tr>
                <tr><td className="px-1 py-2 font-mono text-xs">Cloudflare Turnstile</td><td className="px-1 py-2">Checks that a login is not a bot</td><td className="px-1 py-2">Necessary</td><td className="px-1 py-2">The session</td></tr>
                {GA4_ID && <tr><td className="px-1 py-2 font-mono text-xs">_ga, _ga_*</td><td className="px-1 py-2">Anonymous page statistics (Google Analytics 4)</td><td className="px-1 py-2">Analytics, opt-in</td><td className="px-1 py-2">Up to 2 years</td></tr>}
              </tbody>
            </table>
          </div>
          <p>
            We don't use advertising cookies.{" "}
            <button type="button" onClick={openCookieSettings} className="font-medium text-brand underline underline-offset-2">Change your cookie settings</button>
          </p>
        </>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: <p>Accounts are for adults (18 and over). If you believe a child has given us personal data, contact us and we will delete it.</p>,
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: <p>If we change this policy we will update the date at the top. For important changes we will also tell you by email or in the app before they take effect.</p>,
    },
  ];

  return (
    <LegalPage
      path="/privacy"
      title="Privacy Policy"
      seoTitle="Privacy Policy: How We Use Your Data"
      description={`How ${BUSINESS.name} collects, uses, shares and protects your personal data, how long we keep it, and how to use your rights under the DPDP Act and GDPR.`}
      summary={
        <>
          <strong>In short:</strong> we use your name, contact details and address to deliver your orders, and nothing
          else without asking. We never sell your data, payments are handled by PhonePe, and you can ask us to see,
          correct or delete your data at any time.
        </>
      }
      sections={sections}
    />
  );
}
