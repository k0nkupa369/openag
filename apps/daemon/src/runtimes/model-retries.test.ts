import { describe, expect, test } from "vitest";
import { getDefaultRedactor } from "../redact.js";
import { providerDetail } from "./model-retries.js";

// The shape the AI SDK throws for a provider HTTP error (APICallError): status, raw body and parsed data.
const apiCallError = (status: number, body: unknown) => Object.assign(new Error("Bad Request"), { statusCode: status, responseBody: JSON.stringify(body) });

describe("providerDetail", () => {
  test("names the HTTP status, provider code and message of a rejected request", () => {
    const error = apiCallError(400, { error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", type: "invalid_request_error", code: null } });
    expect(providerDetail(error)).toBe("Provider 400 invalid_request_error: Unsupported parameter: 'temperature' is not supported with this model.");
  });

  test("reads a wrapped cause, prefers the code over the type, and bounds the text", () => {
    const inner = apiCallError(429, { error: { message: "x".repeat(500), type: "requests", code: "insufficient_quota" } });
    const detail = providerDetail(Object.assign(new Error("wrapped"), { cause: inner }))!;
    expect(detail.startsWith("Provider 429 insufficient_quota: xxx")).toBe(true);
    expect(detail.length).toBe(200);
  });

  test("redacts secrets the provider echoes back, and stays silent for unrelated errors", () => {
    const secret = "sk-proj-" + "A1b2C3d4".repeat(6);
    getDefaultRedactor().addSecret(secret);
    expect(providerDetail(apiCallError(401, { error: { message: `Incorrect API key provided: ${secret}`, code: "invalid_api_key" } }))).not.toContain(secret);
    expect(providerDetail(new Error("socket hang up"))).toBeUndefined();
    expect(providerDetail(null)).toBeUndefined();
  });
});
