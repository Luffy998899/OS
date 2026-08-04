// The two rooms that go up first alongside Dev City.
//
// Video Bay — someone is always at the timeline. The editor NPC is seated at
// the monitor and animating, because a room with a frozen mannequin in it reads
// worse than an empty one.
//
// Managing Heads — where leave, sign-offs and queries get decided. One counter,
// one queue, chairs for the people waiting.

import { B } from "../blocks";
import type { Cell } from "../build-ops";
import { box, Plot, type District, type DistrictPlan } from "./kit";

const GROUND = 1;

const VIDEO_W = 19;
const VIDEO_D = 15;
const VIDEO_H = 7;

export const VIDEO_BAY: District = {
  key: "video-bay",
  label: "Video Bay",
  blurb: "The edit suite, with an editor already at the timeline.",
  size: { w: VIDEO_W, h: VIDEO_H, d: VIDEO_D },
  build(origin: Cell): DistrictPlan {
    const p = new Plot(origin, { w: VIDEO_W, h: VIDEO_H, d: VIDEO_D });
    const shell = box(0, GROUND, 0, VIDEO_W - 1, GROUND + 4, VIDEO_D - 1);

    p.fill(box(0, 0, 0, VIDEO_W - 1, 0, VIDEO_D - 1), "solid", B.concrete);
    p.fill(shell, "floor", B.carpet_gray);
    p.fill(shell, "walls", B.drywall);
    p.fill(shell, "ceiling", B.ceiling);

    // Acoustic treatment: this is a room you listen in.
    for (let x = 2; x < VIDEO_W - 2; x += 3) {
      p.set(x, GROUND + 2, 0, B.felt_orange);
      p.set(x, GROUND + 3, 0, B.felt_teal);
      p.set(x, GROUND + 2, VIDEO_D - 1, B.felt_teal);
    }
    p.set(4, GROUND + 4, 5, B.ceiling_light);
    p.set(10, GROUND + 4, 5, B.ceiling_light);
    p.set(4, GROUND + 4, 10, B.ceiling_light);
    p.set(10, GROUND + 4, 10, B.ceiling_light);

    // Doorway, south side.
    p.fill(box(8, GROUND + 1, VIDEO_D - 1, 10, GROUND + 2, VIDEO_D - 1), "solid", 0);

    // --- the edit desk: a run of three, two monitors and a tower
    const dz = 3;
    for (let x = 5; x <= 8; x++) p.set(x, GROUND + 1, dz, B.desk);
    p.set(6, GROUND + 2, dz, B.monitor);
    p.set(7, GROUND + 2, dz, B.monitor);
    p.set(8, GROUND + 2, dz, B.cpu);
    p.set(5, GROUND + 2, dz, B.coffee);
    p.set(6, GROUND + 1, dz + 1, B.chair);

    // The editor. Seated, facing the monitors — yaw 0 looks north (-z).
    p.npc({
      key: "video-editor",
      name: "Ishan",
      role: "Video Editor",
      kind: "staff",
      x: 6.5,
      y: GROUND + 1,
      z: dz + 1.5,
      yaw: 0,
      seated: true,
      hue: 210,
    });

    // --- the shoot corner
    p.set(VIDEO_W - 4, GROUND + 1, 3, B.tripod);
    p.set(VIDEO_W - 4, GROUND + 2, 3, B.camera);
    p.set(VIDEO_W - 3, GROUND + 1, 5, B.softbox);
    p.set(VIDEO_W - 5, GROUND + 1, 5, B.clapboard);
    p.set(VIDEO_W - 2, GROUND + 1, 8, B.pot);
    p.set(VIDEO_W - 2, GROUND + 2, 8, B.plant_fern);

    // The wall display is the terminal: render queue, timers, what is cutting now.
    p.set(3, GROUND + 2, 0, B.tv);
    p.poi({
      x: 3,
      y: GROUND + 2,
      z: 0,
      label: "Edit bay terminal",
      sublabel: "Render queue, timers and what's cutting now.",
      panel: "video",
    });

    // The bell schedule, so the day's blocks are readable in the room too.
    p.set(VIDEO_W - 2, GROUND + 2, 0, B.clock);
    p.poi({
      x: VIDEO_W - 2,
      y: GROUND + 2,
      z: 0,
      label: "Bell schedule",
      sublabel: "Today's blocks. T opens it anywhere.",
      panel: "timetable",
    });

    p.region({
      key: "video-bay",
      label: "Video Bay",
      min: { x: 0, y: 0, z: 0 },
      max: { x: VIDEO_W, y: VIDEO_H, z: VIDEO_D },
    });
    p.sign({ text: "VIDEO BAY", x: 9, y: GROUND + 3, z: VIDEO_D - 1, face: "n", size: 0.9 });

    return p.plan();
  },
};

