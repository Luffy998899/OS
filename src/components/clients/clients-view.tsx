"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Loader2, Flame, Users2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { FormSelect } from "@/components/app/form-select";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  ClientStatusBadge,
  TemperatureBadge,
} from "@/components/app/status-badge";
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
import { ClientSheet } from "./client-sheet";

type ClientRow = RouterOutputs["clients"]["list"][number];

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "churned", label: "Churned" },
];
const TEMP_OPTIONS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export function ClientsView({ canManage }: { canManage: boolean }) {
  const clients = trpc.clients.list.useQuery();
  const utils = trpc.useUtils();

  const [dialog, setDialog] = useState<{ open: boolean; client: ClientRow | null }>(
    { open: false, client: null },
  );
  const [removeTarget, setRemoveTarget] = useState<ClientRow | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const remove = trpc.clients.remove.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      setRemoveTarget(null);
      toast.success("Client removed.");
    },
    onError: (e) => toast.error(e.message),
  });

  const total = clients.data?.length ?? 0;
  const active = clients.data?.filter((c) => c.status === "active").length ?? 0;
  const hot = clients.data?.filter((c) => c.temperature === "hot").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        description="Your pipeline — accounts, owners, and hot/cold status at a glance."
      >
        {canManage ? (
          <Button onClick={() => setDialog({ open: true, client: null })}>
            <Plus className="size-4" />
            Add client
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricCard label="Clients" value={total} icon={Building2} />
        <MetricCard label="Active" value={active} icon={Users2} />
        <MetricCard label="Hot leads" value={hot} icon={Flame} />
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Company</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Temp.</TableHead>
              <TableHead>Manager</TableHead>
              {canManage ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.data?.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => setOpenId(c.id)}
              >
                <TableCell className="font-medium">{c.companyName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.ownerName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.category ?? "—"}
                </TableCell>
                <TableCell>
                  <ClientStatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <TemperatureBadge temperature={c.temperature} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.manager?.name ?? "—"}
                </TableCell>
                {canManage ? (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setDialog({ open: true, client: c })}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOpenId(c.id)}>
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setRemoveTarget(c)}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {canManage && dialog.open ? (
        <ClientDialog
          key={dialog.client?.id ?? "new"}
          state={dialog}
          statusOptions={STATUS_OPTIONS}
          tempOptions={TEMP_OPTIONS}
          onClose={() => setDialog({ open: false, client: null })}
        />
      ) : null}

      <ClientSheet
        clientId={openId}
        open={!!openId}
        canManage={canManage}
        onOpenChange={(v) => !v && setOpenId(null)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.companyName ?? "client"}?`}
        description="This deletes the client and its outreach history."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          removeTarget && remove.mutate({ id: removeTarget.id })
        }
      />
    </>
  );
}

function ClientDialog({
  state,
  statusOptions,
  tempOptions,
  onClose,
}: {
  state: { open: boolean; client: ClientRow | null };
  statusOptions: { value: string; label: string }[];
  tempOptions: { value: string; label: string }[];
  onClose: () => void;
}) {
  const editing = state.client;
  const utils = trpc.useUtils();
  const managers = trpc.clients.managers.useQuery();

  const [companyName, setCompanyName] = useState(editing?.companyName ?? "");
  const [ownerName, setOwnerName] = useState(editing?.ownerName ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [status, setStatus] = useState(editing?.status ?? "new");
  const [temperature, setTemperature] = useState(editing?.temperature ?? "cold");
  const [managerId, setManagerId] = useState(editing?.manager?.id ?? "");
  const [notes, setNotes] = useState("");

  const onDone = () => {
    utils.clients.list.invalidate();
    onClose();
  };
  const create = trpc.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Client added.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.clients.update.useMutation({
    onSuccess: () => {
      toast.success("Saved.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    const payload = {
      companyName,
      ownerName,
      email,
      phone,
      category,
      status: status as "new" | "active" | "suspended" | "churned",
      temperature: temperature as "hot" | "warm" | "cold",
      managerId: managerId || undefined,
      notes,
    };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit client" : "Add client"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update account details." : "Add a new account to your pipeline."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="c-company">Company</Label>
          <Input
            id="c-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="c-owner">Contact</Label>
            <Input
              id="c-owner"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-cat">Category</Label>
            <Input
              id="c-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">Phone</Label>
            <Input
              id="c-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Status</Label>
            <FormSelect
              value={status}
              onValueChange={setStatus}
              options={statusOptions}
            />
          </div>
          <div className="space-y-2">
            <Label>Temperature</Label>
            <FormSelect
              value={temperature}
              onValueChange={setTemperature}
              options={tempOptions}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Account manager</Label>
          <FormSelect
            value={managerId}
            onValueChange={setManagerId}
            placeholder="Unassigned"
            options={(managers.data ?? []).map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
        </div>
        {!editing ? (
          <div className="space-y-2">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea
              id="c-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              companyName.trim().length < 1 ||
              create.isPending ||
              update.isPending
            }
            onClick={submit}
          >
            {create.isPending || update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {editing ? "Save" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
