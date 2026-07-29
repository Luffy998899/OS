import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createPlayerRig, type PlayerRig } from "./player-model";

// The node test environment has no canvas backend, so stub just enough of the
// 2d context for the painters; the rig logic under test never reads pixels.
function stubCanvas(): unknown {
  const noop = () => undefined;
  const ctx = {
    canvas: null as unknown,
    imageSmoothingEnabled: false,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: noop,
    fillText: noop,
    beginPath: noop,
    arc: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    measureText: (text: string) => ({ width: text.length * 15 }),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  ctx.canvas = canvas;
  return canvas;
}

beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => stubCanvas() });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const rigOf = (over?: Partial<{ name: string; hue: number; showName: boolean }>): PlayerRig =>
  createPlayerRig({ name: "Steve", hue: 20, ...over });

const limb = (rig: PlayerRig, name: string): THREE.Object3D => {
  const obj = rig.group.getObjectByName(name);
  if (!obj) throw new Error(`missing part ${name}`);
  return obj;
};

describe("createPlayerRig", () => {
  it("stands 1.8 units tall with feet at the group origin", () => {
    const rig = rigOf();
    const box = new THREE.Box3().setFromObject(rig.group);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1.8, 5);
  });

  it("faces -z at yaw 0 and +x at yaw PI/2", () => {
    const rig = rigOf();
    const facing = () => new THREE.Vector3(0, 0, -1).applyQuaternion(rig.group.quaternion);
    rig.setHeading(0);
    expect(facing().z).toBeCloseTo(-1, 5);
    rig.setHeading(Math.PI / 2);
    expect(facing().x).toBeCloseTo(1, 5);
    expect(facing().z).toBeCloseTo(0, 5);
  });

  it("swings arms and legs in opposite phases while moving", () => {
    const rig = rigOf();
    rig.setPose(Math.PI / 2, true, 1 / 60);
    expect(limb(rig, "armL").rotation.x).toBeCloseTo(0.7, 5);
    expect(limb(rig, "armR").rotation.x).toBeCloseTo(-0.7, 5);
    expect(limb(rig, "legL").rotation.x).toBeCloseTo(-0.7, 5);
    expect(limb(rig, "legR").rotation.x).toBeCloseTo(0.7, 5);
  });

  it("eases limbs back to rest when idle", () => {
    const rig = rigOf();
    rig.setPose(Math.PI / 2, true, 1 / 60);
    rig.setPose(0, false, 0.05);
    const partway = limb(rig, "armL").rotation.x;
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(0.7);
    rig.setPose(0, false, 0.2); // dt past the ease window snaps to rest
    for (const name of ["armL", "armR", "legL", "legR"]) {
      expect(limb(rig, name).rotation.x).toBe(0);
    }
  });

  it("keeps the resting outward arm tilt", () => {
    const rig = rigOf();
    expect(limb(rig, "armL").rotation.z).toBeLessThan(0);
    expect(limb(rig, "armR").rotation.z).toBeGreaterThan(0);
  });

  it("tints the status lamp per status", () => {
    const rig = rigOf();
    const lamp = limb(rig, "lamp") as THREE.Mesh;
    const mat = lamp.material as THREE.MeshLambertMaterial;
    rig.setStatus("busy");
    expect(mat.color.getHex()).toBe(0xe0a13a);
    rig.setStatus("away");
    expect(mat.color.getHex()).toBe(0x8a8f98);
    rig.setStatus("online");
    expect(mat.color.getHex()).toBe(0x4fae5a);
    rig.setStatus("nonsense");
    expect(mat.color.getHex()).toBe(0x4fae5a);
  });

  it("adds a name-tag sprite only when showName is set", () => {
    const named = rigOf({ showName: true });
    const sprite = named.group.children.find((c): c is THREE.Sprite => c instanceof THREE.Sprite);
    expect(sprite).toBeDefined();
    expect(sprite?.position.y).toBeCloseTo(2.15, 5);
    const anon = rigOf();
    expect(anon.group.children.some((c) => c instanceof THREE.Sprite)).toBe(false);
  });

  it("disposes every geometry, material and texture it created", () => {
    const rig = rigOf({ showName: true });
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const texs = new Set<THREE.Texture>();
    rig.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geos.add(obj.geometry as THREE.BufferGeometry);
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of list) {
          mats.add(m as THREE.Material);
          const map = (m as THREE.MeshLambertMaterial).map;
          if (map) texs.add(map);
        }
      } else if (obj instanceof THREE.Sprite) {
        mats.add(obj.material);
        if (obj.material.map) texs.add(obj.material.map);
      }
    });
    // leg/torso/arm/head/lamp geometries (legs and arms share one each).
    expect(geos.size).toBe(5);
    expect(mats.size).toBeGreaterThanOrEqual(9);
    expect(texs.size).toBeGreaterThanOrEqual(8);
    const spies = [...geos, ...mats, ...texs].map((res) => vi.spyOn(res, "dispose"));
    rig.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
    expect(rig.group.children.length).toBe(0);
  });
});
