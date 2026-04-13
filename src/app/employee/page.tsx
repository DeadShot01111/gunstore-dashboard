import { auth } from "@/auth";
import { redirect } from "next/navigation";
import EmployeeClient from "./employee-client";

export default async function EmployeePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const roles = ((session.user as { roles?: string[] }).roles ?? []);

  if (!roles.includes("employee")) {
    redirect("/unauthorized");
  }

  return <EmployeeClient user={session.user} role="employee" />;
}