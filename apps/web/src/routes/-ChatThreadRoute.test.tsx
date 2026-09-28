import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  shell: {} as object | null,
  detail: {} as object | null,
  chatRender: vi.fn(() => null),
}));

vi.mock("../components/ChatView", () => ({ default: state.chatRender }));
vi.mock("../components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/ChatView.logic", () => ({
  resolveDraftPromotionNavigationTarget: () => null,
  threadHasStarted: () => false,
}));
vi.mock("../components/ChatWorkspace", () => ({ ChatWorkspace: () => null }));
vi.mock("../state/entities", () => ({
  useThread: () => null,
  useThreadShell: () => state.shell,
  useThreadDetail: () => state.detail,
  useThreadStatus: () => null,
  useEnvironmentThreadRefs: () => [],
  useThreadRefs: () => [],
}));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: () => ({ data: { snapshot: { _tag: "Some" } } }),
}));
vi.mock("../state/shell", () => ({ environmentShell: { stateAtom: () => null } }));
vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: (
    select: (store: {
      getDraftSession: () => null;
      getDraftIdByRef: () => null;
      getDraftThreadByRef: () => null;
      hasDraftThreadsInEnvironment: () => boolean;
    }) => unknown,
  ) =>
    select({
      getDraftSession: () => null,
      getDraftIdByRef: () => null,
      getDraftThreadByRef: () => null,
      hasDraftThreadsInEnvironment: () => false,
    }),
  finalizePromotedDraftThreadByRef: vi.fn(),
  markPromotedDraftThreadByRef: vi.fn(),
  useBackgroundDraftSubmissionPending: () => false,
}));

import { Route } from "./_chat.$environmentId.$threadId";
import { ThreadRouteView } from "../components/ThreadRouteView";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";

const threadRef = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
};
let renderer: ReactTestRenderer | undefined;

function MissingThreadRouteView() {
  return <ThreadRouteView target={{ kind: "server", threadRef }} />;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Route, "useParams").mockReturnValue(threadRef);
  state.shell = {};
  state.detail = {};
  state.chatRender.mockClear();
  useSidebarPendingFileDropStore.setState({ pending: [] });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  useSidebarPendingFileDropStore.setState({ pending: [] });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openThread(component = Route.options.component!) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/$environmentId/$threadId",
    component,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/environment-1/thread-1"] }),
  });
  await router.load();
  await act(() => {
    renderer = create(<RouterProvider router={router} />);
  });
  return router;
}

it.each(["ready", "loading"])(
  "does not mount another chat outside the workspace when %s",
  async (phase) => {
    if (phase === "loading") state.detail = null;
    await openThread();
    expect(renderer!.root.findByType(Route.options.component!)).toBeDefined();
    expect(state.chatRender).not.toHaveBeenCalled();
  },
);

it("still releases missing-thread drops without clearing another pane's pending files", async () => {
  state.shell = null;
  state.detail = null;
  const store = useSidebarPendingFileDropStore.getState();
  store.queuePendingFileDrop({ threadRef, files: [] });
  const otherDrop = store.queuePendingFileDrop({
    threadRef: { ...threadRef, threadId: ThreadId.make("thread-2") },
    files: [],
  });
  const router = await openThread(MissingThreadRouteView);
  expect(useSidebarPendingFileDropStore.getState().pending.map((drop) => drop.id)).toEqual([
    otherDrop,
  ]);
  expect(router.state.location.pathname).toBe("/environment-1/thread-1");
});
