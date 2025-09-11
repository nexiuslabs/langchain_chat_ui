"use client";

import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBase = (process.env.NEXT_PUBLIC_USE_API_PROXY || "").toLowerCase() === 'true'
    ? "/api/backend"
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          email_verified: true,
        }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const body = await res.json().catch(() => ({} as any));
      setError(body?.detail || `Sign up failed (${res.status})`);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="border rounded-md p-6 w-full max-w-sm space-y-3">
        <div className="text-lg font-semibold">Create your account</div>
        {error ? <div className="text-sm text-red-500">{error}</div> : null}
        <input
          className="border w-full p-2 rounded"
          placeholder="First name (optional)"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          className="border w-full p-2 rounded"
          placeholder="Last name (optional)"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <input
          className="border w-full p-2 rounded"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border w-full p-2 rounded"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="bg-black text-white px-3 py-2 rounded w-full disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing up…" : "Sign up"}
        </button>
        <div className="text-sm text-center text-muted-foreground">
          Already have an account? <a className="underline" href="/login">Sign in</a>
        </div>
      </form>
    </div>
  );
}
