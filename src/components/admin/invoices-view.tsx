"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, FileText, Loader2, Send, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

type Invoice = RouterOutputs["invoice"]["list"][number];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function fmtDate(d: string) {
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : format(parsed, "dd MMM yyyy");
}

export function InvoicesView() {
  const invoices = trpc.invoice.list.useQuery();
  const utils = trpc.useUtils();
  const [removeTarget, setRemoveTarget] = useState<Invoice | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const setStatus = trpc.invoice.setStatus.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate();
      utils.ledger.data.invalidate();
      toast.success("Invoice updated.");
    },
    onError: (e) => toast.error(e.message),
  });
  const send = trpc.invoice.send.useMutation({
    onSuccess: (res) => {
      utils.invoice.list.invalidate();
      setSendingId(null);
      if (res.sent) toast.success(`Invoice emailed to ${res.to}.`);
      else if (res.skipped) toast.warning(res.error ?? "Email skipped.");
      else toast.error(res.error ?? "Could not send.");
    },
    onError: (e) => {
      setSendingId(null);
      toast.error(e.message);
    },
  });
  const remove = trpc.invoice.remove.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate();
      utils.ledger.data.invalidate();
      setRemoveTarget(null);
      toast.success("Invoice deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Create GST invoices, email them as PDF, and track payment."
      >
        <ButtonLink href="/admin/invoices/new">
          <Plus className="size-4" />
          New invoice
        </ButtonLink>
      </PageHeader>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (invoices.data?.length ?? 0) === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-6 opacity-40" />
                  No invoices yet. Create your first one.
                </TableCell>
              </TableRow>
            ) : (
              invoices.data?.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs font-medium">{inv.number}</TableCell>
                  <TableCell className="font-medium">{inv.billToName}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtDate(inv.invoiceDate)}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLE[inv.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatINR(inv.total)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        {sendingId === inv.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, "_blank")}
                        >
                          <Download className="size-4" />
                          View / download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSendingId(inv.id);
                            send.mutate({ id: inv.id });
                          }}
                        >
                          <Send className="size-4" />
                          Email to client
                        </DropdownMenuItem>
                        {inv.status !== "paid" ? (
                          <DropdownMenuItem
                            onClick={() => setStatus.mutate({ id: inv.id, status: "paid" })}
                          >
                            <CheckCircle2 className="size-4" />
                            Mark as paid
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(inv)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Delete ${removeTarget?.number ?? "invoice"}?`}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate({ id: removeTarget.id })}
      />
    </>
  );
}
