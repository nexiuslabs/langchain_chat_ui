"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/providers/Tenant";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001");
  const emailRef = useRef<HTMLInputElement | null>(null);
  const { setTenantId } = useTenant();

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    function formatErrorMessage(detail: any, status: number): string {
      const fallback = status === 401 ? "Invalid email or password." : status === 403 ? "Access denied." : "Login failed.";
      try {
        // If backend sent an object, prefer known fields
        if (detail && typeof detail === "object") {
          const m = (detail.error_description || detail.errorMessage || detail.message || detail.error || detail.detail);
          if (typeof m === "string" && m.trim()) return m;
        }
        // If backend sent a string, extract any JSON payload and prefer description
        if (typeof detail === "string" && detail) {
          const str = detail;
          // Friendly rewrites
          if (/not verified/i.test(str)) return "Please verify your email, then sign in.";
          if (/invalid credentials/i.test(str) && /not fully set up|setup/i.test(str)) return "Account is not fully set up. Please complete verification.";
          if (/SSO unavailable/i.test(str)) return "Sign-in service is temporarily unavailable. Please try again soon.";
          // Try to parse an inline JSON object within the string
          const start = str.indexOf("{");
          const end = str.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            try {
              const jsonText = str.slice(start, end + 1);
              const obj = JSON.parse(jsonText);
              const msg = obj.error_description || obj.errorMessage || obj.message || obj.detail;
              if (typeof msg === "string" && msg.trim()) return msg;
            } catch { /* ignore parse errors */ }
          }
          // Strip any trailing JSON-looking payload to avoid raw JSON in UI
          if (str.includes("{")) {
            return str.slice(0, str.indexOf("{")) .trim().replace(/[ :\-]+$/, "") || fallback;
          }
          return str;
        }
      } catch { /* fall through to fallback */ }
      return fallback;
    }
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
          const tid = body?.tenant_id;
          setTenantId(tid ? String(tid) : null);
        } catch (_e) { void _e; }
        window.location.href = "/";
        return;
      }
      const body = await res.json().catch(() => ({} as any));
      const detail = (body?.detail ?? body);
      setError(formatErrorMessage(detail, res.status));
      (emailRef.current ?? undefined)?.focus();
    } catch (err: any) {
      setError("Could not reach the server. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold uppercase tracking-wide">Sign in</h1>
          <p className="text-sm text-muted-foreground">Access your lead generation workspace.</p>
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
