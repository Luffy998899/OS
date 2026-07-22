import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "./button";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * A Button rendered as a Next.js Link. Sets nativeButton={false} so Base UI
 * renders a real <a> without warning about button semantics.
 */
export function ButtonLink({
  href,
  children,
  ...props
}: { href: string } & Omit<ButtonProps, "render">) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  );
}
