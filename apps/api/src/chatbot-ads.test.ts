import {describe, expect, it} from 'vitest';
import {
  formatAdContext,
  matchAdCampaign,
  mergeSeenAds,
  parseAds,
  pesosFromCents,
  willAutoSend,
  type AdOrigin,
} from './chatbot-ads.js';
import type {ChatbotAdCampaign} from '@tgs/contracts';

const ad = (values: Partial<ChatbotAdCampaign> & Pick<ChatbotAdCampaign, 'id' | 'name'>): ChatbotAdCampaign => ({
  enabled: true,
  adId: '',
  headline: '',
  context: '',
  openingMessage: '',
  advertisedPriceCents: null,
  quote: null,
  ...values,
});

describe('willAutoSend', () => {
  it('solo enciende el typing si el bot está encendido y en Automático', () => {
    expect(willAutoSend(true, 'AUTO')).toBe(true);
    expect(willAutoSend(true, 'SUGGEST')).toBe(false);
    expect(willAutoSend(true, 'OFF')).toBe(false);
    expect(willAutoSend(false, 'AUTO')).toBe(false);
    expect(willAutoSend(true, null)).toBe(false);
  });
});

describe('matchAdCampaign', () => {
  const gamer = ad({
    id: 'pc-gamer',
    adId: '120212345',
    name: 'PC Gamer 650',
    headline: 'PC Completa por $650.000',
    context: 'Ryzen 5 5500 + 1660 Super',
    advertisedPriceCents: '65000000',
  });
  const office = ad({
    id: 'oficina',
    name: 'Oficina',
    headline: 'PC oficina',
    context: 'Para office',
  });

  it('prioriza el id de Meta', () => {
    const origin: AdOrigin = {source_id: '120212345', headline: 'PC oficina'};
    expect(matchAdCampaign([gamer, office], origin)?.id).toBe('pc-gamer');
  });

  it('si no hay id, usa el título', () => {
    expect(matchAdCampaign([gamer, office], {headline: 'pc oficina'})?.id).toBe('oficina');
  });

  it('ignora fichas apagadas', () => {
    expect(matchAdCampaign([{...gamer, enabled: false}], {source_id: '120212345'})).toBeNull();
  });

  it('sin origen no matchea', () => {
    expect(matchAdCampaign([gamer], null)).toBeNull();
    expect(matchAdCampaign([gamer], {})).toBeNull();
  });
});

describe('mergeSeenAds y parseAds', () => {
  it('agrega avisos nuevos y no duplica por id', () => {
    const configured = [ad({id: 'ya', adId: '111', name: 'Ya'})];
    const merged = mergeSeenAds(configured, [
      {source_id: '111', headline: 'Ya'},
      {source_id: '222', headline: 'PC nueva', body: '8 GB'},
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.seen).toBe(true);
    expect(merged[1]?.enabled).toBe(false);
    expect(merged[1]?.adId).toBe('222');
    expect(merged[1]?.context).toBe('8 GB');
  });

  it('parsea solo fichas válidas', () => {
    expect(parseAds([{id: 'x', enabled: true, name: 'Ok'}])).toHaveLength(1);
    expect(parseAds([{foo: 1}, null, 'x'])).toEqual([]);
    expect(parseAds(undefined)).toEqual([]);
  });
});

describe('formatAdContext', () => {
  it('incluye precio en pesos y el presupuesto si está', () => {
    const text = formatAdContext(ad({
      id: 'a',
      name: 'Gamer',
      adId: '9',
      context: 'Tiene RGB',
      advertisedPriceCents: '65000000',
      quote: {familyId: 'q1', version: 1, useLatest: false},
    }), {headline: 'PC Completa'});
    expect(text).toContain('$650.000');
    expect(text).toContain('Tiene RGB');
    expect(text).toContain('presupuesto PDF');
    expect(text).toContain('shouldCreateRequest=false');
  });
});

describe('pesosFromCents', () => {
  it('pasa centavos a pesos con miles, sin decimales', () => {
    expect(pesosFromCents('65000000')).toBe('650.000');
    expect(pesosFromCents('100')).toBe('1');
    expect(pesosFromCents(null)).toBeNull();
  });
});
