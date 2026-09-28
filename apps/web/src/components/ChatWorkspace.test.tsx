import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, useState, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const navigation = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigation }));
vi.mock("../state/entities", () => ({ useThread: () => null, useProject: () => null }));
vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: () => true }));
vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: { getDraftSession: () => null }) => unknown) =>
    select({ getDraftSession: () => null }),
}));
vi.mock("./DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipPopup: () => null,
}));
vi.mock("./ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("./ChatView", () => ({ default: TestChat }));

import { ChatWorkspace } from "./ChatWorkspace";
import { chatWorkspaceTargetKey, useChatWorkspaceStore } from "../chatWorkspaceStore";

function TestChat({ threadId, isActivePane }: { threadId: string; isActivePane: boolean }) {
  const [text, setText] = useState("");
  return (
    <input
      aria-label={threadId}
      data-active={isActivePane}
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  );
}

const target = (id: string) => ({
  kind: "server" as const,
  threadRef: { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make(id) },
});
let renderer: ReactTestRenderer;
const chat = (id: string) => renderer.root.findByProps({ "aria-label": id });
const chats = () => renderer.root.findAllByType("input").map((node) => node.props["aria-label"]);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.mockReset();
  useChatWorkspaceStore.getState().reset();
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  useChatWorkspaceStore.getState().reset();
  vi.unstubAllGlobals();
});

async function openSplit() {
  useChatWorkspaceStore.getState().addPane(target("A"));
  useChatWorkspaceStore.getState().addPane(target("B"));
  await act(() => {
    renderer = create(<ChatWorkspace activeTarget={target("B")} />);
  });
  await act(() => {
    chat("A").props.onChange({ target: { value: "keep my composer" } });
  });
}

it("uses the initial route when restoring a workspace with another active pane", async () => {
  useChatWorkspaceStore.getState().addPane(target("A"));
  useChatWorkspaceStore.getState().addPane(target("B"));
  await act(() => {
    renderer = create(<ChatWorkspace activeTarget={target("A")} />);
  });
  expect(chats()).toEqual(["A", "B"]);
  expect(chat("A").props["data-active"]).toBe(true);
  expect(useChatWorkspaceStore.getState().activePaneId).toBe(chatWorkspaceTargetKey(target("A")));
});

it("keeps the surviving chat mounted while an active close waits for navigation", async () => {
  await openSplit();
  await act(() => {
    renderer.root.findByProps({ "aria-label": "Close pane 2" }).props.onClick();
  });
  expect(chats()).toEqual(["A"]);
  expect(chat("A").props.value).toBe("keep my composer");
  expect(chat("A").props["data-active"]).toBe(true);
  expect(navigation).toHaveBeenCalledWith(
    expect.objectContaining({ params: target("A").threadRef }),
  );

  // A parent rerender can recreate the still-old route target before navigation commits.
  await act(() => {
    renderer.update(<ChatWorkspace activeTarget={target("B")} />);
  });
  expect(chats()).toEqual(["A"]);
  await act(() => {
    renderer.update(<ChatWorkspace activeTarget={target("A")} />);
  });
  expect(chat("A").props.value).toBe("keep my composer");
});

it("closes an inactive pane without changing the route or remounting the active chat", async () => {
  await openSplit();
  await act(() => {
    chat("B").props.onChange({ target: { value: "active draft" } });
  });
  await act(() => {
    renderer.root.findByProps({ "aria-label": "Close pane 1" }).props.onClick();
  });
  expect(chats()).toEqual(["B"]);
  expect(chat("B").props.value).toBe("active draft");
  expect(navigation).not.toHaveBeenCalled();
});

it("activates a dropped pane immediately and preserves existing chats until its route arrives", async () => {
  await openSplit();
  await act(() => {
    useChatWorkspaceStore.getState().addPane(target("C"));
  });
  expect(chats()).toEqual(["A", "B", "C"]);
  expect(chat("C").props["data-active"]).toBe(true);
  await act(() => {
    renderer.update(<ChatWorkspace activeTarget={target("C")} />);
  });
  expect(chat("A").props.value).toBe("keep my composer");
});

it("still replaces the active pane on route navigation and supports navigating back", async () => {
  await openSplit();
  await act(() => {
    renderer.update(<ChatWorkspace activeTarget={target("C")} />);
  });
  expect(chats()).toEqual(["A", "C"]);
  expect(chat("A").props.value).toBe("keep my composer");
  expect(useChatWorkspaceStore.getState().activePaneId).toBe(chatWorkspaceTargetKey(target("C")));
  await act(() => {
    renderer.update(<ChatWorkspace activeTarget={target("B")} />);
  });
  expect(chats()).toEqual(["A", "B"]);
  expect(chat("A").props.value).toBe("keep my composer");
});
