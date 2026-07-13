import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import ContactForm from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us — WhatsCRM",
  description:
    "Talk to the WhatsCRM team. Book a demo, ask a question, or get help connecting your WhatsApp Business number.",
};

const CONTACT_DETAILS = [
  {
    Icon: Mail,
    label: "Email us",
    value: "support@whatscrm.in",
    href: "mailto:support@whatscrm.in",
  },
  {
    Icon: Phone,
    label: "Call us",
    value: "+91 80 4567 8900",
    href: "tel:+918045678900",
  },
  {
    Icon: MapPin,
    label: "Visit us",
    value: "Corescent Technologies Pvt Ltd, 4th Floor, Indiranagar, Bengaluru 560038",
    href: null,
  },
  {
    Icon: Clock,
    label: "Support hours",
    value: "Monday to Saturday, 9 AM – 8 PM IST",
    href: null,
  },
];

export default function ContactPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Let&apos;s talk
          </h1>
          <p className="mt-6 text-base text-gray-600 sm:text-lg">
            Book a demo, ask a pricing question, or get help connecting your WhatsApp number. A real
            person replies within one business day.
          </p>
        </div>
      </section>

      {/* Info + form */}
      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-5 lg:gap-16 lg:px-8">
          {/* Company info */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Get in touch</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Prefer to reach out directly? Here is where to find us.
            </p>

            <ul className="mt-8 space-y-6">
              {CONTACT_DETAILS.map(({ Icon, label, value, href }) => (
                <li key={label} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6C3FC4]/10">
                    <Icon className="h-5 w-5 text-[#6C3FC4]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{label}</span>
                    {href ? (
                      <a
                        href={href}
                        className="mt-0.5 block text-sm text-gray-600 transition-colors hover:text-[#6C3FC4]"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="mt-0.5 block text-sm leading-relaxed text-gray-600">
                        {value}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm font-semibold text-gray-900">Already a customer?</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Raise a ticket from inside your dashboard and our support team will pick it up right
                away — it is the fastest route to an answer.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
        </div>
      </section>
    </div>
  );
}
