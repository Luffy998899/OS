import type { Metadata } from "next";
import { Logo, Wordmark } from "@/components/brand/logo";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ROOMS = [
  "Developer",
  "Creative",
  "Video Editing",
  "Managing Heads",
  "Common Board",
  "Client",
  "Creativity",
];

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left — the pitch + a glimpse of the virtual office floor */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
        <Wordmark textClassName="text-background" />

        <div className="max-w-md">
          <p className="font-mono text-xs tracking-widest text-background/50 uppercase">
            Work OS · CRM
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            One floor for the whole team — run by an AI that never drops a task.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-background/70">
            Missions instead of tickets. A whiteboard for every idea. Check in,
            do the work, log your day — Auxa keeps the rest moving.
          </p>
        </div>

        <div>
          <p className="mb-3 font-mono text-[0.7rem] tracking-widest text-background/40 uppercase">
            The office
          </p>
          <div className="flex flex-wrap gap-2">
            {ROOMS.map((room) => (
              <span
                key={room}
                className="rounded-md border border-background/15 px-2.5 py-1 text-xs text-background/70"
              >
                {room}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Right — sign in */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="size-9" />
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Sign in to Auxa
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Accounts are created by your admin. There is no public sign-up.
          </p>

          <div className="mt-8">
            <SignInForm />
          </div>

          <details className="mt-8 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground select-none">
              Demo access
            </summary>
            <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
              <p>admin@auxa.app · owner</p>
              <p>manager@auxa.app · manager</p>
              <p>rohan@auxa.app · employee</p>
              <p className="pt-1 text-foreground">password: auxa1234</p>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
