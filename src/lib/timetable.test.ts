import { describe, it, expect } from "vitest";
import {
  generateDayPlan,
  rankTasks,
  currentSlot,
  nextSlot,
  needsRelogin,
  minToLabel,
  slotRangeLabel,
  type PlanTask,
} from "./timetable";

const TASKS: PlanTask[] = [
  { id: "a", title: "Reels batch", clientId: "c1", clientName: "Acme", priority: "medium" },
  { id: "b", title: "Hotfix header", clientId: "c2", clientName: "Zen Salon", priority: "urgent" },
  { id: "c", title: "Newsletter", clientId: null, clientName: null, priority: "low" },
];

describe("generateDayPlan", () => {
  const plan = generateDayPlan(TASKS);

  it("covers the school day contiguously with no gaps", () => {
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].startMin).toBe(plan[i - 1].endMin);
    }
    expect(plan[0].startMin).toBe(600); // 10am
    expect(plan[plan.length - 1].endMin).toBe(1140); // 7pm
  });

  it("always schedules lunch, journaling and posting confirmation", () => {
    const kinds = plan.map((s) => s.kind);
    expect(kinds).toContain("lunch");
    expect(kinds).toContain("journal");
    expect(kinds).toContain("posting");
  });

  it("puts the most urgent client into the first client block", () => {
    const work = plan.find((s) => s.kind === "work");
    expect(work?.label).toContain("Zen Salon");
    expect(work?.clientId).toBe("c2");
  });

  it("runs developers on a project basis instead", () => {
    const dev = generateDayPlan(TASKS, { developer: true });
    expect(dev.filter((s) => s.kind === "work").length).toBeGreaterThanOrEqual(2);
    expect(dev.find((s) => s.kind === "lunch")).toBeTruthy();
    for (let i = 1; i < dev.length; i++) expect(dev[i].startMin).toBe(dev[i - 1].endMin);
  });

  it("still produces a full day with no tasks at all", () => {
    const empty = generateDayPlan([]);
    expect(empty.length).toBeGreaterThan(4);
    expect(empty.every((s) => s.label.length > 0)).toBe(true);
  });
});

describe("rankTasks", () => {
  it("orders urgency first, deadline second", () => {
    const soon = new Date(Date.now() + 3600_000);
    const later = new Date(Date.now() + 72 * 3600_000);
    const ranked = rankTasks([
      { id: "1", title: "x", priority: "medium", dueAt: later },
      { id: "2", title: "y", priority: "medium", dueAt: soon },
      { id: "3", title: "z", priority: "urgent" },
    ]);
    expect(ranked.map((t) => t.id)).toEqual(["3", "2", "1"]);
  });
});

describe("slot clock", () => {
  const plan = generateDayPlan(TASKS);

  it("finds the running and upcoming block", () => {
    expect(currentSlot(plan, 610)?.kind).toBe("planning");
    expect(nextSlot(plan, 610)?.startMin).toBe(720);
    expect(currentSlot(plan, 599)).toBeNull();
    expect(nextSlot(plan, 1200)).toBeNull();
  });

  it("gates the afternoon on the post-lunch re-login", () => {
    const lunchEnd = plan.find((s) => s.kind === "lunch")!.endMin;
    expect(needsRelogin(plan, lunchEnd - 10, false)).toBe(false); // still eating
    expect(needsRelogin(plan, lunchEnd + 5, false)).toBe(true); // lunch over, not back
    expect(needsRelogin(plan, lunchEnd + 5, true)).toBe(false); // logged back in
  });

  it("prints human clock labels", () => {
    expect(minToLabel(600)).toBe("10am");
    expect(minToLabel(870)).toBe("2:30pm");
    expect(slotRangeLabel({ startMin: 600, endMin: 720 })).toBe("10am – 12pm");
  });
});
