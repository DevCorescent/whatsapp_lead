// TODO [HEMANT]: Build the Register / Sign Up form UI.
//
// Form fields:
//   - Full Name (required)
//   - Work Email (required)
//   - Password (with strength indicator)
//   - Confirm Password
//   - Workspace Name (company name — creates the tenant slug)
//   - Terms checkbox: "I agree to the Terms & Conditions and Privacy Policy"
//   - Submit button: "Create Free Account"
//   - "Already have an account? Sign In" link
//
// Logic (wire these up):
//   1. Validate with react-hook-form + registerSchema from @/lib/validators/auth
//   2. POST to /api/auth/register
//   3. On success → auto signIn then redirect to /inbox
//   4. On error (409 = email taken) show field-level error

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        workspaceName: fd.get("workspaceName"),
      }),
    });

    const data = await res.json();

    if (!data.success) {
      setError(data.error);
      setLoading(false);
      return;
    }

    await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirect: false,
    });

    router.push("/inbox");
  }

  return (
    <div>
      {/* TODO [HEMANT]: Replace below with polished shadcn UI */}
      <h1 className="text-2xl font-bold mb-2">Create your account</h1>
      <p className="text-gray-500 mb-8">Start your 14-day free trial — no credit card required</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input name="name" type="text" placeholder="Full Name" required className="w-full border rounded-lg px-4 py-2" />
        <input name="workspaceName" type="text" placeholder="Company / Workspace Name" required className="w-full border rounded-lg px-4 py-2" />
        <input name="email" type="email" placeholder="Work Email" required className="w-full border rounded-lg px-4 py-2" />
        <input name="password" type="password" placeholder="Password (min 8 chars)" required className="w-full border rounded-lg px-4 py-2" />
        <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
          {loading ? "Creating account..." : "Create Free Account"}
        </button>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-green-600 hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
