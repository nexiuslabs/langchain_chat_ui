"use client"
import React from "react"
import AppShell from "@/components/ui/app-shell"
import { CandidatesPanel } from "@/components/CandidatesPanel"

export default function CandidatesPage() {
  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <AppShell />
      <div className="max-w-5xl mx-auto p-4 grid gap-4">
        <CandidatesPanel height={520} />
      </div>
    </React.Suspense>
  )
}
