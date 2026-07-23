"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Loader2, Layers, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
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

type Service = RouterOutputs["service"]["list"][number];

export function ServicesView() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; service: Service | null }>({
    open: false,
    service: null,
  });
  const [removeTarget, setRemoveTarget] = useState<Service | null>(null);

  const services = trpc.service.list.useQuery({ includeInactive: showInactive });
  const utils = trpc.useUtils();
  const update = trpc.service.update.useMutation({
    onSuccess: () => utils.service.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.service.remove.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      setRemoveTarget(null);
      toast.success("Service removed.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (services.data ?? []).filter((s) =>
    (s.name + " " + (s.category ?? "")).toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = (services.data ?? []).filter((s) => s.active).length;

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Services"
        description="The catalog you bill from — suggestions feed straight into invoices."
      >
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
          <span className="font-display text-lg font-semibold tabular-nums">
            {activeCount}
          </span>
          <span className="text-muted-foreground">active</span>
        </div>
        <Button onClick={() => setDialog({ open: true, service: null })}>
          <Plus className="size-4" />
          Add service
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or category…"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showInactive ? "Hide inactive" : "Show inactive"}
        </Button>
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Base price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  <Layers className="mx-auto mb-2 size-6 opacity-40" />
                  No services yet. Add the first one to bill from it.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.category ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(s.basePrice)}</TableCell>
                  <TableCell>
                    {s.active ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="size-1.5 rounded-full bg-success" /> Active
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialog({ open: true, service: s })}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => update.mutate({ id: s.id, active: !s.active })}
                        >
                          {s.active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget(s)}>
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
        <ServiceDialog
          key={dialog.service?.id ?? "new"}
          state={dialog}
          onClose={() => setDialog({ open: false, service: null })}
        />
      ) : null}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? "service"}?`}
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate({ id: removeTarget.id })}
      />
    </>
  );
}

function ServiceDialog({
  state,
  onClose,
}: {
  state: { open: boolean; service: Service | null };
  onClose: () => void;
}) {
  const editing = state.service;
  const utils = trpc.useUtils();
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [hsnSac, setHsnSac] = useState(editing?.hsnSac ?? "");
  const [basePrice, setBasePrice] = useState(String(editing?.basePrice ?? "0"));

  const onDone = () => {
    utils.service.list.invalidate();
    onClose();
  };
  const create = trpc.service.create.useMutation({
    onSuccess: () => {
      toast.success("Service added.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.service.update.useMutation({
    onSuccess: () => {
      toast.success("Saved.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    const payload = {
      name,
      category,
      description,
      hsnSac,
      basePrice: Number(basePrice) || 0,
    };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>Set the price and details you bill from.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="s-cat">Category</Label>
            <Input id="s-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-hsn">HSN/SAC</Label>
            <Input id="s-hsn" value={hsnSac} onChange={(e) => setHsnSac(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-price">Base price (₹)</Label>
          <Input
            id="s-price"
            type="number"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-desc">Description</Label>
          <Textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={name.trim().length < 1 || create.isPending || update.isPending} onClick={submit}>
            {create.isPending || update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Save" : "Add service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
