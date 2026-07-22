"use client";

import { useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Loader2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { FormSelect } from "@/components/app/form-select";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  parsePermissions,
} from "@/lib/auth/permissions";
import { initials, formatNumber } from "@/lib/format";

type UserRow = RouterOutputs["user"]["list"][number];
type RoleRow = RouterOutputs["role"]["list"][number];

export function PeopleAdmin() {
  const users = trpc.user.list.useQuery();
  const roles = trpc.role.list.useQuery();

  const [userDialog, setUserDialog] = useState<{
    open: boolean;
    user: UserRow | null;
  }>({ open: false, user: null });
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [removeUser, setRemoveUser] = useState<UserRow | null>(null);
  const [roleDialog, setRoleDialog] = useState<{
    open: boolean;
    role: RoleRow | null;
  }>({ open: false, role: null });
  const [removeRole, setRemoveRole] = useState<RoleRow | null>(null);

  const utils = trpc.useUtils();
  const updateUser = trpc.user.update.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
      toast.success("Updated.");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = trpc.user.remove.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
      setRemoveUser(null);
      toast.success("Member removed.");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteRole = trpc.role.remove.useMutation({
    onSuccess: () => {
      utils.role.list.invalidate();
      setRemoveRole(null);
      toast.success("Role deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  const activeCount =
    users.data?.filter((u) => u.status === "active").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="People & Role"
        description="Create accounts for your team, assign roles, and shape what each role can do."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricCard label="Team members" value={users.data?.length ?? 0} icon={UserPlus} />
        <MetricCard label="Active" value={activeCount} />
        <MetricCard label="Roles" value={roles.data?.length ?? 0} icon={ShieldCheck} />
      </div>

      <Tabs defaultValue="people" className="w-full">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setUserDialog({ open: true, user: null })}>
              <Plus className="size-4" />
              Add employee
            </Button>
          </div>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          {u.avatarUrl ? (
                            <AvatarImage src={u.avatarUrl} alt="" />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{u.role.name}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.department ?? "—"}
                    </TableCell>
                    <TableCell>
                      {u.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="size-1.5 rounded-full bg-success" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-muted-foreground" />
                          {u.status === "suspended" ? "Suspended" : "Invited"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(u.points)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setUserDialog({ open: true, user: u })
                            }
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPwUser(u)}>
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              updateUser.mutate({
                                id: u.id,
                                status:
                                  u.status === "suspended"
                                    ? "active"
                                    : "suspended",
                              })
                            }
                          >
                            {u.status === "suspended"
                              ? "Activate"
                              : "Suspend"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemoveUser(u)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setRoleDialog({ open: true, role: null })}>
              <Plus className="size-4" />
              New role
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roles.data?.map((r) => {
              const perms = parsePermissions(r.permissions);
              const isWildcard = perms.includes("*");
              return (
                <Card key={r.id} className="gap-3">
                  <div className="flex items-start justify-between px-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading text-sm font-semibold">
                          {r.name}
                        </h3>
                        {r.isSystem ? (
                          <Badge variant="outline">System</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r._count.users} member
                        {r._count.users === 1 ? "" : "s"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setRoleDialog({ open: true, role: r })
                          }
                        >
                          Edit permissions
                        </DropdownMenuItem>
                        {!r.isSystem ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setRemoveRole(r)}
                            >
                              Delete role
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {r.description ? (
                    <p className="px-4 text-xs text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 px-4">
                    {isWildcard ? (
                      <Badge>Full access</Badge>
                    ) : perms.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No elevated permissions
                      </span>
                    ) : (
                      perms.map((p) => (
                        <Badge key={p} variant="secondary">
                          {PERMISSION_LABELS[
                            p as keyof typeof PERMISSION_LABELS
                          ] ?? p}
                        </Badge>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <UserDialog
        key={userDialog.user?.id ?? "new"}
        state={userDialog}
        roles={roles.data ?? []}
        onClose={() => setUserDialog({ open: false, user: null })}
      />
      <ResetPasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
      <RoleDialog
        key={roleDialog.role?.id ?? "new-role"}
        state={roleDialog}
        onClose={() => setRoleDialog({ open: false, role: null })}
      />
      <ConfirmDialog
        open={!!removeUser}
        onOpenChange={(v) => !v && setRemoveUser(null)}
        title={`Remove ${removeUser?.name ?? "member"}?`}
        description="This permanently deletes their account and unlinks their work."
        confirmLabel="Remove"
        destructive
        pending={deleteUser.isPending}
        onConfirm={() =>
          removeUser && deleteUser.mutate({ id: removeUser.id })
        }
      />
      <ConfirmDialog
        open={!!removeRole}
        onOpenChange={(v) => !v && setRemoveRole(null)}
        title={`Delete ${removeRole?.name ?? "role"}?`}
        confirmLabel="Delete"
        destructive
        pending={deleteRole.isPending}
        onConfirm={() =>
          removeRole && deleteRole.mutate({ id: removeRole.id })
        }
      />
    </>
  );
}

function UserDialog({
  state,
  roles,
  onClose,
}: {
  state: { open: boolean; user: UserRow | null };
  roles: RoleRow[];
  onClose: () => void;
}) {
  const editing = state.user;
  const utils = trpc.useUtils();
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(editing?.role.id ?? roles[0]?.id ?? "");
  const [department, setDepartment] = useState(editing?.department ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");

  const onDone = () => {
    utils.user.list.invalidate();
    onClose();
  };
  const create = trpc.user.create.useMutation({
    onSuccess: () => {
      toast.success("Employee created.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.user.update.useMutation({
    onSuccess: () => {
      toast.success("Saved.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (editing) {
      update.mutate({ id: editing.id, name, roleId, department, title });
    } else {
      create.mutate({ name, email, password, roleId, department, title });
    }
  };

  const valid =
    name.trim().length >= 2 &&
    roleId &&
    (editing || (email.includes("@") && password.length >= 6));

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit member" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update role, department and details."
              : "Create a login for a new team member. They sign in with this email and password."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="u-name">Full name</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              disabled={!!editing}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-role">Role</Label>
            <FormSelect
              id="u-role"
              value={roleId}
              onValueChange={setRoleId}
              placeholder="Select role"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
          </div>
        </div>
        {!editing ? (
          <div className="space-y-2">
            <Label htmlFor="u-pw">Temporary password</Label>
            <Input
              id="u-pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="u-dept">Department</Label>
            <Input
              id="u-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-title">Title</Label>
            <Input
              id="u-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || create.isPending || update.isPending}
            onClick={submit}
          >
            {create.isPending || update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const reset = trpc.user.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password reset.");
      setPassword("");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user?.name}. Share it securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rp">New password</Label>
          <Input
            id="rp"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={password.length < 6 || reset.isPending}
            onClick={() => user && reset.mutate({ id: user.id, password })}
          >
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  state,
  onClose,
}: {
  state: { open: boolean; role: RoleRow | null };
  onClose: () => void;
}) {
  const editing = state.role;
  const utils = trpc.useUtils();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [perms, setPerms] = useState<string[]>(
    editing ? parsePermissions(editing.permissions) : [],
  );
  const isAdminRole = editing?.name === "Admin";

  const onDone = () => {
    utils.role.list.invalidate();
    onClose();
  };
  const create = trpc.role.create.useMutation({
    onSuccess: () => {
      toast.success("Role created.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.role.update.useMutation({
    onSuccess: () => {
      toast.success("Role updated.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (p: string) =>
    setPerms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit role" : "New role"}</DialogTitle>
          <DialogDescription>
            {isAdminRole
              ? "The Admin role always has full access."
              : "Choose exactly what this role can do."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="r-name">Name</Label>
          <Input
            id="r-name"
            value={name}
            disabled={!!editing}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-desc">Description</Label>
          <Input
            id="r-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Permissions</Label>
          <div className="space-y-2 rounded-lg border border-border p-3">
            {ALL_PERMISSIONS.map((p) => (
              <label
                key={p}
                className="flex items-center gap-2.5 text-sm"
              >
                <Checkbox
                  checked={isAdminRole || perms.includes(p)}
                  disabled={isAdminRole}
                  onCheckedChange={() => toggle(p)}
                />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              name.trim().length < 2 || create.isPending || update.isPending
            }
            onClick={() =>
              editing
                ? update.mutate({
                    id: editing.id,
                    description,
                    permissions: perms,
                  })
                : create.mutate({ name, description, permissions: perms })
            }
          >
            {create.isPending || update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {editing ? "Save" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
