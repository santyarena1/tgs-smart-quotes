import { describe, expect, it } from "vitest";
import { copyInsteadNotice, isCollectionProtected, protectedCollectionsOf, protectionNotice } from "./collection-protection";

describe("collection protection", () => {
  it("trata como protegida la colección sin el dato", () => {
    expect(isCollectionProtected({})).toBe(true);
    expect(isCollectionProtected({ isProtected: true })).toBe(true);
    expect(isCollectionProtected({ isProtected: false })).toBe(false);
  });

  it("devuelve solo las protegidas que contienen el presupuesto", () => {
    const cols = [
      { id: "a", isProtected: true, familyIds: ["q1", "q2"] },
      { id: "b", isProtected: false, familyIds: ["q1"] },
      { id: "c", familyIds: ["q3"] },
      { id: "d", isProtected: true },
    ];
    expect(protectedCollectionsOf(cols, "q1").map((c) => c.id)).toEqual(["a"]);
    expect(protectedCollectionsOf(cols, "q3").map((c) => c.id)).toEqual(["c"]);
    expect(protectedCollectionsOf(cols, "q9")).toEqual([]);
  });

  it("arma los avisos", () => {
    expect(protectionNotice({ name: "Gamer" }, true)).toBe("Protección activada en la colección: Gamer");
    expect(protectionNotice({ name: "Gamer" }, false)).toBe("Protección desactivada en la colección: Gamer");
    expect(copyInsteadNotice("P-1", ["A", "B"])).toContain("las colecciones protegidas “A”, “B”");
  });
});
