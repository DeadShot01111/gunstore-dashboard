import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(185,28,28,0.2),transparent_26%),radial-gradient(circle_at_82%_22%,rgba(251,191,36,0.09),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(127,29,29,0.25),transparent_30%),linear-gradient(180deg,#130202_0%,#0a0a0a_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:36px_36px] opacity-20" />
      <div className="absolute inset-0 bg-black/25" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-6 py-10">
        {children}
      </div>
    </main>
  );
}

function HeroCopy() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4">
        <Image
          src="/logo2.png"
          alt="Gunstore 60 logo"
          width={56}
          height={56}
          className="h-12 w-12 object-contain opacity-95"
          priority
        />

        <div className="inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200">
          Ammunation 60
        </div>
      </div>

      <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
        Operations access for sales, pricing, and weekly reporting.
      </h1>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
          <div className="text-sm font-semibold text-white">Sales Logs</div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Review orders, adjust records, and keep weekly activity clean.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
          <div className="text-sm font-semibold text-white">Commissions</div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Track payout status, overrides, and profit-driven commission totals.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
          <div className="text-sm font-semibold text-white">Performance</div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Monitor weekly profit, material costs, and reporting exports.
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInPanel() {
  return (
    <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-7">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-semibold text-white">Authorized Access</div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Sign in with Discord to continue to the Gunstore 60 dashboard.
        </p>
      </div>

      <form
        className="mt-5"
        action={async () => {
          "use server";
          await signIn("discord", { redirectTo: "/" });
        }}
      >
        <button className="w-full rounded-2xl bg-red-600 px-6 py-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(220,38,38,0.35)] transition hover:bg-red-500">
          Sign In with Discord
        </button>
      </form>
    </div>
  );
}

function RolePicker() {
  return (
    <div className="w-full rounded-[32px] border border-white/10 bg-black/35 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-10">
      <div className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200">
          Dual Access Detected
        </div>

        <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-6xl">
          Choose your workspace.
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
          Your account has both employee and management access. Pick the view
          you want to open for this session.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
        <Link
          href="/employee"
          className="group rounded-[28px] border border-white/10 bg-white/[0.04] p-6 transition hover:border-red-400/30 hover:bg-red-500/10"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Employee
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            Sales Dashboard
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Build orders, apply VIP pricing, and finalize weekly sales quickly.
          </p>
          <div className="mt-6 text-sm font-semibold text-white transition group-hover:text-red-200">
            Open employee view
          </div>
        </Link>

        <Link
          href="/management"
          className="group rounded-[28px] border border-white/10 bg-white/[0.04] p-6 transition hover:border-amber-300/30 hover:bg-amber-500/10"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Management
          </div>
          <div className="mt-3 text-2xl font-bold text-white">
            Control Panel
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Review sales logs, commission payouts, materials, pricing, and reports.
          </p>
          <div className="mt-6 text-sm font-semibold text-white transition group-hover:text-amber-100">
            Open management view
          </div>
        </Link>
      </div>

      <div className="mt-8 text-center">
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/" });
          }}
        >
          <button className="text-sm text-zinc-500 transition hover:text-white">
            Switch Account
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const session = await auth();
  const user = session?.user as { role?: string; roles?: string[] } | undefined;
  const roles = user?.roles ?? [];

  if (session?.user) {
    const hasEmployee = roles.includes("employee");
    const hasManagement = roles.includes("management");

    if (hasEmployee && hasManagement) {
      return (
        <Shell>
          <RolePicker />
        </Shell>
      );
    }

    if (hasManagement) redirect("/management");
    if (hasEmployee) redirect("/employee");
    redirect("/unauthorized");
  }

  return (
    <Shell>
      <div className="grid w-full items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <HeroCopy />
        <SignInPanel />
      </div>
    </Shell>
  );
}
