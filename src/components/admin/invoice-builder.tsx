"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Layers, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { FormSelect } from "@/components/app/form-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { computeTotals, formatINR, PAYMENT_TERMS, TAX_TYPES } from "@/lib/finance";
import { istDateString } from "@/lib/time";

type Item = { description: string; hsnSac: string; qty: string; rate: string };

const emptyItem = (): Item => ({ description: "", hsnSac: "", qty: "1", rate: "0" });

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoiceBuilder() {
  const router = useRouter();
  const clients = trpc.clients.list.useQuery();
  const services = trpc.service.active.useQuery();

  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [saveClient, setSaveClient] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(istDateString());
  const [dueDate, setDueDate] = useState(addDays(istDateString(), 30));
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [poNumber, setPoNumber] = useState("");

  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [taxType, setTaxType] = useState("igst");
  const [taxRate, setTaxRate] = useState("18");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");

  const totals = useMemo(
    () =>
      computeTotals(
        items.map((i) => ({ qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })),
        taxType,
        Number(taxRate) || 0,
        Number(discount) || 0,
      ),
    [items, taxType, taxRate, discount],
  );

  const selectClient = (id: string) => {
    setClientId(id);
    if (!id) {
      setName("");
      setEmail("");
      setPhone("");
      setGstin("");
      setAddress("");
      return;
    }
    const c = clients.data?.find((x) => x.id === id);
    if (c) {
      setName(c.companyName);
      setEmail(c.email ?? "");
      setPhone(c.phone ?? "");
      setGstin("");
      setAddress("");
    }
  };

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const onTerms = (v: string) => {
    setPaymentTerms(v);
    const days = PAYMENT_TERMS.find((t) => t.value === v)?.days ?? 30;
    setDueDate(addDays(invoiceDate, days));
  };

  const create = trpc.invoice.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created.");
      router.push("/admin/invoices");
    },
    onError: (e) => toast.error(e.message),
  });

  const valid =
    name.trim().length > 0 &&
    items.some((i) => i.description.trim().length > 0 && Number(i.rate) >= 0);

  const submit = () =>
    create.mutate({
      clientId: clientId || undefined,
      billTo: { name, email, phone, gstin, address },
      saveClient: !clientId && saveClient,
      invoiceDate,
      dueDate: dueDate || undefined,
      paymentTerms,
      poNumber,
      taxType: taxType as "igst" | "cgst_sgst" | "none",
      taxRate: Number(taxRate) || 0,
      discount: Number(discount) || 0,
      notes,
      items: items
        .filter((i) => i.description.trim().length > 0)
        .map((i) => ({
          description: i.description,
          hsnSac: i.hsnSac || undefined,
          qty: Number(i.qty) || 0,
          rate: Number(i.rate) || 0,
        })),
    });

  const clientOptions = [
    { value: "", label: "+ Enter new client" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.companyName })),
  ];

  return (
    <>
      <PageHeader eyebrow="Billing" title="New invoice" />

      <div className="space-y-6">
        {/* Bill to */}
        <Card className="gap-4">
          <div className="px-5">
            <h2 className="font-heading text-sm font-semibold">Bill to</h2>
          </div>
          <div className="space-y-4 px-5">
            <div className="space-y-2">
              <Label>Client</Label>
              <div className="w-56">
                <FormSelect value={clientId} onValueChange={selectClient} options={clientOptions} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="b-name">Name</Label>
                <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-email">Email</Label>
                <Input id="b-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-phone">Phone</Label>
                <Input id="b-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-gstin">
                  GSTIN <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="b-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-addr">Address</Label>
              <Textarea id="b-addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>
            {!clientId ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveClient} onCheckedChange={(v) => setSaveClient(Boolean(v))} />
                Save this client for next time
              </label>
            ) : null}
          </div>
        </Card>

        {/* Details */}
        <Card className="gap-4">
          <div className="px-5">
            <h2 className="font-heading text-sm font-semibold">Details</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="d-date">Invoice date</Label>
              <Input
                id="d-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  const days = PAYMENT_TERMS.find((t) => t.value === paymentTerms)?.days ?? 30;
                  setDueDate(addDays(e.target.value, days));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-due">Due date</Label>
              <Input id="d-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment terms</Label>
              <div className="w-40">
                <FormSelect
                  value={paymentTerms}
                  onValueChange={onTerms}
                  options={PAYMENT_TERMS.map((t) => ({ value: t.value, label: t.label }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-po">
                PO number <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input id="d-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Line items */}
        <Card className="gap-4">
          <div className="flex items-center justify-between px-5">
            <h2 className="font-heading text-sm font-semibold">Line items</h2>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Layers className="size-4" />
                Suggest from services
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(services.data ?? []).length === 0 ? (
                  <DropdownMenuItem disabled>No services yet</DropdownMenuItem>
                ) : (
                  services.data?.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      onClick={() =>
                        setItems((cur) => [
                          ...cur.filter((i) => i.description.trim() || i.rate !== "0"),
                          {
                            description: s.name,
                            hsnSac: s.hsnSac ?? "",
                            qty: "1",
                            rate: String(s.basePrice),
                          },
                        ])
                      }
                    >
                      {s.name} — {formatINR(s.basePrice)}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="px-5">
            <div className="hidden grid-cols-[1fr_140px_80px_120px_100px_40px] gap-2 pb-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Description</span>
              <span>HSN/SAC</span>
              <span>Qty</span>
              <span>Rate</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <div className="space-y-2">
              {items.map((it, i) => {
                const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                return (
                  <div
                    key={i}
                    className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_140px_80px_120px_100px_40px]"
                  >
                    <Input
                      className="col-span-2 sm:col-span-1"
                      placeholder="Item"
                      value={it.description}
                      onChange={(e) => setItem(i, { description: e.target.value })}
                    />
                    <Input
                      placeholder="HSN/SAC"
                      value={it.hsnSac}
                      onChange={(e) => setItem(i, { hsnSac: e.target.value })}
                    />
                    <Input
                      type="number"
                      value={it.qty}
                      onChange={(e) => setItem(i, { qty: e.target.value })}
                    />
                    <Input
                      type="number"
                      value={it.rate}
                      onChange={(e) => setItem(i, { rate: e.target.value })}
                    />
                    <span className="text-right text-sm font-medium tabular-nums">
                      {formatINR(amount)}
                    </span>
                    <button
                      onClick={() => setItems((cur) => cur.filter((_, idx) => idx !== i))}
                      disabled={items.length === 1}
                      className="justify-self-end rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setItems((c) => [...c, emptyItem()])}>
              <Plus className="size-4" />
              Add item
            </Button>
          </div>
        </Card>

        {/* Tax & totals */}
        <Card className="gap-4">
          <div className="px-5">
            <h2 className="font-heading text-sm font-semibold">Tax &amp; totals</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 px-5 lg:grid-cols-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Tax type</Label>
                <FormSelect
                  value={taxType}
                  onValueChange={setTaxType}
                  options={TAX_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Rate (%)</Label>
                <FormSelect
                  value={taxRate}
                  onValueChange={setTaxRate}
                  options={["0", "5", "12", "18", "28"].map((r) => ({ value: r, label: `${r}%` }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-disc">Discount (₹)</Label>
                <Input id="t-disc" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg border border-border p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
              </div>
              {Number(discount) > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="tabular-nums">- {formatINR(Number(discount))}</span>
                </div>
              ) : null}
              {taxType !== "none" ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"} @ {taxRate}%
                  </span>
                  <span className="tabular-nums">{formatINR(totals.taxAmount)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(totals.total)}</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Totals are recalculated on the server when you save.
              </p>
            </div>
          </div>
          <div className="space-y-2 px-5">
            <Label htmlFor="t-notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/invoices")}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create invoice
          </Button>
        </div>
      </div>
    </>
  );
}
