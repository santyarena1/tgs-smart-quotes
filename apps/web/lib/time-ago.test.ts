import { describe, expect, it } from "vitest";
import { timeAgo, timeAgoShort } from "./time-ago";

const NOW = Date.parse("2026-10-07T16:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it("sin fecha dice nunca", () => expect(timeAgo(null, NOW)).toBe("nunca"));
  it("menos de un minuto", () => expect(timeAgo(ago(20), NOW)).toBe("hace un momento"));
  it("minutos", () => expect(timeAgo(ago(5 * 60), NOW)).toBe("hace 5 minutos"));
  it("horas", () => expect(timeAgo(ago(3 * 3600), NOW)).toBe("hace 3 horas"));
  it("días", () => expect(timeAgo(ago(3 * 86400), NOW)).toBe("hace 3 días"));
});

describe("timeAgoShort", () => {
  it("formato compacto", () => {
    expect(timeAgoShort(null, NOW)).toBe("nunca");
    expect(timeAgoShort(ago(10), NOW)).toBe("recién");
    expect(timeAgoShort(ago(21 * 60), NOW)).toBe("hace 21 min");
    expect(timeAgoShort(ago(2 * 3600), NOW)).toBe("hace 2 h");
    expect(timeAgoShort(ago(5 * 86400), NOW)).toBe("hace 5 d");
  });
});
