"use client";

// Bridges a `cite` FeedCard (deep in the run feed) to the "Source document"
// panel in ConversationWorkspace: clicking a citation asks the panel to open,
// scroll to the anchor, and briefly highlight the cited passage.

import { createContext, useContext } from "react";

export type ScrollToCitation = (anchor: string, quote?: string, section?: string) => void;

const CitationContext = createContext<ScrollToCitation | null>(null);

export const CitationProvider = CitationContext.Provider;

/** Returns a handler when the conversation has a scrollable source doc, else null. */
export function useCitationScroll(): ScrollToCitation | null {
  return useContext(CitationContext);
}
