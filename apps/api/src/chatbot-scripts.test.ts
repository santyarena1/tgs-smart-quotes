import {describe, expect,it} from 'vitest';
import {casualText} from './chatbot-core.js';
import {
  AULA_LINK,
  AVAILABILITY_REPLY,
  CASH_PRICE_REPLY,
  COMPLAINT_REPLY,
  DESIGN_3D_QUESTION,
  FLUENCY_REPLY,
  GAMES_EXPLAIN,
  GAMES_QUESTION,
  ORDER_STATUS_REPLY,
  PAYMENT_LIST,
  PC_USE_QUESTION,
  PERIPHERALS_QUESTION,
  QUOTE_REPLY,
  STORE_REPLY,
  WEB_QUESTION,
  scriptedTurn,
} from './chatbot-scripts.js';

const fresh = {alreadyGreeted: false, recentText: ''};
const later = {alreadyGreeted: true, recentText: ''};

describe('charlas de ejemplo', () => {
  it('en el primer mensaje que ya dice el producto, saluda y pregunta por la web', () => {
    const turn = scriptedTurn('hola busco procesador', fresh);
    expect(turn?.bubbles).toEqual(['Hola! Soy Fede de The Gamer Shop!', WEB_QUESTION]);
    expect(turn?.escalate).toBe(false);
  });

  it('un modelo concreto deriva sin decir el precio', () => {
    const turn = scriptedTurn('no, no vi busco el 5600ge', later);
    expect(turn?.bubbles).toEqual([AVAILABILITY_REPLY]);
    expect(turn?.escalate).toBe(true);
  });

  it('formas de pago y el efectivo no mezclan descuento con recargo', () => {
    expect(scriptedTurn('formas de pago?', later)?.bubbles).toEqual([PAYMENT_LIST]);
    expect(scriptedTurn('En efectivo tengo descuento?', later)?.bubbles).toEqual([CASH_PRICE_REPLY]);
    const payment = casualText(PAYMENT_LIST);
    expect(payment).toContain('• Efectivo');
    expect(payment).toContain('precio del lista');
    expect(payment).not.toMatch(/\$\s?\d/);
    expect(casualText(CASH_PRICE_REPLY)).toBe(CASH_PRICE_REPLY);
  });

  it('un pedido o un reclamo pide el nombre y deriva', () => {
    expect(scriptedTurn('ya esta lista mi pc?', later)?.bubbles).toEqual([ORDER_STATUS_REPLY]);
    expect(scriptedTurn('ya esta lista mi pc?', later)?.escalate).toBe(true);
    const complaint = scriptedTurn('les compre una pc hace un mes y no me anda', later);
    expect(complaint?.bubbles).toEqual([COMPLAINT_REPLY]);
    expect(complaint?.escalate).toBe(true);
  });

  it('arma la PC sin precio y pide el presupuesto si solo quiere la PC', () => {
    expect(scriptedTurn('Busco una Pc completa', later)?.bubbles).toEqual([PC_USE_QUESTION]);
    expect(scriptedTurn('para juegos', later)?.bubbles).toEqual([GAMES_QUESTION]);
    const quote = scriptedTurn('No, busco solo la Pc', later);
    expect(quote?.bubbles).toEqual([QUOTE_REPLY]);
    expect(quote?.createRequest).toBe(true);
    expect(quote?.escalate).toBe(false);
  });

  it('el teclado sin marca manda el link de Aula y el dale manda el local', () => {
    const shown = scriptedTurn('No, mostrame', {alreadyGreeted: true, recentText: 'Teclado Gamer'});
    expect(shown?.bubbles[1]).toBe(AULA_LINK);
    const visit = scriptedTurn('Dale', {alreadyGreeted: true, recentText: 'Comentame cual te gusta mas!'});
    expect(visit?.bubbles).toEqual([STORE_REPLY]);
    expect(scriptedTurn('Dale', later)).toBeNull();
  });

  it('con los juegos explica sin precio y con los programas pide el armado', () => {
    const games = scriptedTurn('fortnite, csgo, warzone y rdr2', {alreadyGreeted: true, recentText: GAMES_QUESTION});
    expect(games?.bubbles).toEqual([GAMES_EXPLAIN, PERIPHERALS_QUESTION]);
    expect(games?.escalate).toBe(false);
    const programs = scriptedTurn('photoshop e illustrator', {alreadyGreeted: true, recentText: 'Cuales programas de diseño y juegos'});
    expect(programs?.bubbles).toEqual([DESIGN_3D_QUESTION]);
    const ready = scriptedTurn('si, illustrator', {alreadyGreeted: true, recentText: DESIGN_3D_QUESTION});
    expect(ready?.bubbles).toEqual([FLUENCY_REPLY]);
    expect(ready?.createRequest).toBe(true);
  });
});
