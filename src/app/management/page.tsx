import { auth } from "@/auth";
import { redirect } from "next/navigation";

import ManagementClient from "./management-client";

export default async function ManagementPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const roles = (session.user as { roles?: string[] }).roles ?? [];

  if (!roles.includes("management")) {
    redirect("/unauthorized");
  }

  return <ManagementClient />;
}
