import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as {
    role?: string;
    roles?: string[];
    nickname?: string | null;
    avatar?: string | null;
    name?: string | null;
  };

  const roles = user.roles ?? [];
  const displayName = user.nickname || user.name || "User";
  const avatar = user.avatar || null;

  const isEmployee = roles.includes("employee");
  const isManagement = roles.includes("management");

  if (!isEmployee && !isManagement) {
    redirect("/unauthorized");
  }

  if (isEmployee && !isManagement) {
    redirect("/employee");
  }

  if (isManagement && !isEmployee) {
    redirect("/management");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#120000] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,0,0,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,0,0,0.10),transparent_28%),linear-gradient(to_bottom,#160000,#090909)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:34px_34px] opacity-30" />
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-black/30 p-8 shadow-[0_0_80px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-12">
          <div className="flex flex-col items-center text-center">
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="mb-5 h-20 w-20 rounded-full border border-white/15 object-cover shadow-[0_8px_25px_rgba(0,0,0,0.35)]"
              />
            ) : (
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-red-600 text-2xl font-bold text-white shadow-[0_8px_25px_rgba(0,0,0,0.35)]">
                {displayName.charAt(0)}
              </div>
            )}

            <div className="mb-4 inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-medium tracking-[0.2em] text-red-200 uppercase">
              Authenticated • {displayName}
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
              Select Workspace
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
              Choose which control panel you want to open. Your access is based on your
              verified Discord server roles.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <a
              href="/employee"
              className="group rounded-3xl border border-red-500/20 bg-red-600 p-6 text-left text-white shadow-[0_14px_35px_rgba(127,0,0,0.35)] transition duration-200 hover:scale-[1.01] hover:bg-red-500"
            >
              <div className="mb-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white/90">
                Staff Workspace
              </div>

              <div className="text-2xl font-bold">Employee Dashboard</div>

              <p className="mt-3 text-sm leading-6 text-white/85">
                Build sales, apply VIP pricing, manage orders, and complete day-to-day staff workflow.
              </p>

              <div className="mt-6 text-sm font-semibold text-white">
                Open employee dashboard →
              </div>
            </a>

            <a
              href="/management"
              className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-left text-white backdrop-blur-md transition duration-200 hover:scale-[1.01] hover:bg-white/[0.05]"
            >
              <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-300">
                Admin Workspace
              </div>

              <div className="text-2xl font-bold">Management Dashboard</div>

              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Review weekly sales, material expenses, product pricing, commissions, and business reports.
              </p>

              <div className="mt-6 text-sm font-semibold text-white">
                Open management dashboard →
              </div>
            </a>
          </div>

          <div className="mt-8 text-center">
            <a
              href="/login"
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Switch Account
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}