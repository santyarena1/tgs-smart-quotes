import { describe, expect, it, vi } from "vitest";
import {
  CompatibilityFeedbackService,
  IntentClassificationService,
  RequestAnalysisService,
  ResponseSuggestionService,
  SemanticSimilarityService,
  canonicalize,
  createAiClient,
  fallbackIntentClassification,
  fallbackRequestAnalysis,
  inputHash,
} from "./index.js";

describe("@tgs/ai hash", () => {
  it("canonicaliza claves y BigInt de forma estable", () => {
    expect(inputHash({ b: 1n, a: 2 })).toBe(inputHash({ a: 2, b: "1" }));
    expect(canonicalize({ z: 1, a: 2n })).toEqual({ a: "2", z: 1 });
  });
});

describe("@tgs/ai fallbacks", () => {
  it("detecta gaming y presupuesto en análisis heurístico", () => {
    const result = fallbackRequestAnalysis({
      text: "Quiero una PC gamer con RTX 4060, presupuesto 800 mil pesos",
    });
    expect(result.usage).toBe("gaming");
    expect(result.components).toContain("placa de video");
    expect(result.budgetCents).toBe(80_000_000);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("clasifica aceptación por keywords", () => {
    expect(fallbackIntentClassification({ replyText: "Dale, confirmo" }).intent).toBe(
      "ACEPTA",
    );
    expect(fallbackIntentClassification({ replyText: "No gracias" }).intent).toBe("RECHAZA");
  });
});

describe("@tgs/ai servicios sin API key", () => {
  const deps = { client: null, model: "test-model" };

  it("RequestAnalysisService devuelve usedAi:false", async () => {
    const service = new RequestAnalysisService(deps);
    const { result, metadata } = await service.analyze({
      text: "PC oficina con SSD",
    });
    expect(metadata.usedAi).toBe(false);
    expect(metadata.model).toBe("fallback");
    expect(result.components.length).toBeGreaterThanOrEqual(0);
  });

  it("usa cache cuando findCached responde", async () => {
    const cached = {
      usage: "gaming",
      components: ["gpu"],
      budgetCents: null,
      notes: "cache",
      confidence: 90,
    };
    const findCached = vi.fn().mockResolvedValue({
      resultJson: cached,
      model: "gpt-cache",
    });
    const save = vi.fn();
    const service = new RequestAnalysisService({
      client: createAiClient({ apiKey: "sk-test" }),
      cache: { findCached, save },
    });
    const { result, metadata } = await service.analyze(
      { text: "texto cacheado" },
      { cache: { findCached, save } },
    );
    expect(metadata.cacheHit).toBe(true);
    expect(metadata.usedAi).toBe(true);
    expect(result.notes).toBe("cache");
    expect(findCached).toHaveBeenCalledOnce();
  });

  it("CompatibilityFeedbackService genera advertencias heurísticas", async () => {
    const service = new CompatibilityFeedbackService(deps);
    const { metadata, result } = await service.evaluate({
      items: [
        { name: "DDR4 16GB", line: "Memoria", quantity: 1 },
        { name: "DDR5 32GB", line: "Memoria", quantity: 1 },
      ],
      expectedUse: "gaming",
    });
    expect(metadata.usedAi).toBe(false);
    expect(result.warnings.some((w) => w.includes("DDR"))).toBe(true);
  });

  it("ResponseSuggestionService respeta tono", async () => {
    const service = new ResponseSuggestionService(deps);
    const { result } = await service.suggest({
      tone: "TECNICO",
      expectedUse: "edición",
      components: ["Ryzen 7", "RTX 4070"],
      totalSaleCents: 150_000_000,
    });
    expect(result.text).toMatch(/configuraci/i);
  });

  it("IntentClassificationService funciona sin key", async () => {
    const service = new IntentClassificationService(deps);
    const { result, metadata } = await service.classify({ replyText: "¿Cuánto sale?" });
    expect(metadata.usedAi).toBe(false);
    expect(result.intent).toBe("CONSULTA");
  });

  it("SemanticSimilarityService usa similitud determinística", async () => {
    const service = new SemanticSimilarityService(deps);
    const { result } = await service.compare({
      candidateA: { label: "ASUS RTX 4060" },
      candidateB: { label: "RTX 4060 ASUS" },
      deterministicScore: 68,
    });
    expect(result.score).toBeGreaterThan(50);
    expect(result.rationale).toContain("determinística");
  });
});
