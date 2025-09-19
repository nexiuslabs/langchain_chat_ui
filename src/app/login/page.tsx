"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      try {
        const body = await res.json();
        const tid = body?.tenant_id || null;
        if (tid && typeof window !== 'undefined') {
          try { window.localStorage.setItem('lg:chat:tenantId', String(tid)); } catch {}
        }
      } catch {}
      window.location.href = "/";
    } else {
      const body = await res.json().catch(() => ({} as any));
      setError(body?.detail || "Login failed");
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="border rounded-md p-6 w-full max-w-sm space-y-3">
        <div className="text-lg font-semibold">Sign in</div>
        {error ? <div className="text-sm text-red-500">{error}</div> : null}
        <input className="border w-full p-2 rounded" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="border w-full p-2 rounded" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button className="bg-black text-white px-3 py-2 rounded w-full" type="submit">Continue</button>
      </form>
    </div>
  );
}
