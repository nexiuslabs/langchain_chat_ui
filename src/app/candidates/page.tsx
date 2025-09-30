"use client"
import React from "react"
import HeaderBar from "@/components/ui/header-bar"
import { CandidatesPanel } from "@/components/CandidatesPanel"
import { IndustryJobLauncher } from "@/components/IndustryJobLauncher"

export default function CandidatesPage() {
  return (
    <React.Suspense fallback={<div>Loading…</div>}>
      <HeaderBar />
      <div className="max-w-5xl mx-auto p-4 grid gap-4">
        <IndustryJobLauncher />
        <CandidatesPanel height={520} />
      </div>
    </React.Suspense>
  )
}

