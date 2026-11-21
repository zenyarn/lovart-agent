// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { CanvasWorkspace } from "../canvas-workspace";
import type { ProjectDetail } from "@/lib/types";
const mocks = vi.hoisted(() => ({
  flow: { fitView: vi.fn(), setViewport: vi.fn() },
  api: vi.fn(),
  dragStop: (() => {}) as () => void,
}));
vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  ReactFlow: (props: { onNodeDragStop: () => void }) => {
    mocks.dragStop = props.onNodeDragStop;
    return null;
  },
  useReactFlow: () => mocks.flow,
}));
vi.mock("../composer", () => ({ Composer: () => null }));
vi.mock("../model-icon", () => ({ ModelIcon: () => null }));
vi.mock("@/lib/client-api", () => ({ api: (path:string,options?:RequestInit)=>path.endsWith("/agent")?Promise.resolve({runs:[]}):mocks.api(path,options) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});
it("fits the first successful result when opening a project with a pending placeholder", async () => {
  vi.useFakeTimers();
  const initial: ProjectDetail = {
    project: {
      id: "p",
      name: "Untitled",
      updated_at: "2026-11-20",
      cover_asset_id: null,
      revision: 0,
      viewport: { x: 0, y: 0, zoom: 1 },
      model_settings: {},
    },
    nodes: [
      {
        id: "n",
        generation_id: "g",
        asset_id: null,
        x: 0,
        y: 0,
        width: 512,
        height: 512,
      },
    ],
    assets: {},
    generations: [
      {
        id: "g",
        project_id: "p",
        prompt: "cup",
        model: "nano",
        config: { resolution: "1K", ratio: "1:1" },
        reference_asset_id: null,
        status: "pending",
        error: null,
        created_at: new Date().toISOString(),
        outputs: [],
      },
    ],
  };
  const done: ProjectDetail = {
    ...initial,
    nodes: [{ ...initial.nodes[0], asset_id: "a" }],
    assets: {
      a: {
        id: "a",
        url: "https://example.com/a.png",
        width: 1024,
        height: 1024,
        mime: "image/png",
      },
    },
    generations: [
      {
        ...initial.generations[0],
        status: "succeeded",
        outputs: [{ asset_id: "a", ordinal: 0 }],
      },
    ],
  };
  mocks.api.mockImplementation(async (path: string) =>
    path.includes("/sync") ? {} : done,
  );
  render(<CanvasWorkspace initial={initial} />);
  expect(mocks.flow.fitView).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(mocks.flow.fitView).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(31000);
  });
  expect(mocks.flow.fitView).toHaveBeenCalledTimes(1);
});

function emptyProject(): ProjectDetail {
  return {
    project: {
      id: "p",
      name: "Untitled",
      updated_at: "2026-11-20",
      cover_asset_id: null,
      revision: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      model_settings: {},
    },
    nodes: [],
    assets: {},
    generations: [],
  };
}
it("adopts remote viewport and settings with its revision before the next save", async () => {
  vi.useFakeTimers();
  const initial = emptyProject();
  const remote = {
    ...initial,
    project: {
      ...initial.project,
      revision: 2,
      viewport: { x: 200, y: 80, zoom: 0.7 },
      model_settings: {
        nano: { model: "nano", resolution: "4K", ratio: "16:9" },
      },
    },
  };
  mocks.api.mockImplementation(async (_path: string, options?: RequestInit) =>
    options?.method === "PUT" ? { revision: 3 } : remote,
  );
  render(<CanvasWorkspace initial={initial} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  act(() => mocks.dragStop());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(900);
  });
  const saved = JSON.parse(
    mocks.api.mock.calls.find((c) => c[1]?.method === "PUT")![1].body,
  );
  expect(saved.revision).toBe(2);
  expect(saved.viewport).toEqual(remote.project.viewport);
  expect(saved.settings).toEqual(remote.project.model_settings);
});
it("does not remove another tabs newer draft after an older save resolves", async () => {
  vi.useFakeTimers();
  let finish!: (v: unknown) => void;
  mocks.api.mockImplementation((_path: string, options?: RequestInit) =>
    options?.method === "PUT"
      ? new Promise((r) => {
          finish = r;
        })
      : Promise.resolve(emptyProject()),
  );
  render(<CanvasWorkspace initial={emptyProject()} />);
  act(() => mocks.dragStop());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(850);
  });
  const otherDraft = JSON.stringify({
    revision: 1,
    nodes: [],
    viewport: { x: 500, y: 200, zoom: 2 },
    settings: {},
  });
  localStorage.setItem("lovart-canvas:p", otherDraft);
  await act(async () => finish({ revision: 2 }));
  expect(localStorage.getItem("lovart-canvas:p")).toBe(otherDraft);
});
