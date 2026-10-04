import {describe, expect, it} from 'vitest';
import {explicitEscalation, settingsDto} from './chatbot-core.js';

describe('explicitEscalation', () => {
  it('matchea palabras completas, no pedazos de otras', () => {
    expect(explicitEscalation('Quiero más información sobre la PC', ['rma'])).toBeNull();
    expect(explicitEscalation('Ok formas de pago con visa', ['rma'])).toBeNull();
    expect(explicitEscalation('Necesito hacer un RMA del monitor', ['rma'])).toContain('rma');
  });

  it('ignora tildes y mayúsculas, y admite frases', () => {
    expect(explicitEscalation('Quiero una DEVOLUCIÓN ya', ['devolucion'])).toContain('devolucion');
    expect(explicitEscalation('la pc no prende más', ['no prende'])).toContain('no prende');
    expect(explicitEscalation('no se prende la luz', ['no prende'])).toBeNull();
  });
});

describe('matchedResponse', () => {
  const rule = (activators: string[]) => ({
    id: 'r1', enabled: true, activators, similarityThreshold: 100, answer: 'x', context: '',
    attachments: {imageUrl: null, url: null, quote: null},
  });
  it('activa por palabra completa, sin tildes', async () => {
    const {matchedResponse} = await import('./chatbot-core.js');
    expect(matchedResponse([rule(['seña'])] as any, 'Quiero diseñar mi pc')).toBeNull();
    expect(matchedResponse([rule(['seña'])] as any, 'puedo dejar una seña?')?.response.id).toBe('r1');
    expect(matchedResponse([rule(['envios'])] as any, 'hacen envíos a Rosario?')?.response.id).toBe('r1');
  });
});

describe('settingsDto', () => {
  it('no manda followups: se editan en el CRM, no en Configuración → Chatbot', () => {
    const dto = settingsDto({
      id: 'singleton',
      knowledgeEntries: [],
      customRules: [],
      followups: {enabled: true, onlyBotChats: false, steps: [{afterHours: 2, text: 'hola'}]},
      openingMessages: [],
      closingMessages: [],
      escalationKeywords: [],
    });
    expect(dto).not.toHaveProperty('followups');
    expect(dto.ads).toEqual([]);
  });

  it('lee las fichas de anuncios', () => {
    const dto = settingsDto({
      id: 'singleton',
      knowledgeEntries: [],
      customRules: [],
      openingMessages: [],
      closingMessages: [],
      escalationKeywords: [],
      ads: [{
        id: 'pc-gamer',
        enabled: true,
        adId: '1202',
        name: 'PC Gamer',
        headline: 'PC Completa',
        context: 'Ryzen 5',
        openingMessage: '',
        advertisedPriceCents: '65000000',
        quote: null,
      }],
    });
    expect(dto.ads).toHaveLength(1);
    expect(dto.ads[0]?.name).toBe('PC Gamer');
    expect(dto.ads[0]?.advertisedPriceCents).toBe('65000000');
  });
});
