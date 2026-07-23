// XP / leveling derived from lifetime points. 100 XP per level.
const PER_LEVEL = 100;

export type LevelInfo = {
  level: number;
  into: number; // XP earned within the current level
  span: number; // XP needed to fill a level
  toNext: number; // XP remaining to next level
  progress: number; // 0..1
};

export function levelInfo(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points));
  const level = Math.floor(p / PER_LEVEL) + 1;
  const into = p % PER_LEVEL;
  return {
    level,
    into,
    span: PER_LEVEL,
    toNext: PER_LEVEL - into,
    progress: into / PER_LEVEL,
  };
}

export function levelForPoints(points: number): number {
  return levelInfo(points).level;
}
