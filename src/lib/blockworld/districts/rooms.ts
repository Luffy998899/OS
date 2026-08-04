// The rooms that go up alongside Dev City.
//
// Video Bay — someone is always at the timeline. The editor NPC is seated at
// the monitor and animating, because a room with a frozen mannequin in it reads
// worse than an empty one.
//
// Managing Heads — where leave, sign-offs and queries get decided. One counter,
// one queue, chairs for the people waiting.
//
// Board Room — the whole team, seated. Urgent meetings, disclosures, incentives
// and the weekly do's & don'ts all come out of one panel, so the room gives it
// two doors: the notice board you read from a seat, and the lectern you speak
// from, which opens the composer directly.
//
// Task Hall — a booth per person, each with their own board, around a squad
// table at the head of the room. The same panel serves both: your wall is your
// own, the squad board is the work you share.

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

const BOARD_W = 23;
const BOARD_D = 17;
const BOARD_H = 8;

export const BOARD_ROOM: District = {
  key: "board-room",
  label: "Board Room",
  blurb: "The conference hall — the whole team, seated, facing one board.",
  size: { w: BOARD_W, h: BOARD_H, d: BOARD_D },
  build(origin: Cell): DistrictPlan {
    const p = new Plot(origin, { w: BOARD_W, h: BOARD_H, d: BOARD_D });
    const ROOF = GROUND + 6; // a hall wants head room a cubicle doesn't
    const shell = box(0, GROUND, 0, BOARD_W - 1, ROOF, BOARD_D - 1);

    p.fill(box(0, 0, 0, BOARD_W - 1, 0, BOARD_D - 1), "solid", B.concrete);
    p.fill(shell, "floor", B.carpet_blue);
    p.fill(shell, "walls", B.drywall);
    p.fill(shell, "ceiling", B.ceiling);

    // The head wall is the one everybody looks at for an hour, so it gets the
    // darker board and the screen; the rest of the room stays light.
    p.fill(box(0, GROUND + 1, 0, BOARD_W - 1, ROOF - 1, 0), "solid", B.drywall_accent);

    // Glazing down the west side, acoustic panels down the east — a room you
    // talk in wants one hard wall and one soft one, not four of either.
    for (let z = 3; z <= BOARD_D - 4; z++) {
      p.set(0, GROUND + 2, z, B.curtain_wall);
      p.set(0, GROUND + 3, z, B.curtain_wall);
      if (z % 2 === 1) {
        p.set(BOARD_W - 1, GROUND + 2, z, B.felt);
        p.set(BOARD_W - 1, GROUND + 3, z, B.felt_teal);
      }
    }

    for (const x of [5, 11, 17]) {
      for (const z of [3, 7, 11, 15]) p.set(x, ROOF, z, B.ceiling_light);
    }
    p.set(2, ROOF, 8, B.vent);
    p.set(BOARD_W - 3, ROOF, 8, B.vent);

    // Doorway, south, with the way out marked beside it.
    p.fill(box(10, GROUND + 1, BOARD_D - 1, 12, GROUND + 2, BOARD_D - 1), "solid", 0);
    p.set(9, GROUND + 2, BOARD_D - 1, B.exit_sign);

    // --- the head of the room: screen, lectern, and the marble it stands on
    p.fill(box(4, GROUND, 1, BOARD_W - 5, GROUND, 2), "solid", B.marble);
    for (let x = 8; x <= 14; x++) {
      p.set(x, GROUND + 2, 0, B.tv);
      p.set(x, GROUND + 3, 0, B.tv);
    }
    p.set(6, GROUND + 3, 0, B.art);
    p.set(BOARD_W - 7, GROUND + 3, 0, B.art);

    p.poi({
      x: 11,
      y: GROUND + 2,
      z: 0,
      label: "Notice board",
      sublabel: "Urgent meetings, disclosures, incentives and the weekly round.",
      panel: "conference",
    });

    p.set(5, GROUND + 1, 2, B.desk_dark);
    p.set(5, GROUND + 2, 2, B.mic);
    p.set(4, GROUND + 1, 2, B.desk_dark);
    p.set(4, GROUND + 2, 2, B.papers);
    p.poi({
      x: 5,
      y: GROUND + 2,
      z: 2,
      // The composer opens with it: whoever walks to the lectern is the one
      // calling the meeting, not reading about it.
      refId: "compose",
      label: "Lectern",
      sublabel: "Call a meeting or post to the whole team.",
      panel: "conference",
    });

    // --- the table, and a chair on each side of every seat of it
    const TZ0 = 4;
    const TZ1 = BOARD_D - 5;
    p.fill(box(10, GROUND + 1, TZ0, 12, GROUND + 1, TZ1), "solid", B.table);
    for (let z = TZ0; z <= TZ1; z++) {
      p.set(9, GROUND + 1, z, B.chair);
      p.set(13, GROUND + 1, z, B.chair);
    }
    p.set(11, GROUND + 1, TZ0 - 1, B.chair);
    p.set(11, GROUND + 1, TZ1 + 1, B.chair);

    p.set(11, GROUND + 2, 8, B.phone);
    p.set(10, GROUND + 2, 5, B.papers);
    p.set(12, GROUND + 2, 6, B.coffee);
    p.set(10, GROUND + 2, 10, B.coffee);
    p.set(12, GROUND + 2, 11, B.book_stack);

    // Everyone who isn't at the table still gets a seat: a run down each wall.
    for (let z = TZ0; z <= TZ1; z++) {
      p.set(1, GROUND + 1, z, B.chair);
      p.set(BOARD_W - 2, GROUND + 1, z, B.chair);
    }

    // --- the back: somewhere to stand about before it starts. The run breaks
    // in the middle because the door is there, and a door that opens onto the
    // back of a sofa is a door nobody can walk through.
    for (let x = 7; x <= 15; x++) {
      if (x < 10 || x > 12) p.set(x, GROUND + 1, BOARD_D - 3, B.sofa);
      p.set(x, GROUND + 1, BOARD_D - 2, B.rug_pattern);
    }
    p.set(1, GROUND + 1, BOARD_D - 3, B.pot_white);
    p.set(1, GROUND + 2, BOARD_D - 3, B.plant_tall);
    p.set(BOARD_W - 2, GROUND + 1, BOARD_D - 3, B.pot);
    p.set(BOARD_W - 2, GROUND + 2, BOARD_D - 3, B.plant_fern);
    p.set(2, GROUND + 1, BOARD_D - 2, B.pantry);
    p.set(3, GROUND + 1, BOARD_D - 2, B.cooler);
    p.set(BOARD_W - 3, GROUND + 2, BOARD_D - 1, B.corkboard);

    p.region({
      key: "board-room",
      label: "Board Room",
      min: { x: 0, y: 0, z: 0 },
      max: { x: BOARD_W, y: BOARD_H, z: BOARD_D },
    });
    p.sign({
      text: "BOARD ROOM",
      x: 11,
      y: GROUND + 3,
      z: BOARD_D - 1,
      face: "n",
      size: 0.85,
    });

    return p.plan();
  },
};

