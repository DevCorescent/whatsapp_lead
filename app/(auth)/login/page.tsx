// TODO [HEMANT]: Build the Login form UI.
//
// Form fields:
//   - Email (type="email", required)
//   - Password (type="password", show/hide toggle icon, required)
//   - "Remember me" checkbox
//   - "Forgot Password?" link → /forgot-password
//   - Submit button: "Sign In"
//   - "Don't have an account? Register" link
//
// Logic (already wired – DO NOT CHANGE):
//   - Use react-hook-form + zod (loginSchema from @/lib/validators/auth)
//   - On submit call signIn("credentials", { email, password, redirect: false })
//   - On error show inline error toast
//   - On success router.push("/inbox")
//
// Use shadcn/ui components: Input, Button, Label, Checkbox, Card.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/inbox");
    }
  }

  return (
    <div>
      {/* TODO [HEMANT]: Replace below with polished shadcn UI */}
      <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
      <p className="text-gray-500 mb-8">Sign in to your workspace</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input name="email" type="email" placeholder="Email" required className="w-full border rounded-lg px-4 py-2" />
        <input name="password" type="password" placeholder="Password" required className="w-full border rounded-lg px-4 py-2" />
        <div className="flex justify-between text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" /> Remember me
          </label>
          <Link href="/forgot-password" className="text-green-600 hover:underline">Forgot password?</Link>
        </div>
        <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
          {loading ? "Signing in..." : "Sign In"}
        </button>
        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-green-600 hover:underline">Register</Link>
        </p>
      </form>
    </div>
  );
}
