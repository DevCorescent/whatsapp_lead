"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";

type FormState = {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
};

const EMPTY_FORM: FormState = { name: "", email: "", phone: "", company: "", message: "" };

const INPUT_CLASS =
  "mt-1.5 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6C3FC4] focus:outline-none focus:ring-2 focus:ring-[#6C3FC4]/20";

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // UI only — there is no backend route for this form yet.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitted(true);
    setForm(EMPTY_FORM);
  }

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  if (isSubmitted) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" />
        </span>
        <h2 className="mt-6 text-xl font-semibold text-gray-900">Thanks — we got your message</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Our team will get back to you within one business day at the email you shared.
        </p>
        <button
          type="button"
          onClick={() => setIsSubmitted(false)}
          className="mt-6 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Full name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Rohan Mehta"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Work email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="rohan@company.com"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            placeholder="+91 98765 43210"
            className={INPUT_CLASS}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="company" className="block text-sm font-medium text-gray-700">
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            value={form.company}
            onChange={(event) => update("company", event.target.value)}
            placeholder="Zenith Realty"
            className={INPUT_CLASS}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="message" className="block text-sm font-medium text-gray-700">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
            placeholder="Tell us about your team and what you want to automate on WhatsApp."
            className={`${INPUT_CLASS} resize-y`}
          />
        </div>
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#6C3FC4] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#6C3FC4]/20 transition-colors hover:bg-[#5A32A6] sm:w-auto"
      >
        <Send className="h-5 w-5" />
        Book a Demo
      </button>

      <p className="mt-4 text-xs text-gray-500">
        By submitting this form you agree to our{" "}
        <Link href="/privacy-policy" className="font-medium text-[#6C3FC4] hover:underline">
          Privacy Policy
        </Link>
        . We will never share your details.
      </p>
    </form>
  );
}
