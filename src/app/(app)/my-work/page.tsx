import type { Metadata } from "next";
import { MyWorkView } from "@/components/tasks/my-work-view";

export const metadata: Metadata = { title: "My Work" };

export default function MyWorkPage() {
  return <MyWorkView />;
}