const TASK_W = 17;
const TASK_D = 19;
const TASK_H = 7;
/** Where each booth starts, on both sides of the aisle. Three deep, one seat. */
const BOOTH_Z = [8, 11, 14];

/** One person's station: desk against the wall, a screen, a chair, their board. */
function booth(p: Plot, side: "w" | "e", z0: number): void {
  const dir = side === "w" ? 1 : -1;
  const wall = side === "w" ? 0 : TASK_W - 1;
  const back = wall + dir; // desk against the wall
  const front = wall + dir * 2; // desk on the aisle side
  const seat = wall + dir * 3;

  for (const z of [z0, z0 + 1]) {
    p.set(back, GROUND + 1, z, B.desk);
    p.set(front, GROUND + 1, z, B.desk);
    // Two courses of board, so the prompt sits above the screen rather than
    // behind it — you should be able to read what you are aiming at.
    p.set(wall, GROUND + 2, z, B.whiteboard);
    p.set(wall, GROUND + 3, z, B.whiteboard);
  }
  p.set(back, GROUND + 2, z0, B.monitor);
  p.set(back, GROUND + 2, z0 + 1, B.cpu);
  p.set(front, GROUND + 2, z0 + 1, B.coffee);
  p.set(seat, GROUND + 1, z0, B.chair);

  // A partition, so a booth is a booth and not a stretch of shared desk.
  for (let i = 0; i <= 2; i++) {
    p.set(wall + dir * (i + 1), GROUND + 1, z0 + 2, B.felt);
    p.set(wall + dir * (i + 1), GROUND + 2, z0 + 2, B.felt_orange);
  }

  p.poi({
    x: wall,
    y: GROUND + 3,
    z: z0,
    label: "Your task wall",
    sublabel: "Everything the admin has put your name on.",
    panel: "tasks",
  });
}

