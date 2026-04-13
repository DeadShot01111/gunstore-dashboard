import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-lg text-center rounded-2xl border border-red-900 bg-zinc-950 p-8">
        <h1 className="text-3xl font-bold text-red-500 mb-4">Access Denied</h1>
        <p className="text-zinc-300 mb-6">
          Your account does not currently have permission to access this dashboard.
        </p>

        <Link
          href="/"
          className="inline-block rounded-xl bg-red-700 hover:bg-red-600 px-6 py-3 font-semibold transition"
        >
          Return Home
        </Link>
      </div>
    </main>
  );
}