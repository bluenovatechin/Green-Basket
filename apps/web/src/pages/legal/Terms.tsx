import { Link } from "react-router-dom";
import { useSettings } from "../../lib/api";
import { rupees } from "../../lib/format";
import { BUSINESS } from "../../lib/site";
import LegalPage, { ContactBlock, type Section } from "./LegalPage";

export default function Terms() {
  const s = useSettings().data;
  const jurisdiction = BUSINESS.city ? `${BUSINESS.city}, ${BUSINESS.region}` : BUSINESS.region;

  const sections: Section[] = [
    {
      id: "about",
      title: "About these terms",
      body: (
        <>
          <p>
            These terms are an agreement between you and {BUSINESS.legalName || BUSINESS.name} ("we", "us") for using the{" "}
            {BUSINESS.name} website and app and buying from us. By creating an account or placing an order you accept them.
            Our <Link to="/privacy">Privacy Policy</Link> explains how we handle your data.
          </p>
          <ContactBlock />
        </>
      ),
    },
    {
      id: "account",
      title: "Your account",
      body: (
        <ul>
          <li>You must be 18 or older and give true, current details, especially your delivery address and phone number.</li>
          <li>Keep your password private. You are responsible for orders placed from your account.</li>
          <li>We may suspend an account that is used for fraud, abuse of staff, repeated refused cash-on-delivery orders, or breaking these terms. We will tell you why.</li>
        </ul>
      ),
    },
    {
      id: "orders",
      title: "Orders, prices and availability",
      body: (
        <ul>
          <li>Prices are in Indian Rupees and include applicable taxes. The price you pay is the one shown at checkout.</li>
          <li>Your order is accepted when you see the order confirmation. Online orders are confirmed once payment succeeds.</li>
          <li>Fresh produce varies naturally in size, colour and shape. Weights are packed to at least the amount you ordered.</li>
          <li>Stock is limited and changes through the day. If an item can't be supplied after you order, we remove it and don't charge you for it; if you already paid, we refund that amount.</li>
          {s && s.min_order_value > 0 && <li>The minimum order value is {rupees(s.min_order_value)}.</li>}
          <li>We may correct obvious pricing mistakes. If that changes your order total, we will contact you before delivery and you may cancel.</li>
        </ul>
      ),
    },
    {
      id: "delivery",
      title: "Delivery",
      body: (
        <ul>
          <li>We deliver only to the pincodes accepted at checkout, in the time slot you choose.</li>
          {s && <li>Delivery costs {s.delivery_fee > 0 ? rupees(s.delivery_fee) : "nothing"} per order and is free over {rupees(s.free_delivery_above)}. The exact amount is shown before you pay.</li>}
          <li>Please be available during your slot. If nobody can receive the order, our rider will try to call you. If we still can't deliver, the order may be cancelled; perishable goods can't be held for later.</li>
          <li>Delays caused by weather, traffic, strikes or other events outside our control are not a breach of these terms. We will keep you informed.</li>
        </ul>
      ),
    },
    {
      id: "payment",
      title: "Payment",
      body: (
        <ul>
          {(!s || s.online_payment_enabled) && <li>Online payments (UPI, cards, net banking) are processed by PhonePe. We do not see or store your card or bank details.</li>}
          {(!s || s.cod_enabled) && <li>Cash on delivery is available{s ? ` for orders up to ${rupees(s.cod_max_amount)}` : ""}. Please keep the exact amount ready where you can.</li>}
          <li>While an order is still unpaid you can switch between online payment and cash on delivery from the order page.</li>
          <li>An online order that is not paid within the time shown at checkout is cancelled automatically, and the stock is released.</li>
        </ul>
      ),
    },
    {
      id: "refunds",
      title: "Cancellations, returns and refunds",
      body: (
        <>
          <h3>Cancelling</h3>
          <p>You can cancel from your order page any time before the order is packed. After packing, please contact us.</p>
          <h3>Quality problems</h3>
          <p>
            If an item is damaged, spoiled, wrong or missing, tell us within <strong>24 hours of delivery</strong>, with a
            photo if you can. We will replace the item in a later delivery or refund it. Because fresh produce is
            perishable, we can't accept returns of items that are in good condition.
          </p>
          <h3>Refunds</h3>
          <p>
            Refunds for online payments go back to the original payment method through PhonePe and usually reach you within
            5 to 7 working days, depending on your bank. Cash payments are refunded by UPI or bank transfer to an account you
            give us.
          </p>
        </>
      ),
    },
    {
      id: "use",
      title: "Acceptable use",
      body: (
        <p>
          Don't misuse the service: no fake orders, attempts to access other people's accounts or our systems, automated
          scraping, or abuse of our staff. We may refuse service where this happens.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Disclaimers and liability",
      body: (
        <>
          <p>
            We take care to describe products accurately, but photos are for illustration and actual produce may look
            different. Nutritional or health statements, where shown, are general information and not medical advice.
          </p>
          <p>
            Nothing in these terms limits your rights under the Consumer Protection Act, 2019. Apart from those rights, our
            total liability for any order is limited to the amount you paid for that order. We are not liable for indirect
            losses such as loss of income.
          </p>
        </>
      ),
    },
    {
      id: "ip",
      title: "Content and trademarks",
      body: <p>The {BUSINESS.name} name, logo and the content of this site belong to us or our licensors. Please don't copy them for commercial use without permission.</p>,
    },
    {
      id: "law",
      title: "Governing law and complaints",
      body: (
        <>
          <p>
            These terms are governed by the laws of India. Courts in {jurisdiction} have jurisdiction, without affecting
            your right to approach a consumer commission.
          </p>
          <p>
            For any complaint, contact us or our Grievance Officer (section 1). We acknowledge complaints within 48 hours
            and aim to resolve them within 30 days, as required by the Consumer Protection (E-Commerce) Rules, 2020.
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: <p>We may update these terms. The date at the top shows the latest version. Orders are governed by the terms in force when they were placed.</p>,
    },
  ];

  return (
    <LegalPage
      path="/terms"
      title="Terms & Conditions"
      seoTitle="Terms & Conditions, Delivery and Refunds"
      description={`The terms for ordering from ${BUSINESS.name}: accounts, prices, delivery slots, payment, cancellations, quality complaints within 24 hours and refunds.`}
      summary={
        <>
          <strong>In short:</strong> order in your chosen slot, pay online or in cash, cancel any time before packing,
          and tell us within 24 hours if anything is wrong. We'll replace it or refund you.
        </>
      }
      sections={sections}
    />
  );
}