export const TASK_HALL: District = {
  key: "task-hall",
  label: "Task Hall",
  blurb: "A booth and a board per person, around the squad table.",
  size: { w: TASK_W, h: TASK_H, d: TASK_D },
  build(origin: Cell): DistrictPlan {
    const p = new Plot(origin, { w: TASK_W, h: TASK_H, d: TASK_D });
    const ROOF = GROUND + 5;
    const shell = box(0, GROUND, 0, TASK_W - 1, ROOF, TASK_D - 1);

    p.fill(box(0, 0, 0, TASK_W - 1, 0, TASK_D - 1), "solid", B.concrete);
    p.fill(shell, "floor", B.carpet_green);
    p.fill(shell, "walls", B.drywall);
    p.fill(shell, "ceiling", B.ceiling);
    p.fill(box(0, GROUND + 1, 0, TASK_W - 1, ROOF - 1, 0), "solid", B.drywall_accent);

    // Clerestory glazing: above the desks, so the booths keep their boards and
    // the room still has daylight in it.
    for (let z = 2; z <= TASK_D - 3; z++) {
      p.set(0, ROOF - 1, z, B.curtain_wall);
      p.set(TASK_W - 1, ROOF - 1, z, B.curtain_wall);
    }

    for (const x of [3, 8, 13]) {
      for (const z of [3, 7, 11, 15]) p.set(x, ROOF, z, B.ceiling_light);
    }

    // Doorway, south.
    p.fill(box(7, GROUND + 1, TASK_D - 1, 9, GROUND + 2, TASK_D - 1), "solid", 0);
    p.set(6, GROUND + 2, TASK_D - 1, B.exit_sign);

    // --- the squad end: one big board, one table, everyone facing it
    for (let x = 6; x <= 10; x++) {
      p.set(x, GROUND + 2, 0, B.whiteboard);
      p.set(x, GROUND + 3, 0, B.whiteboard);
    }
    p.set(4, GROUND + 2, 0, B.corkboard);
    p.set(12, GROUND + 2, 0, B.corkboard);
    p.poi({
      x: 8,
      y: GROUND + 3,
      z: 0,
      label: "Squad board",
      sublabel: "Co-assigned missions, with everyone who's on them.",
      panel: "tasks",
    });

    p.fill(box(6, GROUND + 1, 3, 10, GROUND + 1, 4), "solid", B.table);
    for (let x = 6; x <= 10; x++) {
      p.set(x, GROUND + 1, 2, B.chair);
      p.set(x, GROUND + 1, 5, B.chair);
    }
    p.set(7, GROUND + 2, 3, B.papers);
    p.set(8, GROUND + 2, 3, B.phone);
    p.set(9, GROUND + 2, 4, B.coffee);

    // --- the booths
    for (const z0 of BOOTH_Z) {
      booth(p, "w", z0);
      booth(p, "e", z0);
    }

    // --- the aisle, kept walkable but not empty
    p.set(5, GROUND + 1, 8, B.printer);
    p.set(11, GROUND + 1, 9, B.pot_white);
    p.set(11, GROUND + 2, 9, B.plant_tall);
    p.set(5, GROUND + 1, 15, B.cooler);
    p.set(11, GROUND + 1, 15, B.books);
    p.set(11, GROUND + 2, 15, B.books);
    p.set(8, GROUND + 1, TASK_D - 3, B.rug_pattern);

    p.region({
      key: "task-hall",
      label: "Task Hall",
      min: { x: 0, y: 0, z: 0 },
      max: { x: TASK_W, y: TASK_H, z: TASK_D },
    });
    p.sign({
      text: "TASK HALL",
      x: 8,
      y: GROUND + 3,
      z: TASK_D - 1,
      face: "n",
      size: 0.85,
    });

    return p.plan();
  },
};
