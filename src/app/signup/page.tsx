"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001");
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

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
      (firstRef.current ?? undefined)?.focus();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold uppercase tracking-wide">Create your account</h1>
          <p className="text-sm text-muted-foreground">Start your branded chat experience.</p>
        </CardHeader>
        <CardContent>
          {error ? <div className="mb-3 text-sm text-red-600" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit} className="grid gap-3" aria-busy={loading}>
            <div className="grid gap-1">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" placeholder="Jane" className="placeholder:text-muted-foreground/60" value={firstName} onChange={(e) => setFirstName(e.target.value)} ref={firstRef} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" placeholder="Doe" className="placeholder:text-muted-foreground/60" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" className="placeholder:text-muted-foreground/60" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" className="placeholder:text-muted-foreground/60" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing up…" : "Sign up"}</Button>
          </form>
        </CardContent>
        <CardFooter className="flex items-center justify-center">
          <div className="text-sm text-center text-muted-foreground">
            Already have an account? <a className="underline" href="/login">Sign in</a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
