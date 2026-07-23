import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getInvoicePdf } from "@/lib/invoice-mail";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.permissions, PERMISSIONS.BILLING_MANAGE)) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const pdf = await getInvoicePdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice.pdf"`,
    },
  });
}