const HEADS_W = 17;
const HEADS_D = 15;
const HEADS_H = 7;

export const MANAGING_HEADS: District = {
  key: "managing-heads",
  label: "Managing Heads",
  blurb: "Leave, sign-offs and queries — the counter where they get decided.",
  size: { w: HEADS_W, h: HEADS_H, d: HEADS_D },
  build(origin: Cell): DistrictPlan {
    const p = new Plot(origin, { w: HEADS_W, h: HEADS_H, d: HEADS_D });
    const shell = box(0, GROUND, 0, HEADS_W - 1, GROUND + 4, HEADS_D - 1);

    p.fill(box(0, 0, 0, HEADS_W - 1, 0, HEADS_D - 1), "solid", B.concrete);
    p.fill(shell, "floor", B.carpet_red);
    p.fill(shell, "walls", B.drywall_warm);
    p.fill(shell, "ceiling", B.ceiling);
    p.windows(shell, GROUND + 2, B.glass_frosted, 3);
    p.set(4, GROUND + 4, 5, B.ceiling_light);
    p.set(12, GROUND + 4, 5, B.ceiling_light);
    p.set(8, GROUND + 4, 10, B.ceiling_light);

    // Doorway, south.
    p.fill(box(7, GROUND + 1, HEADS_D - 1, 9, GROUND + 2, HEADS_D - 1), "solid", 0);

    // --- the counter, running across the room
    for (let x = 3; x <= HEADS_W - 4; x++) p.set(x, GROUND + 1, 4, B.desk_dark);
    p.set(4, GROUND + 2, 4, B.papers);
    p.set(6, GROUND + 2, 4, B.monitor);
    p.set(HEADS_W - 5, GROUND + 2, 4, B.phone);
    p.set(5, GROUND + 1, 3, B.chair);
    p.set(HEADS_W - 6, GROUND + 1, 3, B.chair);

    p.poi({
      x: 6,
      y: GROUND + 2,
      z: 4,
      label: "Approvals counter",
      sublabel: "Leave, sign-offs and queries.",
      panel: "approvals",
    });

    // Waiting side: a bench, a plant, something to read.
    for (let x = 4; x <= 7; x++) p.set(x, GROUND + 1, HEADS_D - 4, B.sofa);
    p.set(3, GROUND + 1, HEADS_D - 4, B.pot_white);
    p.set(3, GROUND + 2, HEADS_D - 4, B.plant_tall);
    p.set(HEADS_W - 4, GROUND + 1, HEADS_D - 4, B.cooler);
    p.set(9, GROUND + 2, HEADS_D - 1, B.corkboard);

    // The board behind the counter carries the room's own open work.
    p.set(10, GROUND + 2, 0, B.whiteboard);
    p.poi({
      x: 10,
      y: GROUND + 2,
      z: 0,
      label: "Task wall",
      sublabel: "Your missions and the squad's work.",
      panel: "tasks",
    });

    p.region({
      key: "managing-heads",
      label: "Managing Heads",
      min: { x: 0, y: 0, z: 0 },
      max: { x: HEADS_W, y: HEADS_H, z: HEADS_D },
    });
    p.sign({
      text: "MANAGING HEADS",
      x: 8,
      y: GROUND + 3,
      z: HEADS_D - 1,
      face: "n",
      size: 0.8,
    });

    return p.plan();
  },
};
