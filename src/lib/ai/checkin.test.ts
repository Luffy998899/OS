import { describe, it, expect } from "vitest";
import {
  MAX_QUESTIONS,
  REPORT_READY,
  SCRIPTED_QUESTIONS,
  answeredCount,
  askedCount,
  fallbackReport,
  isComplete,
  nextScriptedQuestion,
  openingQuestion,
  parseReport,
  transcriptText,
  type CheckinContext,
  type Turn,
} from "./checkin";

const CTX: CheckinContext = {
  userName: "Riya",
  tasksToday: ["Zen Salon reel", "Client CRM bugfix"],
};

/** Build a transcript of n completed question/answer pairs. */
const convo = (answers: string[]): Turn[] => {
  const out: Turn[] = [];
  answers.forEach((a, i) => {
    out.push({ role: "assistant", content: SCRIPTED_QUESTIONS[i] ?? "And then?" });
    out.push({ role: "user", content: a });
  });
  return out;
};

describe("check-in interview", () => {
  it("opens with the first scripted question", () => {
    expect(openingQuestion()).toBe(SCRIPTED_QUESTIONS[0]);
  });

  it("counts what has been asked and answered", () => {
    const h = convo(["shipped the reel", "no blockers"]);
    expect(askedCount(h)).toBe(2);
    expect(answeredCount(h)).toBe(2);
    // A pending question that hasn't been answered yet.
    h.push({ role: "assistant", content: "anything else?" });
    expect(askedCount(h)).toBe(3);
    expect(answeredCount(h)).toBe(2);
  });

  it("walks the script in order and stops when exhausted", () => {
    let h: Turn[] = [];
    for (let i = 0; i < SCRIPTED_QUESTIONS.length; i++) {
      expect(nextScriptedQuestion(h)).toBe(SCRIPTED_QUESTIONS[i]);
      h = [...h, { role: "assistant", content: SCRIPTED_QUESTIONS[i] }, { role: "user", content: "ok" }];
    }
    expect(nextScriptedQuestion(h)).toBeNull();
  });

  it("ignores blank answers when counting progress", () => {
    const h: Turn[] = [
      { role: "assistant", content: "q" },
      { role: "user", content: "   " },
    ];
    expect(answeredCount(h)).toBe(0);
    expect(isComplete(h)).toBe(false);
  });

  it("completes when the model signals it is ready", () => {
    const h = convo(["did stuff"]);
    expect(isComplete(h)).toBe(false);
    h.push({ role: "assistant", content: REPORT_READY });
    expect(isComplete(h)).toBe(true);
  });

  it("completes once the full script has been answered", () => {
    const h = convo(SCRIPTED_QUESTIONS.map(() => "yes"));
    expect(isComplete(h)).toBe(true);
    expect(answeredCount(h)).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("parses a clean JSON report", () => {
    const r = parseReport(
      '{"summary":"Shipped the reel.","blockers":"waiting on assets","tomorrow":"edit v2","mood":"good"}',
    );
    expect(r).toEqual({
      summary: "Shipped the reel.",
      blockers: "waiting on assets",
      tomorrow: "edit v2",
      mood: "good",
    });
  });

  it("parses a report wrapped in fences or prose", () => {
    const r = parseReport('Here you go:\n```json\n{"summary":"Did the thing","mood":"ok"}\n```');
    expect(r?.summary).toBe("Did the thing");
    expect(r?.blockers).toBeNull();
    expect(r?.mood).toBe("ok");
  });

  it("rejects unusable model output", () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport("no json here")).toBeNull();
    expect(parseReport('{"summary":"  "}')).toBeNull();
    expect(parseReport("{broken")).toBeNull();
  });

  it("defaults an unknown mood to ok", () => {
    expect(parseReport('{"summary":"x","mood":"ecstatic"}')?.mood).toBe("ok");
  });

  it("builds a usable report with no model at all", () => {
    const h = convo([
      "Cut the Zen Salon reel and fixed two CRM bugs",
      "Waiting on brand assets from the client",
      "Need Meera to approve the thumbnail",
      "Start the launch script",
      "Honestly it was a bit too much today",
    ]);
    const r = fallbackReport(h, CTX);
    expect(r.summary).toContain("Riya");
    expect(r.summary).toContain("Zen Salon reel");
    expect(r.summary).toContain("Need Meera to approve");
    expect(r.blockers).toBe("Waiting on brand assets from the client");
    expect(r.tomorrow).toBe("Start the launch script");
    expect(r.mood).toBe("strained");
  });

  it("treats a negative answer as no blocker and reads a light load", () => {
    const r = fallbackReport(
      convo(["shipped two edits", "nope", "no", "more edits", "felt manageable"]),
      CTX,
    );
    expect(r.blockers).toBeNull();
    expect(r.mood).toBe("good");
    expect(r.summary).not.toContain("Needs:");
  });

  it("still reports when the person barely says anything", () => {
    const r = fallbackReport([], CTX);
    expect(r.summary).toContain("without listing specific work");
    expect(r.blockers).toBeNull();
    expect(r.mood).toBe("ok");
  });

  it("renders a readable transcript", () => {
    const t = transcriptText(convo(["shipped it"]));
    expect(t).toContain("Check-in:");
    expect(t).toContain("Me: shipped it");
  });
});
