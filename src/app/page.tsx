import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  const user = session?.user as { role?: string; roles?: string[] } | undefined;
  const roles = user?.roles ?? [];

  if (session?.user) {
    const hasEmployee = roles.includes("employee");
    const hasManagement = roles.includes("management");

    if (hasEmployee && hasManagement) {
      return (
        <main className="min-h-screen flex items-center justify-center px-6 text-white">
          <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-black/25 p-10 text-center backdrop-blur-xl">
            <h1 className="text-5xl font-bold tracking-tight mb-6">
              Gunstore 60 Control Panel
            </h1>

            <p className="text-lg text-zinc-300 mb-10">
              Choose which dashboard you want to open.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/employee"
                className="rounded-xl bg-red-600 hover:bg-red-500 px-8 py-4 font-semibold transition"
              >
                Employee Dashboard
              </Link>

              <Link
                href="/management"
                className="rounded-xl border border-white/10 bg-black/25 hover:bg-white/10 px-8 py-4 font-semibold transition"
              >
                Management Dashboard
              </Link>
            </div>

            <div className="mt-8">
              <form
                action={async () => {
                  "use server";
                  await signIn("discord", { redirectTo: "/" });
                }}
              >
                <button className="text-sm text-zinc-400 hover:text-white transition">
                  Switch Account
                </button>
              </form>
            </div>
          </div>
        </main>
      );
    }

    if (hasManagement) redirect("/management");
    if (hasEmployee) redirect("/employee");
    redirect("/unauthorized");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-white">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-black/25 p-10 text-center backdrop-blur-xl">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Gunstore 60 Control Panel
        </h1>

        <p className="text-lg text-zinc-300 mb-10">
          Staff and management dashboard for pricing, VIP orders, inventory tools,
          and store operations.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/" });
          }}
        >
          <button className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-8 py-4 font-semibold transition">
            Sign In with Discord
          </button>
        </form>
      </div>
    </main>
  );
}