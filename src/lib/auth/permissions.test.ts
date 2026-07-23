import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_DEFAULTS,
  parsePermissions,
  hasPermission,
} from "./permissions";

describe("parsePermissions", () => {
  it("parses a JSON array", () => {
    expect(parsePermissions('["a","b"]')).toEqual(["a", "b"]);
  });
  it("returns [] for null/invalid", () => {
    expect(parsePermissions(null)).toEqual([]);
    expect(parsePermissions("not json")).toEqual([]);
    expect(parsePermissions('{"a":1}')).toEqual([]);
  });
});

describe("hasPermission", () => {
  it("wildcard grants everything (admin)", () => {
    expect(hasPermission(["*"], PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
    expect(hasPermission(ROLE_DEFAULTS.Admin, PERMISSIONS.PEOPLE_MANAGE)).toBe(
      true,
    );
  });
  it("grants a specific permission", () => {
    expect(
      hasPermission([PERMISSIONS.TASKS_ASSIGN], PERMISSIONS.TASKS_ASSIGN),
    ).toBe(true);
  });
  it("denies missing permissions", () => {
    expect(
      hasPermission([PERMISSIONS.TASKS_ASSIGN], PERMISSIONS.SETTINGS_MANAGE),
    ).toBe(false);
    expect(hasPermission([], PERMISSIONS.ADMIN)).toBe(false);
  });
  it("accepts a JSON string of permissions", () => {
    expect(hasPermission('["*"]', PERMISSIONS.REPORTS_VIEW)).toBe(true);
  });
});

describe("ROLE_DEFAULTS", () => {
  it("manager can assign & review but not manage people or settings", () => {
    const m = ROLE_DEFAULTS.Manager;
    expect(hasPermission(m, PERMISSIONS.TASKS_ASSIGN)).toBe(true);
    expect(hasPermission(m, PERMISSIONS.REPORTS_VIEW)).toBe(true);
    expect(hasPermission(m, PERMISSIONS.PEOPLE_MANAGE)).toBe(false);
    expect(hasPermission(m, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });
  it("employee has no elevated permissions", () => {
    expect(ROLE_DEFAULTS.Employee).toEqual([]);
  });
});
