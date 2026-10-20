import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginOptions } from "@/server/services/sso-settings";
import { isSsoErrorCode, sanitizeNext } from "@/server/sso/oauth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = sanitizeNext(next);
  if (await getCurrentUser()) redirect(safeNext);
  const sso = loginOptions();
  return <LoginForm next={safeNext} sso={{ ...sso, error: isSsoErrorCode(error) ? error : null }} />;
}
