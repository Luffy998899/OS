"use client";

// The management surfaces Discord puts behind the "+" and the server dropdown:
// create a channel, create a space, and a space's settings (rename, describe,
// edit or delete each channel, delete the space).

import { useEffect, useState } from "react";
import { Hash, Loader2, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { slugifyChannel } from "@/lib/chat";
import { cn } from "@/lib/utils";

type ChannelRow = { id: string; name: string; kind: string; topic: string | null };

export function CreateChannelDialog({
  open,
  onOpenChange,
  serverId,
  serverName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverId: string | null;
  serverName: string;
  onCreated?: (channelId: string) => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [topic, setTopic] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setKind("text");
      setTopic("");
    }
  }, [open]);

  const create = trpc.chat.createChannel.useMutation({
    onSuccess: (res) => {
      utils.chat.list.invalidate();
      onOpenChange(false);
      onCreated?.(res.channelId);
      toast.success("Channel created.");
    },
    onError: (e) => toast.error(e.message),
  });

  const slug = slugifyChannel(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
          <DialogDescription>Adds a channel to {serverName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Channel type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["text", "Text", <Hash key="t" className="size-4" />, "Post messages and files"],
                  ["voice", "Voice", <Volume2 key="v" className="size-4" />, "Talk out loud together"],
                ] as const
              ).map(([value, label, icon, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    kind === value
                      ? "border-foreground bg-muted"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {icon}
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              onKeyDown={(e) => {
                if (e.key === "Enter" && slug && serverId) {
                  create.mutate({ serverId, name, kind, topic: topic || undefined });
                }
              }}
            />
            {slug ? (
              <p className="text-xs text-muted-foreground">
                Will appear as {kind === "voice" ? "🔊" : "#"}
                {slug}
              </p>
            ) : null}
          </div>
          {kind === "text" ? (
            <div className="space-y-1.5">
              <Label htmlFor="channel-topic">Topic (optional)</Label>
              <Input
                id="channel-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this channel for?"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!slug || !serverId || create.isPending}
            onClick={() =>
              serverId && create.mutate({ serverId, name, kind, topic: topic || undefined })
            }
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateServerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (serverId: string) => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const create = trpc.chat.createServer.useMutation({
    onSuccess: (res) => {
      utils.chat.list.invalidate();
      onOpenChange(false);
      onCreated?.(res.serverId);
      toast.success("Space created.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a space</DialogTitle>
          <DialogDescription>
            A space groups channels — one per team, project or client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="server-name">Space name</Label>
            <Input
              id="server-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design Team"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  create.mutate({ name, description: description || undefined });
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="server-desc">Description (optional)</Label>
            <Input
              id="server-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens in here?"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            It opens with a #general channel you can rename later.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate({ name, description: description || undefined })}
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create space
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ServerSettingsDialog({
  open,
  onOpenChange,
  server,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: { id: string; name: string; description: string | null; channels: ChannelRow[] } | null;
  canDelete: boolean;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && server) {
      setName(server.name);
      setDescription(server.description ?? "");
      setEditing(null);
      setConfirmDelete(false);
    }
  }, [open, server]);

  const refresh = () => utils.chat.list.invalidate();
  const updateServer = trpc.chat.updateServer.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Space updated.");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateChannel = trpc.chat.updateChannel.useMutation({
    onSuccess: () => {
      refresh();
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteChannel = trpc.chat.deleteChannel.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Channel deleted.");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteServer = trpc.chat.deleteServer.useMutation({
    onSuccess: () => {
      refresh();
      onOpenChange(false);
      toast.success("Space deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!server) return null;
  const dirty = name.trim() !== server.name || description !== (server.description ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{server.name} settings</DialogTitle>
          <DialogDescription>Rename the space and manage its channels.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Space name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-desc">Description</Label>
            <Input
              id="settings-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens in here?"
            />
          </div>
          <Button
            size="sm"
            disabled={!dirty || !name.trim() || updateServer.isPending}
            onClick={() =>
              updateServer.mutate({ serverId: server.id, name, description })
            }
          >
            {updateServer.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Channels</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {server.channels.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  {c.kind === "voice" ? (
                    <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {editing === c.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editName.trim()) {
                            updateChannel.mutate({ channelId: c.id, name: editName });
                          }
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="h-7 flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={!editName.trim() || updateChannel.isPending}
                        onClick={() => updateChannel.mutate({ channelId: c.id, name: editName })}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <button
                        onClick={() => {
                          setEditing(c.id);
                          setEditName(c.name);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Rename
                      </button>
                      <button
                        aria-label={`Delete ${c.name}`}
                        disabled={server.channels.length <= 1 || deleteChannel.isPending}
                        onClick={() => deleteChannel.mutate({ channelId: c.id })}
                        className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A space always keeps at least one channel.
            </p>
          </div>

          {canDelete ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium text-destructive">Danger zone</p>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteServer.isPending}
                    onClick={() => deleteServer.mutate({ serverId: server.id })}
                  >
                    {deleteServer.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Delete {server.name} permanently
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" />
                  Delete this space
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Deletes every channel and message in it. This cannot be undone.
              </p>
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Built-in spaces can be renamed but not deleted.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
