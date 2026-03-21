"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftStatus = "generating" | "ready" | "error";

export interface DraftRecipe {
  id: string;
  status: DraftStatus;
  prompt: string;
  data: Partial<RecipeFormValues> | null;
  error: string | null;
  timestamp: number;
}

interface RecipeGenerationContextValue {
  drafts: DraftRecipe[];
  generate: (prompt: string) => void;
  removeDraft: (id: string) => void;
  retryDraft: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "menuly-drafts";
const STALE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RecipeGenerationContext = createContext<RecipeGenerationContextValue | null>(null);

export function useRecipeGeneration(): RecipeGenerationContextValue {
  const ctx = useContext(RecipeGenerationContext);
  if (!ctx) {
    throw new Error("useRecipeGeneration must be used within RecipeGenerationProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function loadDraftsFromSession(): DraftRecipe[] {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftRecipe[];
    const now = Date.now();
    // Filter out stale "generating" entries (likely from a previous session crash)
    return parsed.filter(
      (d) =>
        !(d.status === "generating" && now - d.timestamp > STALE_TIMEOUT_MS)
    );
  } catch {
    return [];
  }
}

function saveDraftsToSession(drafts: DraftRecipe[]): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // sessionStorage unavailable — fail silently
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RecipeGenerationProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<DraftRecipe[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Load persisted drafts on mount
  useEffect(() => {
    const persisted = loadDraftsFromSession();
    setDrafts(persisted);
  }, []);

  // Persist drafts on every state change
  useEffect(() => {
    saveDraftsToSession(drafts);
  }, [drafts]);

  // ------------------------------------------------------------------
  // runGeneration: SSE streaming for a given draft
  // ------------------------------------------------------------------
  const runGeneration = useCallback((draft: DraftRecipe) => {
    const controller = new AbortController();
    abortControllersRef.current.set(draft.id, controller);

    (async () => {
      try {
        const response = await fetch("/api/recipes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: draft.prompt }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => "Unknown error");
          throw new Error(errText || `Request failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;

            try {
              const json = JSON.parse(raw) as {
                done?: boolean;
                token?: string;
                data?: Partial<RecipeFormValues>;
                error?: string;
                remaining?: number | null;
              };

              // Skip token-only events (streaming progress)
              if (json.token) continue;

              if (json.done && json.data) {
                const recipeName = json.data.name ?? "Recipe";

                setDrafts((prev) =>
                  prev.map((d) =>
                    d.id === draft.id
                      ? { ...d, status: "ready" as DraftStatus, data: json.data! }
                      : d
                  )
                );

                toast.success(`${recipeName} is ready — tap to review`, {
                  action: {
                    label: "View",
                    onClick: () => {
                      window.location.href = "/recipes";
                    },
                  },
                });

                if (json.remaining !== null && json.remaining !== undefined) {
                  toast.info(`${json.remaining} AI generation(s) remaining today`);
                }
              } else if (json.error) {
                throw new Error(json.error ?? "Generation failed");
              }
            } catch {
              // Non-JSON or partial line — skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const message =
          err instanceof Error ? err.message : "Recipe generation failed";

        setDrafts((prev) =>
          prev.map((d) =>
            d.id === draft.id
              ? { ...d, status: "error" as DraftStatus, error: message }
              : d
          )
        );

        toast.error(message);
      } finally {
        abortControllersRef.current.delete(draft.id);
      }
    })();
  }, []);

  // ------------------------------------------------------------------
  // generate: Create a new draft and kick off SSE
  // ------------------------------------------------------------------
  const generate = useCallback(
    (prompt: string) => {
      const newDraft: DraftRecipe = {
        id: generateId(),
        status: "generating",
        prompt,
        data: null,
        error: null,
        timestamp: Date.now(),
      };

      setDrafts((prev) => [newDraft, ...prev]);
      runGeneration(newDraft);
    },
    [runGeneration]
  );

  // ------------------------------------------------------------------
  // removeDraft: Abort if in-flight, then remove
  // ------------------------------------------------------------------
  const removeDraft = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ------------------------------------------------------------------
  // retryDraft: Reset to generating and re-run
  // ------------------------------------------------------------------
  const retryDraft = useCallback(
    (id: string) => {
      setDrafts((prev) => {
        const target = prev.find((d) => d.id === id);
        if (!target) return prev;

        const updated: DraftRecipe = {
          ...target,
          status: "generating",
          error: null,
          data: null,
          timestamp: Date.now(),
        };

        // Kick off outside of render cycle
        setTimeout(() => runGeneration(updated), 0);

        return prev.map((d) => (d.id === id ? updated : d));
      });
    },
    [runGeneration]
  );

  return (
    <RecipeGenerationContext.Provider value={{ drafts, generate, removeDraft, retryDraft }}>
      {children}
    </RecipeGenerationContext.Provider>
  );
}
