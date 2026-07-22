import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d="M16 9 L10.5 23 M16 9 L21.5 23 M12.8 17.5 L19.2 17.5"
        className="stroke-background"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="9" r="2.3" className="fill-background" />
      <circle cx="10.5" cy="23" r="2.3" className="fill-background" />
      <circle cx="21.5" cy="23" r="2.3" className="fill-background" />
    </svg>
  );
}

export function Wordmark({
  className,
  textClassName,
}: {
  className?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="size-7 shrink-0" />
      <span
        className={cn(
          "font-display text-[1.35rem] leading-none font-semibold tracking-tight",
          textClassName,
        )}
      >
        Auxa
      </span>
    </div>
  );
}
