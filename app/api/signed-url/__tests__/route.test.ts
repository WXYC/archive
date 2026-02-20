import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the JWT utils
const mockVerifyAuthHeader = vi.fn();
vi.mock("@/lib/jwt-utils", () => ({
  verifyAuthHeader: (header: string | null) => mockVerifyAuthHeader(header),
}));

// Mock roleToAuthorization and Authorization
vi.mock("@wxyc/shared/auth-client/auth", () => ({
  Authorization: { NO: 0, DJ: 1, MD: 2, SM: 3, ADMIN: 4 },
  roleToAuthorization: (role: string | null | undefined) => {
    if (!role) return 0;
    switch (role) {
      case "admin":
        return 4;
      case "stationManager":
        return 3;
      case "musicDirector":
        return 2;
      case "dj":
        return 1;
      default:
        return 0;
    }
  },
}));

// Mock S3 client
const mockGetSignedUrl = vi.fn();
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {},
  GetObjectCommand: class MockGetObjectCommand {
    constructor(public params: unknown) {}
  },
}));

// Mock archive configs
vi.mock("@/config/archive", () => ({
  archiveConfigs: {
    default: {
      dateRange: { days: 14, description: "past 2 weeks" },
    },
    dj: {
      dateRange: { days: 90, description: "past 3 months" },
    },
  },
  getDateRange: (config: { dateRange: { days: number } }) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - config.dateRange.days);
    startDate.setHours(0, 0, 0, 0);
    return { today, startDate };
  },
}));

// We need to import the route after mocks are set up
// Using dynamic import to avoid hoisting issues
describe("POST /api/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue("https://s3.example.com/signed-url");
  });

  async function callRoute(body: object, authHeader?: string) {
    // Dynamically import the route to get fresh module
    const { POST } = await import("../route");

    const headers = new Headers({ "Content-Type": "application/json" });
    if (authHeader) {
      headers.set("Authorization", authHeader);
    }

    const request = new Request("http://localhost/api/signed-url", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return POST(request);
  }

  describe("input validation", () => {
    it("should return 400 if no key provided", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: false,
        error: "No authorization header",
      });

      const response = await callRoute({});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Key is required");
    });

    it("should return 400 for invalid key format", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: false,
        error: "No authorization header",
      });

      const response = await callRoute({ key: "invalid-key-format" });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid file key format");
    });
  });

  describe("unauthenticated access", () => {
    beforeEach(() => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: false,
        error: "No authorization header",
      });
    });

    it("should allow access to files within 14-day range", async () => {
      // Create a date 7 days ago
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute({ key });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.url).toBe("https://s3.example.com/signed-url");
    });

    it("should deny access to files outside 14-day range", async () => {
      // Create a date 30 days ago
      const date = new Date();
      date.setDate(date.getDate() - 30);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute({ key });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("File is outside the allowed date range");
    });
  });

  describe("authenticated DJ access", () => {
    it("should allow DJ role access to files within 90-day range", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "user-1", role: "dj" },
        role: "dj",
      });

      // Create a date 60 days ago (within 90 days, outside 14 days)
      const date = new Date();
      date.setDate(date.getDate() - 60);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.url).toBe("https://s3.example.com/signed-url");
    });

    it("should allow musicDirector role extended access", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "user-1", role: "musicDirector" },
        role: "musicDirector",
      });

      const date = new Date();
      date.setDate(date.getDate() - 60);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );

      expect(response.status).toBe(200);
    });

    it("should allow stationManager role extended access", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "user-1", role: "stationManager" },
        role: "stationManager",
      });

      const date = new Date();
      date.setDate(date.getDate() - 60);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );

      expect(response.status).toBe(200);
    });

    it("should allow admin role extended access", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "admin-1", role: "admin" },
        role: "admin",
      });

      const date = new Date();
      date.setDate(date.getDate() - 60);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );

      expect(response.status).toBe(200);
    });

    it("should deny DJ access to files outside 90-day range", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "user-1", role: "dj" },
        role: "dj",
      });

      // Create a date 100 days ago (outside 90 days)
      const date = new Date();
      date.setDate(date.getDate() - 100);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("File is outside the allowed date range");
    });
  });

  describe("authenticated member access (non-DJ role)", () => {
    it("should only allow 14-day access for member role", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: true,
        payload: { sub: "user-1", role: "member" },
        role: "member",
      });

      // Create a date 30 days ago (within 90 days but outside 14 days)
      const date = new Date();
      date.setDate(date.getDate() - 30);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      const response = await callRoute(
        { key },
        "Bearer valid-jwt-token"
      );
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("File is outside the allowed date range");
    });
  });

  describe("authorization header handling", () => {
    it("should call verifyAuthHeader with the Authorization header", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: false,
        error: "Token expired",
      });

      const date = new Date();
      date.setDate(date.getDate() - 7);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      await callRoute({ key }, "Bearer test-token");

      expect(mockVerifyAuthHeader).toHaveBeenCalledWith("Bearer test-token");
    });

    it("should call verifyAuthHeader with null when no header", async () => {
      mockVerifyAuthHeader.mockResolvedValue({
        authenticated: false,
        error: "No authorization header",
      });

      const date = new Date();
      date.setDate(date.getDate() - 7);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const key = `${year}/${month}/${day}/${year}${month}${day}1200.mp3`;

      await callRoute({ key });

      expect(mockVerifyAuthHeader).toHaveBeenCalledWith(null);
    });
  });
});
