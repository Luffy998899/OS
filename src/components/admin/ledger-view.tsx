"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { FormSelect } from "@/components/app/form-select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import { formatINR } from "@/lib/finance";
import { cn } from "@/lib/utils";

function fmtDate(d: string) {
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : format(parsed, "dd MMM yyyy");
}

export function LedgerView() {
  const [filter, setFilter] = useState<"all" | "invoice" | "expense">("all");
  const ledger = trpc.ledger.data.useQuery();

  const entries = (ledger.data?.entries ?? []).filter((e) =>
    filter === "all" ? true : e.type === filter,
  );

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Ledger"
        description="Running record of invoices and expenses."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Collected" value={formatINR(ledger.data?.collected ?? 0)} />
        <MetricCard label="Expenses" value={formatINR(ledger.data?.expenses ?? 0)} />
        <MetricCard label="Current balance" value={formatINR(ledger.data?.currentBalance ?? 0)} />
      </div>

      <div className="mb-4 w-44">
        <FormSelect
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: "all", label: "All entries" },
            { value: "invoice", label: "Invoices" },
            { value: "expense", label: "Expenses" },
          ]}
        />
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No entries yet. Create invoices and log expenses to build your ledger.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={`${e.type}-${e.id}`}>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtDate(e.date)}</TableCell>
                  <TableCell className="font-medium">{e.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {e.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {e.status ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          e.status === "paid"
                            ? "bg-success/10 text-success"
                            : e.status === "cancelled"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/10 text-warning",
                        )}
                      >
                        {e.status === "paid" ? "Paid" : e.status === "sent" ? "Pending" : e.status}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      e.amount < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {e.amount < 0 ? "- " : ""}
                    {formatINR(Math.abs(e.amount))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatINR(e.balance)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
