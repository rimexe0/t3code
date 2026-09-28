import { act, StrictMode, useImperativeHandle, useLayoutEffect, useState } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import {
  ComposerHandleContext,
  useComposerHandleRef,
  type ComposerHandleRef,
} from "./composerHandleContext";

let renderer: ReactTestRenderer | undefined;
const shared: ComposerHandleRef = { current: null };

function Composer({ composerRef }: { composerRef: React.Ref<ChatComposerHandle> }) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(
    composerRef,
    () =>
      ({
        isModelPickerOpen: () => open,
        toggleModelPicker: () => setOpen(!open),
      }) as ChatComposerHandle,
    [open],
  );
  return null;
}

function Pane({ active, mounted = true }: { active: boolean; mounted?: boolean }) {
  const { composerRef, composerHandleRef } = useComposerHandleRef(active);
  useLayoutEffect(() => {
    if (active) activeLocalRef = composerRef;
  }, [active, composerRef]);
  return mounted ? <Composer composerRef={composerHandleRef} /> : null;
}

let activeLocalRef: ComposerHandleRef;

async function render(active: "left" | "right", mounted = true) {
  const tree = (
    <StrictMode>
      <ComposerHandleContext value={shared}>
        <Pane active={active === "left"} mounted={mounted} />
        <Pane active={active === "right"} />
      </ComposerHandleContext>
    </StrictMode>
  );
  await act(() => {
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
}

beforeEach(() => {
  shared.current = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("external model-picker actions see child state changes without switching panes", async () => {
  await render("left");
  expect(shared.current?.isModelPickerOpen()).toBe(false);
  await act(() => shared.current?.toggleModelPicker());
  expect(shared.current?.isModelPickerOpen()).toBe(true);
  await act(() => shared.current?.toggleModelPicker());
  expect(shared.current?.isModelPickerOpen()).toBe(false);
});

it("routes external actions to either pane without losing the other composer's state", async () => {
  await render("left");
  await act(() => shared.current?.toggleModelPicker());
  await render("right");
  expect(shared.current?.isModelPickerOpen()).toBe(false);
  await act(() => shared.current?.toggleModelPicker());
  await render("left");
  expect(shared.current?.isModelPickerOpen()).toBe(true);
  await act(() => shared.current?.toggleModelPicker());
  await render("right");
  expect(shared.current?.isModelPickerOpen()).toBe(true);
});

it("keeps a pending pane action on its original composer after focus changes", async () => {
  await render("left");
  const originalPaneRef = activeLocalRef;
  await render("right");
  await act(() => originalPaneRef.current?.toggleModelPicker());
  expect(shared.current?.isModelPickerOpen()).toBe(false);
  await render("left");
  expect(shared.current?.isModelPickerOpen()).toBe(true);
});

it("clears and restores external controls when the active composer unmounts and remounts", async () => {
  await render("left");
  await act(() => shared.current?.toggleModelPicker());
  await render("left", false);
  expect(shared.current).toBeNull();
  await render("left");
  expect(shared.current?.isModelPickerOpen()).toBe(false);
  await act(() => shared.current?.toggleModelPicker());
  expect(shared.current?.isModelPickerOpen()).toBe(true);
});
