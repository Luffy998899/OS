/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SaveVars = { id: string; content: string };
type SaveCtx = { seq: number };
type SaveOpts = {
  onMutate: (vars: SaveVars) => SaveCtx;
  onSuccess: (
    data: { ok: boolean; updatedAt: number },
    vars: SaveVars,
    ctx: SaveCtx,
  ) => void;
  onError: (e: Error, vars: SaveVars, ctx: SaveCtx | undefined) => void;
};

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  setData: vi.fn(),
  invalidateList: vi.fn(),
  saveCalls: [] as { vars: { id: string; content: string }; ctx: { seq: number } }[],
  opts: { current: null as SaveOpts | null },
  byIdData: { current: {} as Record<string, unknown> },
}));

vi.mock("sonner", () => ({
  toast: { error: h.toastError, success: vi.fn() },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      document: {
        byId: { setData: h.setData },
        list: { invalidate: h.invalidateList },
      },
    }),
    document: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: "d1",
              title: "Script one",
              type: "doc",
              visibility: "team",
              updatedAt: new Date(),
              owner: { id: "u1", name: "Max", avatarUrl: null },
              isOwner: true,
            },
          ],
          isLoading: false,
        }),
      },
      byId: {
        useQuery: () => ({ data: h.byIdData.current, isLoading: false }),
      },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateContent: {
        useMutation: (opts: SaveOpts) => {
          h.opts.current = opts;
          return {
            mutate: (vars: SaveVars) => {
              h.saveCalls.push({ vars, ctx: opts.onMutate(vars) });
            },
            isPending: false,
          };
        },
      },
    },
  },
}));

import { DocsPanel } from "@/components/workspace/rooms/docs-panel";

function openEditor() {
  const view = render(<DocsPanel />);
  fireEvent.click(screen.getByText("Script one"));
  const textarea = screen.getByPlaceholderText(/INT\. STUDIO/) as HTMLTextAreaElement;
  return { ...view, textarea };
}

describe("ScriptEditor save-loss paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.toastError.mockClear();
    h.setData.mockClear();
    h.invalidateList.mockClear();
    h.saveCalls.length = 0;
    h.opts.current = null;
    h.byIdData.current = {
      id: "d1",
      title: "Script one",
      type: "doc",
      visibility: "team",
      content: "hello",
      owner: { id: "u1", name: "Max", avatarUrl: null },
      updatedAt: new Date(),
      isOwner: true,
      canEdit: true,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves 800ms after typing and only the latest ack marks saved", () => {
    const { textarea } = openEditor();
    fireEvent.change(textarea, { target: { value: "draft one" } });
    expect(screen.getByText("saving…")).toBeTruthy();
    expect(h.saveCalls).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(h.saveCalls).toHaveLength(1);
    expect(h.saveCalls[0].vars).toEqual({ id: "d1", content: "draft one" });

    fireEvent.change(textarea, { target: { value: "draft two" } });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(h.saveCalls).toHaveLength(2);

    // Stale ack from the first save must not mask the still-pending second one.
    act(() => {
      h.opts.current?.onSuccess({ ok: true, updatedAt: 1 }, h.saveCalls[0].vars, h.saveCalls[0].ctx);
    });
    expect(screen.queryByText("saved")).toBeNull();
    act(() => {
      h.opts.current?.onSuccess({ ok: true, updatedAt: 2 }, h.saveCalls[1].vars, h.saveCalls[1].ctx);
    });
    expect(screen.getByText("saved")).toBeTruthy();
  });

  it("flushes a pending debounce when leaving via back, exactly once", () => {
    const { textarea } = openEditor();
    fireEvent.change(textarea, { target: { value: "typed then left" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByText("All documents"));
    expect(h.saveCalls).toHaveLength(1);
    expect(h.saveCalls[0].vars.content).toBe("typed then left");
  });

  it("flushes a pending debounce on unmount", () => {
    const { textarea, unmount } = openEditor();
    fireEvent.change(textarea, { target: { value: "last words" } });
    unmount();
    expect(h.saveCalls).toHaveLength(1);
    expect(h.saveCalls[0].vars.content).toBe("last words");
  });

  it("saves immediately on Cmd+S and disables the Save button once saved", () => {
    const { textarea } = openEditor();
    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "quick" } });
    expect(saveButton.disabled).toBe(false);
    fireEvent.keyDown(textarea, { key: "s", metaKey: true });
    expect(h.saveCalls).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(h.saveCalls).toHaveLength(1); // debounce was cancelled by the flush

    act(() => {
      h.opts.current?.onSuccess({ ok: true, updatedAt: 1 }, h.saveCalls[0].vars, h.saveCalls[0].ctx);
    });
    expect(saveButton.disabled).toBe(true);
  });

  it("shows retry + toasts on failure, and retry refires the save", () => {
    const { textarea } = openEditor();
    fireEvent.change(textarea, { target: { value: "will fail" } });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => {
      h.opts.current?.onError(new Error("boom"), h.saveCalls[0].vars, h.saveCalls[0].ctx);
    });
    expect(h.toastError).toHaveBeenCalledWith(expect.stringContaining("boom"));

    fireEvent.click(screen.getByText(/not saved — retry/));
    expect(h.saveCalls).toHaveLength(2);
    expect(h.saveCalls[1].vars.content).toBe("will fail");
  });

  it("writes the byId cache and invalidates the list on success", () => {
    const { textarea } = openEditor();
    fireEvent.change(textarea, { target: { value: "cache me" } });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    act(() => {
      h.opts.current?.onSuccess({ ok: true, updatedAt: 123 }, h.saveCalls[0].vars, h.saveCalls[0].ctx);
    });
    expect(h.setData).toHaveBeenCalledWith({ id: "d1" }, expect.any(Function));
    const updater = h.setData.mock.calls[0][1] as (prev: unknown) => { content: string };
    expect(updater({ id: "d1", content: "old" }).content).toBe("cache me");
    expect(h.invalidateList).toHaveBeenCalled();
  });

  it("shows the view-only notice, hides Save, and never saves when !canEdit", () => {
    h.byIdData.current = { ...h.byIdData.current, canEdit: false };
    const { textarea } = openEditor();
    expect(screen.getByText(/View only — ask the owner for edit access/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.change(textarea, { target: { value: "sneaky" } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(h.saveCalls).toHaveLength(0);
  });

  it("warns on beforeunload only while unsaved", () => {
    const { textarea } = openEditor();
    let evt = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(evt.defaultPrevented).toBe(false);

    fireEvent.change(textarea, { target: { value: "unsaved" } });
    evt = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(evt.defaultPrevented).toBe(true);
  });
});
