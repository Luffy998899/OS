import { describe, it, expect } from "vitest";
import {
  detectVertical,
  detectPriority,
  pointsForPriority,
  heuristicPlan,
  type RosterMember,
} from "./heuristics";

const roster: RosterMember[] = [
  { id: "u_dev", name: "Rohan", department: "Engineering", role: "Employee" },
  { id: "u_mkt", name: "Meera", department: "Design & Marketing", role: "Employee" },
  { id: "u_cs", name: "Ananya", department: "Client Success", role: "Employee" },
  { id: "u_ops", name: "Vikram", department: "Operations", role: "Employee" },
  { id: "u_admin", name: "Aarav", department: "Leadership", role: "Admin" },
];

describe("detectVertical", () => {
  it("routes website work", () => {
    expect(detectVertical("Build a landing page for the launch")).toBe(
      "website-dev",
    );
  });
  it("routes marketing work", () => {
    expect(detectVertical("Plan the social media campaign")).toBe(
      "digital-marketing",
    );
  });
  it("routes outreach work", () => {
    expect(detectVertical("Follow up with the hot lead")).toBe(
      "client-outreach",
    );
  });
  it("routes billing work", () => {
    expect(detectVertical("Reconcile the March invoices")).toBe("billing");
  });
  it("defaults to roadmap", () => {
    expect(detectVertical("Think about our long term vision")).toBe("roadmap");
  });
});

describe("detectPriority", () => {
  it("detects urgent", () => {
    expect(detectPriority("We need this ASAP")).toBe("urgent");
  });
  it("detects low", () => {
    expect(detectPriority("nice to have, whenever")).toBe("low");
  });
  it("defaults to medium", () => {
    expect(detectPriority("please build the thing")).toBe("medium");
  });
});

describe("pointsForPriority", () => {
  it("scales with priority", () => {
    expect(pointsForPriority("urgent")).toBeGreaterThan(
      pointsForPriority("low"),
    );
  });
});

describe("heuristicPlan", () => {
  it("routes a dev request to the engineer", () => {
    const draft = heuristicPlan(
      "Urgent: fix the API bug on the website",
      roster,
    );
    expect(draft.vertical).toBe("website-dev");
    expect(draft.priority).toBe("urgent");
    expect(draft.assigneeId).toBe("u_dev");
    expect(draft.points).toBe(40);
    expect(draft.title.length).toBeGreaterThan(0);
  });
  it("routes marketing to the marketer", () => {
    const draft = heuristicPlan("Draft blog content and SEO copy", roster);
    expect(draft.vertical).toBe("digital-marketing");
    expect(draft.assigneeId).toBe("u_mkt");
  });
});
