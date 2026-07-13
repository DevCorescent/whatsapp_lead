// TODO [AMAN]: Build the Pricing page.
//
// Layout:
//  1. PageHeader – "Simple, Transparent Pricing" heading + billing toggle (Monthly / Annual)
//  2. PricingCards – 3 cards: STARTER (₹999/mo), GROWTH (₹2,999/mo), ENTERPRISE (Custom)
//     Each card: plan name, price, feature list with check icons, CTA button
//  3. FeatureComparisonTable – Full feature matrix across plans
//  4. FAQSection – 6 common pricing questions
//
// When Annual is toggled, show 20% discount on prices.
// Highlight the GROWTH card as "Most Popular".
// "Get Started" button links to /register?plan=STARTER (or GROWTH / ENTERPRISE).

export default function PricingPage() {
  return (
    <div className="py-16 px-6 max-w-6xl mx-auto">
      {/* TODO [AMAN]: Build full pricing UI */}
      <h1 className="text-3xl font-bold text-center mb-4">Pricing</h1>
      <p className="text-center text-gray-500">Pricing page coming soon.</p>
    </div>
  );
}
