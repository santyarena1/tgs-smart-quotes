import { describe, expect, it } from "vitest";
import { RECOMMENDED_AI_MODELS } from "./ai-models";

describe("modelos recomendados", () => {
  it("pone GPT-5.2 primero y deja el mini como opción", () => {
    expect(RECOMMENDED_AI_MODELS.map((item) => item.id)).toEqual(["gpt-5.2", "gpt-4o", "gpt-4o-mini"]);
  });
});
