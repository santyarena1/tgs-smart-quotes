import { describe, expect, it } from "vitest";
import { buildLayers, moveCustomLayer } from "./pdf-layers";
import type { PdfCustomBlock } from "./types";

const block = (id: string, before?: PdfCustomBlock["before"]): PdfCustomBlock => ({ id, text: id, x: 0, y: 0, width: 300, ...(before ? { before } : {}) });
const order = (blocks: PdfCustomBlock[]) => buildLayers(blocks).map((l) => (l.kind === "section" ? l.key : l.block.id));

describe("capas del PDF", () => {
  it("intercala los campos antes de su sección y al final", () => {
    expect(order([block("a", "items"), block("z", "end")])).toEqual(
      ["header", "cards", "services", "a", "items", "totals", "observation", "rma", "footer", "z"],
    );
  });

  it("sube y baja cruzando secciones", () => {
    const up = moveCustomLayer([block("z", "end")], "z", -1);
    expect(order(up).slice(-3)).toEqual(["rma", "z", "footer"]);
    const down = moveCustomLayer(up, "z", 1);
    expect(down[0]!.before).toBe("end");
  });

  it("no sale de los extremos y deja los libres intactos", () => {
    const free = block("libre");
    const top = moveCustomLayer([block("a", "header"), free], "a", -1);
    expect(top[0]!.before).toBe("header");
    expect(top.find((b) => b.id === "libre")!.before).toBeUndefined();
  });

  it("conserva el orden entre campos de una misma capa", () => {
    expect(order([block("a", "totals"), block("b", "totals")]).filter((k) => k === "a" || k === "b")).toEqual(["a", "b"]);
  });
});
