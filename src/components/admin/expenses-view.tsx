"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Loader2, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { istDateString } from "@/lib/time";

type Expense = RouterOutputs["expense"]["list"][number];

function fmtDate(d: string) {
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : format(parsed, "dd MMM yyyy");
}

export function ExpensesView() {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  });
  const [removeTarget, setRemoveTarget] = useState<Expense | null>(null);

  const expenses = trpc.expense.list.useQuery();
  const utils = trpc.useUtils();
  const remove = trpc.expense.remove.useMutation({
    onSuccess: () => {
      utils.expense.list.invalidate();
      setRemoveTarget(null);
      toast.success("Expense removed.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (expenses.data ?? []).filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()),
  );
  const total = rows.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Track what your organisation spends."
      >
        <Button onClick={() => setDialog({ open: true, expense: null })}>
          <Plus className="size-4" />
          Add expense
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="pl-9"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground tabular-nums">{formatINR(total)}</span>
        </span>
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <Wallet className="mx-auto mb-2 size-6 opacity-40" />
                  No expenses logged yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtDate(e.date)}</TableCell>
                  <TableCell className="font-medium">{e.title}</TableCell>
                  <TableCell className="text-muted-foreground">{e.category ?? "—"}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground">{e.notes ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatINR(e.amount)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialog({ open: true, expense: e })}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(e)}>
                          Remove
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

      {dialog.open ? (
        <ExpenseDialog
          key={dialog.expense?.id ?? "new"}
          state={dialog}
          onClose={() => setDialog({ open: false, expense: null })}
        />
      ) : null}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.title ?? "expense"}?`}
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate({ id: removeTarget.id })}
      />
    </>
  );
}

function ExpenseDialog({
  state,
  onClose,
}: {
  state: { open: boolean; expense: Expense | null };
  onClose: () => void;
}) {
  const editing = state.expense;
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [amount, setAmount] = useState(String(editing?.amount ?? ""));
  const [date, setDate] = useState(editing?.date ?? istDateString());
  const [notes, setNotes] = useState(editing?.notes ?? "");

  const onDone = () => {
    utils.expense.list.invalidate();
    onClose();
  };
  const create = trpc.expense.create.useMutation({
    onSuccess: () => {
      toast.success("Expense added.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.expense.update.useMutation({
    onSuccess: () => {
      toast.success("Saved.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    const payload = { title, category, amount: Number(amount) || 0, date, notes };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Record spend on products, tools and services.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="e-title">Title</Label>
          <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="e-cat">Category</Label>
            <Input id="e-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-amt">Amount (₹)</Label>
            <Input id="e-amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-date">Date</Label>
          <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-notes">Notes</Label>
          <Textarea id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 1 || Number(amount) <= 0 || create.isPending || update.isPending}
            onClick={submit}
          >
            {create.isPending || update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Save" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
