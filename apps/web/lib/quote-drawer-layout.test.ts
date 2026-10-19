import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1] ?? "";
}

describe("cajón de presupuestos: no se estira con la página", () => {
  it("con el cajón abierto, html/body no scrollean detrás", () => {
    expect(css).toMatch(/html:has\(\.overlay\)[\s\S]{0,180}?overflow:\s*hidden/);
    expect(css).toMatch(/html:has\(\.overlay\)[\s\S]{0,180}?height:\s*100dvh/);
  });

  it("el overlay queda recortado al alto de la pantalla y puede encogerse", () => {
    const overlay = block(".overlay");
    expect(overlay).toMatch(/overflow:\s*hidden/);
    expect(overlay).toMatch(/100dvh/);
    expect(overlay).toMatch(/min-height:\s*0/);
    expect(overlay).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  });

  it("el cajón puede encogerse dentro del overlay", () => {
    const drawer = block(".drawer");
    expect(drawer).toMatch(/min-height:\s*0/);
    expect(drawer).toMatch(/overflow:\s*hidden/);
    expect(drawer).toMatch(/flex-direction:\s*column/);
  });

  it("el cuerpo scrollea y no infla a los hijos", () => {
    const body = block(".drawer-body");
    expect(body).toMatch(/flex-direction:\s*column/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow:\s*auto/);
    expect(body).toMatch(/justify-content:\s*flex-start/);
    expect(block(".drawer-body > *")).toMatch(/flex:\s*0 0 auto/);
    expect(block(".drawer-body > *")).toMatch(/height:\s*max-content/);
  });

  it("el formulario no reparte huecos entre filas", () => {
    const form = block(".form-grid");
    expect(form).toMatch(/align-content:\s*start/);
    expect(form).toMatch(/grid-auto-rows:\s*min-content/);
    expect(form).toMatch(/height:\s*max-content/);
  });

  it("la tabla de ítems no se estira para llenar el cajón", () => {
    expect(block(".items-table")).toMatch(/height:\s*auto/);
    expect(block(".items-table tr")).toMatch(/height:\s*auto/);
  });
});
