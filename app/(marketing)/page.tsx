// TODO [AMAN]: Build the full Home / Landing page.
//
// Sections to build (in order):
//  1. HeroSection       – Headline, subheadline, CTA buttons, product screenshot/mockup
//  2. LogoStrip         – "Trusted by" logos
//  3. FeaturesSection   – 6 feature cards with icons (WhatsApp, AI, CRM, Campaigns, Analytics, Chatbot)
//  4. HowItWorksSection – 3-step visual process
//  5. TestimonialsSection – 3 customer quotes
//  6. PricingPreview    – Short pricing section linking to /pricing
//  7. CTASection        – "Start your free trial" banner
//
// Design references: Use Tailwind + shadcn/ui components.
// Color palette: Primary = green-600 (#16a34a), Accent = emerald-500.
// Font: Inter (already in globals).
// The page should be fully responsive (mobile, tablet, desktop).

export default function HomePage() {
  return (
    <div>
      {/* TODO [AMAN]: Replace below with actual sections */}
      <section className="py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI-Powered WhatsApp CRM & Automation
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Automate leads, qualify customers, and close more deals — all on WhatsApp.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/register" className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">
            Start Free Trial
          </a>
          <a href="/features" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50">
            See Features
          </a>
        </div>
      </section>
    </div>
  );
}
