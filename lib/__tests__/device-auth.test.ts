import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeviceAuthTokenErrorCode } from "@wxyc/shared/dtos";
import {
  ARCHIVE_CLIENT_ID,
  interpretTokenPoll,
  pollDeviceToken,
  requestDeviceCode,
  type PollOutcome,
} from "../device-auth";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCall() {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit];
  return {
    url: String(url),
    method: init.method,
    body: JSON.parse(String(init.body)),
  };
}

describe("interpretTokenPoll", () => {
  it("treats any 200 as success, even with an unparseable body", () => {
    // A truncated 200 still means the grant was issued and the cookie is set.
    // Gating on a token field would misreport a signed-in DJ as an error.
    expect(interpretTokenPoll(200, null)).toEqual({ kind: "success", token: {} });
  });

  it("carries the token through on success", () => {
    const outcome = interpretTokenPoll(200, { access_token: "t" });
    expect(outcome).toEqual({
      kind: "success",
      token: { access_token: "t" },
    });
  });

  // The whole enum is covered so a new upstream code cannot silently land in
  // the catch-all and turn a terminal state into an endless poll.
  const expected: Record<DeviceAuthTokenErrorCode, PollOutcome["kind"]> = {
    [DeviceAuthTokenErrorCode.authorization_pending]: "pending",
    [DeviceAuthTokenErrorCode.slow_down]: "slow_down",
    [DeviceAuthTokenErrorCode.expired_token]: "expired",
    [DeviceAuthTokenErrorCode.access_denied]: "denied",
    [DeviceAuthTokenErrorCode.invalid_request]: "error",
    [DeviceAuthTokenErrorCode.invalid_grant]: "error",
    [DeviceAuthTokenErrorCode.server_error]: "error",
  };

  it("covers every DeviceAuthTokenErrorCode member", () => {
    expect(Object.keys(expected).sort()).toEqual(
      Object.values(DeviceAuthTokenErrorCode).sort()
    );
  });

  it.each(Object.entries(expected))(
    "maps %s to %s",
    (code, kind) => {
      expect(interpretTokenPoll(400, { error: code }).kind).toBe(kind);
    }
  );

  it("keeps the code on a generic error so it can be logged", () => {
    expect(
      interpretTokenPoll(400, {
        error: DeviceAuthTokenErrorCode.server_error,
      })
    ).toEqual({ kind: "error", code: DeviceAuthTokenErrorCode.server_error });
  });

  it("falls back to a bare error for an unrecognised code", () => {
    expect(interpretTokenPoll(400, { error: "something_new" })).toEqual({
      kind: "error",
    });
  });

  it("falls back to a bare error when there is no body at all", () => {
    expect(interpretTokenPoll(500, null)).toEqual({ kind: "error" });
  });
});

describe("requestDeviceCode", () => {
  it("starts a flow and returns the codes to display", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        device_code: "dev-1",
        user_code: "L22TDY5F",
        verification_uri: "https://dj.wxyc.org/device-auth",
        verification_uri_complete:
          "https://dj.wxyc.org/device-auth?user_code=L22TDY5F",
        expires_in: 300,
        interval: 5,
      })
    );

    const result = await requestDeviceCode();

    expect(result.user_code).toBe("L22TDY5F");
    const call = lastCall();
    expect(call.url).toBe("/auth/device/code");
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ client_id: ARCHIVE_CLIENT_ID });
  });

  it("throws when the flow cannot be started", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "server_error" }, 500));

    await expect(requestDeviceCode()).rejects.toThrow(/500/);
  });
});

describe("pollDeviceToken", () => {
  it("submits the device code with the RFC 8628 grant type", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: DeviceAuthTokenErrorCode.authorization_pending }, 400)
    );

    const { status, body } = await pollDeviceToken("dev-1");

    expect(status).toBe(400);
    expect(body).toEqual({
      error: DeviceAuthTokenErrorCode.authorization_pending,
    });

    const call = lastCall();
    expect(call.url).toBe("/auth/device/token");
    expect(call.body).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "dev-1",
      client_id: ARCHIVE_CLIENT_ID,
    });
  });

  it("reports the status without judging it, even on a non-JSON body", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 502 }));

    await expect(pollDeviceToken("dev-1")).resolves.toEqual({
      status: 502,
      body: null,
    });
  });
});
