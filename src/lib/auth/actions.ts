"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "./session";
import { parsePermissions } from "./permissions";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInState = { error?: string };

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email },
    include: { role: true },
  });

  // Constant-ish messaging to avoid leaking which accounts exist.
  if (!user || user.status === "suspended") {
    return { error: "Invalid email or password." };
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid email or password." };
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: parsePermissions(user.role.permissions),
  });
  await setSessionCookie(token);
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  redirect("/my-work");
}

export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/sign-in");
}
