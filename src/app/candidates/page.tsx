"use client"
import React from "react"
import AppShell from "@/components/ui/app-shell"
import { CandidatesPanel } from "@/components/CandidatesPanel"

export default function CandidatesPage() {
  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <AppShell />
      <div className="mx-auto px-2 sm:px-4 py-2 grid gap-2">
        <CandidatesPanel height={720} />
      </div>
    </React.Suspense>
  )
}
