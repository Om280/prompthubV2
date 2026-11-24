import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiModel, testGeminiBaseUrl } from "@/lib/ai/gemini/provider";

const MODEL_ID = "gemini-3.8-flash";
const FAKE_KEY = "AIzaSyFAKEtestKEY0123456789abcdefghijklm"; // not a real key

describe("GEMINI_BASE_URL (test-only override)", () => {
  it("accepts only a loopback http(s) URL", () => {
    expect(testGeminiBaseUrl("http://127.0.0.1:54398/v1beta")).toBe("http://127.0.0.1:54398/v1beta");
    expect(testGeminiBaseUrl("http://localhost:9999/v1beta/")).toBe("http://localhost:9999/v1beta");
    expect(testGeminiBaseUrl(" https://localhost/v1beta ")).toBe("https://localhost/v1beta");
  });

  it("ignores anything that could send the key somewhere else", () => {
    for (const raw of [
      undefined,
      "",
      "   ",
      "not a url",
      "https://evil.example.com/v1beta",
      "https://generativelanguage.googleapis.com.evil.example/v1beta",
      "http://127.0.0.1.evil.example/v1beta",
      "http://localhost.evil.example/v1beta",
      "http://user:pass@127.0.0.1:1/v1beta",
      "http://10.0.0.5/v1beta",
      "http://[::1]:1/v1beta",
      "file:///etc/passwd",
      "ftp://127.0.0.1/v1beta",
    ]) {
      expect(testGeminiBaseUrl(raw), String(raw)).toBeUndefined();
    }
  });

  describe("in the real provider", () => {
    const saved = { key: process.env.GEMINI_API_KEY, base: process.env.GEMINI_BASE_URL };
    afterEach(() => {
      process.env.GEMINI_API_KEY = saved.key;
      if (saved.base === undefined) delete process.env.GEMINI_BASE_URL;
      else process.env.GEMINI_BASE_URL = saved.base;
    });

    async function requestUrl(base: string | undefined): Promise<string> {
      process.env.GEMINI_API_KEY = FAKE_KEY;
      if (base === undefined) delete process.env.GEMINI_BASE_URL;
      else process.env.GEMINI_BASE_URL = base;
      const urls: string[] = [];
      const fetch = vi.fn(async (url: RequestInfo | URL) => {
        urls.push(String(url));
        return new Response(
          JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof globalThis.fetch;
      await generateText({ model: createGeminiModel(MODEL_ID, { fetch }), prompt: "hi", maxRetries: 0 });
      return urls[0];
    }

    it("calls the local fake when GEMINI_BASE_URL is loopback", async () => {
      expect(await requestUrl("http://127.0.0.1:54398/v1beta")).toBe(
        `http://127.0.0.1:54398/v1beta/models/${MODEL_ID}:generateContent`,
      );
    });

    it("calls Google when GEMINI_BASE_URL is unset or points anywhere else", async () => {
      for (const base of [undefined, "https://evil.example.com/v1beta"]) {
        expect(await requestUrl(base)).toMatch(
          new RegExp(`^https://generativelanguage\\.googleapis\\.com/v1beta/models/${MODEL_ID.replace(/\./g, "\\.")}:generateContent$`),
        );
      }
    });
  });
});
