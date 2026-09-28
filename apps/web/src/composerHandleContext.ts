import { createContext, use, useCallback, useRef } from "react";
import type { ChatComposerHandle } from "./components/chat/ChatComposer";

export type ComposerHandleRef = React.RefObject<ChatComposerHandle | null>;

export const ComposerHandleContext = createContext<ComposerHandleRef | null>(null);

export function useComposerHandleContext(): ComposerHandleRef | null {
  return use(ComposerHandleContext);
}

export function useComposerHandleRef(isActivePane: boolean) {
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const sharedRef = useComposerHandleContext();
  const composerHandleRef = useCallback(
    (handle: ChatComposerHandle | null) => {
      composerRef.current = handle;
      if (isActivePane && sharedRef) sharedRef.current = handle;
    },
    [isActivePane, sharedRef],
  );
  return { composerRef, composerHandleRef };
}
