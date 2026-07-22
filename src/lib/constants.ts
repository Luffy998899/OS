export const VERTICALS = [
  { value: "website-dev", label: "Website dev" },
  { value: "digital-marketing", label: "Digital marketing" },
  { value: "roadmap", label: "Roadmap & team" },
  { value: "client-outreach", label: "Client outreach" },
  { value: "billing", label: "Billing & data" },
] as const;

export const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "In review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
] as const;

export const ACTIVE_STATUSES = ["todo", "in_progress", "review", "blocked"];

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const ROOMS = [
  { key: "developer", label: "Developer Room" },
  { key: "creative", label: "Creative Room" },
  { key: "video-editing", label: "Video Editing Room" },
  { key: "managing-heads", label: "Managing Heads Room" },
  { key: "common-board", label: "Common Board Room" },
  { key: "client", label: "Client Room" },
  { key: "creativity", label: "Creativity Room" },
] as const;

export type Vertical = (typeof VERTICALS)[number]["value"];
export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];
export type Priority = (typeof PRIORITIES)[number]["value"];
