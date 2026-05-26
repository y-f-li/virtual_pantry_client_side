import { getApiDomain } from "@/utils/domain";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("getApiDomain", () => {
  it("returns localhost in development", () => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
    expect(getApiDomain()).toBe("http://localhost:8080");
  });

  it("returns prod URL in production", () => {
    process.env = { ...originalEnv, NODE_ENV: "production", NEXT_PUBLIC_PROD_API_URL: "https://my-prod-server.com" };
    expect(getApiDomain()).toBe("https://my-prod-server.com");
  });
});
