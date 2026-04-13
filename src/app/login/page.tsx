"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#120000] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,0,0,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,0,0,0.10),transparent_28%),linear-gradient(to_bottom,#160000,#090909)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:34px_34px] opacity-30" />
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-medium tracking-[0.2em] text-red-200 uppercase">
              Gunstore 60 • Staff Access
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
              Gunstore 60 Control Panel
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
              Secure staff and management access for pricing, sales logging, product controls,
              commissions, and weekly business reporting.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-md">
              <div className="text-sm font-semibold text-white">Sales Workflow</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Fast order building, VIP pricing, and finalized weekly sales tracking.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-md">
              <div className="text-sm font-semibold text-white">Management Tools</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Review expenses, commissions, product pricing, and performance reports.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-md">
              <div className="text-sm font-semibold text-white">Discord Verified</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Role-based access tied directly to your authorized Discord server permissions.
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center gap-4">
            <button
              onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
              className="inline-flex min-w-[250px] items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-600 px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,70,229,0.35)] transition duration-200 hover:scale-[1.01] hover:bg-indigo-500"
            >
              Sign In with Discord
            </button>

            <p className="text-xs text-zinc-500">
              Authorized access only for Gunstore 60 staff and management.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}