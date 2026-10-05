import {describe, expect, it} from 'vitest';
import {replyViolations} from './chatbot-core.js';

const bannedWords = ['querido', 'papa', 'te gustaria que'];

describe('revisión de la respuesta del bot', () => {
  it('frena una PC más cara que el presupuesto y una frase prohibida', () => {
    const problems = replyViolations(
      ['Una opcion buena seria una PC con Ryzen 5 5500', 'Sale $1.056.900', 'Te gustaría que te pase dos opciones?'],
      {bannedWords, budgetCents: 65_000_000, customerMessage: 'uh es mucho'},
    );
    expect(problems).toHaveLength(2);
  });

  it('deja pasar lo que entra en el presupuesto', () => {
    expect(replyViolations(['Dale! Esta sale $640.000', 'Te la separo?'], {bannedWords, budgetCents: 65_000_000, customerMessage: 'ok'})).toEqual([]);
  });

  it('si pide algo mejor, puede ofrecer algo más caro', () => {
    expect(replyViolations(['La mas potente sale $1.400.000'], {bannedWords, budgetCents: 65_000_000, customerMessage: 'quiero algo más potente'})).toEqual([]);
  });

  it('"para tu papá" no cuenta como apodo prohibido solo si no es la palabra suelta', () => {
    expect(replyViolations(['Dale querido!'], {bannedWords, budgetCents: null, customerMessage: 'hola'})).toHaveLength(1);
  });
});
