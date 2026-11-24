// @vitest-environment jsdom
/**
 * useSession sends a requestId per request (reused on a manual retry of the same request) and one
 * workflowId per idea, and Stop aborts the request through its AbortController.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClarifyRequest, GenerateRequest, StreamEvent, TransformRequest } from "@/lib/contracts";
import { ClientError, type PromptHubClient } from "@/lib/client/types";
import { createMemoryStore } from "@/lib/history/memory-store";
import { useSession } from "@/hooks/use-session";

function fakeClient() {
  const clarifies: ClarifyRequest[] = [];
  const generates: GenerateRequest[] = [];
  const transforms: TransformRequest[] = [];
  const signals: AbortSignal[] = [];
  let failNextClarify = false;
  let hang = false;
  const client: PromptHubClient = {
    kind: "api",
    getAiStatus: vi.fn(),
    async clarify(req) {
      clarifies.push(req);
      if (failNextClarify) {
        failNextClarify = false;
        throw new ClientError({ code: "quota_exhausted", message: "used up", resetsAt: "2026-11-25T08:00:00.000Z" });
      }
      return { questions: [], engine: { kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.8-flash" } };
    },
    async *generate(req, signal) {
      generates.push(req);
      if (signal) signals.push(signal);
      yield { type: "meta", engine: { kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.8-flash" }, requestId: req.requestId ?? "" } satisfies StreamEvent;
      if (hang) {
        await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      }
      yield { type: "done", text: `prompt for ${req.idea}`, title: "T" };
    },
    async *transform(req) {
      transforms.push(req);
      yield { type: "error", error: { code: "provider_unavailable", message: "try again" } };
    },
  };
  return {
    client,
    clarifies,
    generates,
    transforms,
    signals,
    failClarify: () => (failNextClarify = true),
    setHang: (v: boolean) => (hang = v),
  };
}

const uuid = /^[0-9a-f-]{36}$/;

describe("useSession request ids", () => {
  it("clarify + generate share a workflowId; each request has its own requestId; a retry reuses it", async () => {
    const f = fakeClient();
    const { result } = renderHook(() => useSession(f.client, createMemoryStore({}, { persistent: false })));
    act(() => result.current.actions.dispatch({ type: "setIdea", idea: "plan a trip" }));
    f.failClarify();
    await act(() => result.current.actions.clarify());
    expect(result.current.state.error).toMatchObject({ code: "quota_exhausted", resetsAt: "2026-11-25T08:00:00.000Z" });
    expect(result.current.state.idea).toBe("plan a trip"); // the draft is kept

    await act(async () => result.current.actions.retry());
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    const [first, retried] = f.clarifies;
    expect(first.requestId).toMatch(uuid);
    expect(retried.requestId).toBe(first.requestId); // manual retry of the same request
    expect(retried.workflowId).toBe(first.workflowId);
    expect(f.generates[0].workflowId).toBe(first.workflowId); // one workflow per idea
    expect(f.generates[0].requestId).not.toBe(first.requestId);

    // A transform error, retried, reuses the transform's id; a fresh action gets a new one.
    await act(async () => result.current.actions.transform("improve"));
    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    await act(async () => result.current.actions.retry());
    await waitFor(() => expect(f.transforms).toHaveLength(2));
    expect(f.transforms[1].requestId).toBe(f.transforms[0].requestId);
    await act(async () => result.current.actions.transform("shorten"));
    await waitFor(() => expect(f.transforms).toHaveLength(3));
    expect(f.transforms[2].requestId).not.toBe(f.transforms[0].requestId);

    // Regenerate: a new request, flagged so the server counts it as a refinement.
    await act(async () => result.current.actions.regenerate());
    await waitFor(() => expect(f.generates).toHaveLength(2));
    expect(f.generates[1]).toMatchObject({ regenerate: true, workflowId: first.workflowId });

    // A new idea (new clarify) starts a new workflow.
    act(() => result.current.actions.reset());
    act(() => result.current.actions.dispatch({ type: "setIdea", idea: "another idea" }));
    await act(() => result.current.actions.clarify());
    expect(f.clarifies.at(-1)!.workflowId).not.toBe(first.workflowId);
  });

  it("Stop aborts the in-flight request", async () => {
    const f = fakeClient();
    f.setHang(true);
    const { result } = renderHook(() => useSession(f.client, createMemoryStore({}, { persistent: false })));
    act(() => result.current.actions.dispatch({ type: "setIdea", idea: "plan a trip" }));
    await act(() => result.current.actions.clarify());
    await waitFor(() => expect(f.signals).toHaveLength(1));
    act(() => void result.current.actions.stop());
    expect(f.signals[0].aborted).toBe(true);
  });
});
