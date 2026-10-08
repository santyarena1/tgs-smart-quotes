import {describe, expect, it} from 'vitest';
import {BARE_HELLO_BUBBLES} from '@tgs/contracts';
import {bareHelloReply} from './chatbot-core.js';

describe('saludo solo hola', () => {
  it('contesta con las dos burbujas fijas', () => {
    expect(bareHelloReply('hola')).toEqual([...BARE_HELLO_BUBBLES]);
    expect(bareHelloReply('  ¡Hola!  ')).toEqual([...BARE_HELLO_BUBBLES]);
    expect(bareHelloReply('HOLA')).toEqual([...BARE_HELLO_BUBBLES]);
  });

  it('no se activa si el mensaje dice algo más', () => {
    expect(bareHelloReply('hola, quiero una pc')).toBeNull();
    expect(bareHelloReply('hola buenas')).toBeNull();
    expect(bareHelloReply('buenas')).toBeNull();
    expect(bareHelloReply('')).toBeNull();
  });
});
