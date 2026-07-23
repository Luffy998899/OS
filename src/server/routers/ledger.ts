import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { round2 } from "@/lib/finance";

export const ledgerRouter = router({
  data: permissionProcedure(PERMISSIONS.BILLING_MANAGE).query(async ({ ctx }) => {
    const [invoices, expenses] = await Promise.all([
      ctx.db.invoice.findMany({
        where: { status: { not: "cancelled" } },
        orderBy: { invoiceDate: "asc" },
        select: {
          id: true,
          number: true,
          billToName: true,
          invoiceDate: true,
          total: true,
          status: true,
        },
      }),
      ctx.db.expense.findMany({
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true, amount: true },
      }),
    ]);

    type Entry = {
      id: string;
      date: string;
      description: string;
      type: "invoice" | "expense";
      status: string | null;
      amount: number; // positive = money in, negative = money out
    };

    const entries: Entry[] = [
      ...invoices.map((i) => ({
        id: i.id,
        date: i.invoiceDate,
        description: `Invoice ${i.number} — ${i.billToName}`,
        type: "invoice" as const,
        status: i.status,
        amount: i.total,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        date: e.date,
        description: e.title,
        type: "expense" as const,
        status: null,
        amount: -e.amount,
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Running balance (chronological), then present newest-first.
    let balance = 0;
    const withBalance = entries.map((e) => {
      balance = round2(balance + e.amount);
      return { ...e, balance };
    });
    withBalance.reverse();

    const collected = round2(
      invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0),
    );
    const expenseTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
    const invoicedTotal = round2(invoices.reduce((s, i) => s + i.total, 0));

    return {
      collected,
      expenses: expenseTotal,
      currentBalance: round2(invoicedTotal - expenseTotal),
      entries: withBalance,
    };
  }),
});
