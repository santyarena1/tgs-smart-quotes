import {describe, expect, it} from "vitest";
import {
  PUBLIC_RAILWAY_API,
  isUnusableOnVercel,
  resolveApiProxyTarget,
} from "./api-proxy-target";

describe("resolveApiProxyTarget", () => {
  it("en local usa localhost si no hay env", () => {
    expect(resolveApiProxyTarget({})).toBe("http://127.0.0.1:3001/api");
  });

  it("en Railway acepta el hostname interno", () => {
    expect(
      resolveApiProxyTarget({
        API_PROXY_TARGET: "http://api.railway.internal:3001/api/",
      }),
    ).toBe("http://api.railway.internal:3001/api");
  });

  it("en Vercel descarta railway.internal y localhost", () => {
    expect(
      resolveApiProxyTarget({
        VERCEL: "1",
        API_PROXY_TARGET: "http://api.railway.internal:3001/api",
        API_PUBLIC_URL: "http://127.0.0.1:3001/api",
      }),
    ).toBe(PUBLIC_RAILWAY_API);
  });

  it("en Vercel respeta una URL pública explícita", () => {
    expect(
      resolveApiProxyTarget({
        VERCEL: "1",
        API_PUBLIC_URL: "https://api-production-a604.up.railway.app/api/",
      }),
    ).toBe("https://api-production-a604.up.railway.app/api");
  });

  it("marca internas y locales como inutilizables en Vercel", () => {
    expect(isUnusableOnVercel("http://api.railway.internal:3001/api")).toBe(true);
    expect(isUnusableOnVercel("http://127.0.0.1:3001/api")).toBe(true);
    expect(isUnusableOnVercel("http://localhost:3001/api")).toBe(true);
    expect(isUnusableOnVercel(PUBLIC_RAILWAY_API)).toBe(false);
  });
});
