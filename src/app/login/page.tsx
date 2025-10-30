"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001");
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
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
        return;
      }
      const body = await res.json().catch(() => ({} as any));
      setError(body?.detail || "Login failed");
      (emailRef.current ?? undefined)?.focus();
    } catch (err: any) {
      setError(String(err));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold uppercase tracking-wide">Sign in</h1>
          <p className="text-sm text-muted-foreground">Access your recruiting workspace.</p>
        </CardHeader>
        <CardContent>
          {error ? <div className="mb-3 text-sm text-red-600" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit} className="grid gap-3" aria-busy={loading}>
            <div className="grid gap-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" className="placeholder:text-muted-foreground/60" ref={emailRef} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" className="placeholder:text-muted-foreground/60" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in…" : "Continue"}</Button>
          </form>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <a className="text-sm underline" href="#">Forgot password?</a>
          <a className="text-sm underline" href="/signup">Create account</a>
        </CardFooter>
      </Card>
    </div>
  );
}
