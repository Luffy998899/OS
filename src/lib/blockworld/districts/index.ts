// The districts an admin can place.
//
// Each one is authored in code and dropped wherever you want it. Nothing is
// generated behind your back: the world stays whatever people have built, and a
// stamped district is ordinary blocks you can edit, move or delete afterwards.

import { DEV_CITY } from "./dev-city";
import { MANAGING_HEADS, VIDEO_BAY } from "./rooms";
import type { District } from "./kit";

export type { District, DistrictPlan, NpcDraft, PoiDraft } from "./kit";
export { Plot, box } from "./kit";

export const DISTRICTS: District[] = [DEV_CITY, VIDEO_BAY, MANAGING_HEADS];

export function getDistrict(key: string): District | null {
  return DISTRICTS.find((d) => d.key === key) ?? null;
}
