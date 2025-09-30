import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { Issuer } from "openid-client";

function decodeJwtNoVerify(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function buildProviders() {
  const providers: any[] = [];
  const issuerUrl = process.env.NEXIUS_ISSUER;
  const cid = process.env.NEXIUS_CLIENT_ID;
  const secret = process.env.NEXIUS_CLIENT_SECRET;
  if (issuerUrl && cid && secret) {
    try {
      const discovered = await Issuer.discover(issuerUrl);
      providers.push({
        id: "nexius",
        name: "Nexius",
        type: "oauth",
        version: "2.0",
        idToken: true,
        checks: ["pkce", "state"],
        authorization: { params: { scope: "openid profile email" } },
        clientId: cid,
        clientSecret: secret,
        issuer: discovered.issuer,
        wellKnown: `${discovered.issuer}/.well-known/openid-configuration`,
        profile(profile: any) {
          // Preserve common custom claims so downstream can read tenant/roles
          const tenant_id = (profile as any)?.tenant_id ?? (profile as any)?.["https://claims/tenant_id"]; 
          const roles = (profile as any)?.roles ?? (profile as any)?.["https://claims/roles"]; 
          return { id: profile.sub, email: profile.email, tenant_id, roles } as any;
        },
      });
    } catch (e) {
      console.warn(
        "Nexius OIDC discovery failed; falling back to dev credentials login.",
        e
      );
    }
  }
  if (providers.length === 0) {
    // Dev-only fallback to unblock local development when SSO env is not set
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Nexius SSO (OIDC) is not configured in production. Set NEXIUS_ISSUER, NEXIUS_CLIENT_ID, NEXIUS_CLIENT_SECRET."
      );
    }
    providers.push(
      Credentials({
        name: "Login",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(creds) {
          const email = (creds as any)?.email;
          const password = (creds as any)?.password;
          if (!email || !password) return null;
          const tenant = process.env.DEFAULT_TENANT_ID || "dev";
          return { id: email, email, tenant_id: tenant } as any;
        },
      })
    );
  }
  return providers;
}

const handler = NextAuth({
  providers: await buildProviders(),
  session: { strategy: "jwt" },
  // Route all sign-in/out flows through our custom login page
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Preserve ID token when provided by OIDC provider
      if (account?.id_token) (token as any).id_token = account.id_token;

      // Derive email consistently from user/profile on initial sign-in
      const anyProf: any = (profile as any) || (user as any) || {};
      const email = (user as any)?.email || anyProf?.email || (token as any).email;
      if (email) (token as any).email = email;

      // Map tenant/roles from OIDC claims or credentials user
      (token as any).tenant_id =
        anyProf?.tenant_id ??
        anyProf?.["https://claims/tenant_id"] ??
        (token as any).tenant_id ??
        null;
      (token as any).roles =
        anyProf?.roles ?? anyProf?.["https://claims/roles"] ?? (token as any).roles ?? [];

      // Fallback: if still missing, decode id_token and extract claims
      if (!(token as any).tenant_id && account?.id_token) {
        const claims = decodeJwtNoVerify(account.id_token);
        if (claims) {
          (token as any).tenant_id = claims.tenant_id ?? claims["https://claims/tenant_id"] ?? null;
          if (!email && claims.email) (token as any).email = claims.email;
          (token as any).roles = claims.roles ?? claims["https://claims/roles"] ?? (token as any).roles ?? [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).idToken = (token as any).id_token;
      // Ensure user object exists and propagate email for header bar
      (session as any).user = (session as any).user || {};
      if ((token as any).email) (session as any).user.email = (token as any).email;
      (session as any).tenantId = (token as any).tenant_id ?? null;
      (session as any).roles = (token as any).roles ?? [];
      // Expose issuer and NEXTAUTH_URL for client-side global logout flow
      (session as any).issuer = process.env.NEXIUS_ISSUER || null;
      (session as any).nextauthUrl = process.env.NEXTAUTH_URL || null;
      // Expose public client id to assist front-channel logout
      (session as any).clientId = process.env.NEXIUS_CLIENT_ID || null;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
