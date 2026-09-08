import {describe, expect, it} from 'vitest';
import {createHmac} from 'node:crypto';
import {countTemplateVariables} from './whatsapp-client.js';
import {chatKeyFromWaId, matchesConfiguredAutoMessage} from './whatsapp-inbound.js';
import {describeWindow, windowFromInbound, windowState, WINDOW_MS} from './whatsapp-window.js';
import {randomDelaySeconds} from './whatsapp-outbound.js';

describe('ventana de 24 h', () => {
  it('queda abierta apenas llega un entrante', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const expires = windowFromInbound(now);
    expect(expires?.getTime()).toBe(now.getTime() + WINDOW_MS);
    expect(windowState(expires, now).open).toBe(true);
  });

  it('se cierra pasadas las 24 h', () => {
    const inbound = new Date('2026-09-07T12:00:00Z');
    const expires = windowFromInbound(inbound);
    const after = new Date(inbound.getTime() + WINDOW_MS + 1000);
    const state = windowState(expires, after);
    expect(state.open).toBe(false);
    expect(state.remainingMs).toBe(0);
    expect(describeWindow(state)).toContain('plantilla aprobada');
  });

  it('sin entrantes no hay ventana: solo se puede iniciar con plantilla', () => {
    const state = windowState(null);
    expect(state.open).toBe(false);
    expect(describeWindow(state)).toContain('todavía no escribió');
  });

  it('el borde exacto de las 24 h ya cuenta como cerrada', () => {
    const inbound = new Date('2026-09-07T12:00:00Z');
    const expires = windowFromInbound(inbound)!;
    expect(windowState(expires, expires).open).toBe(false);
  });
});

describe('identidad de conversación', () => {
  it('normaliza el wa_id argentino con 9 al formato canónico', () => {
    expect(chatKeyFromWaId('5493416123456')).toBe('tel:543416123456');
  });

  it('acepta el wa_id sin el 9', () => {
    expect(chatKeyFromWaId('543416123456')).toBe('tel:543416123456');
  });

  it('descarta un identificador que no es un teléfono argentino válido', () => {
    expect(chatKeyFromWaId('123')).toBeNull();
    expect(chatKeyFromWaId(undefined)).toBeNull();
  });
});

describe('filtro de mensajes automáticos', () => {
  const patterns = ['¡Hola! ¿Cómo podemos ayudarte'];

  it('reconoce el saludo automático configurado', () => {
    expect(matchesConfiguredAutoMessage('¡Hola! ¿Cómo podemos ayudarte?', patterns)).toBe(true);
  });

  it('tolera variantes de acentos y puntuación', () => {
    expect(matchesConfiguredAutoMessage('hola como podemos ayudarte', patterns)).toBe(true);
  });

  it('no marca un mensaje real del cliente', () => {
    expect(matchesConfiguredAutoMessage('Hola, quería consultar por una placa de video', patterns)).toBe(false);
  });

  it('ignora patrones demasiado cortos para ser confiables', () => {
    expect(matchesConfiguredAutoMessage('hola', ['ho'])).toBe(false);
  });
});

describe('plantillas', () => {
  it('cuenta las variables distintas del cuerpo', () => {
    expect(countTemplateVariables('Hola {{1}}, te escribo por {{2}}.')).toBe(2);
  });

  it('no cuenta dos veces el mismo placeholder', () => {
    expect(countTemplateVariables('{{1}} y de nuevo {{1}}')).toBe(1);
  });

  it('un cuerpo sin variables da cero', () => {
    expect(countTemplateVariables('Gracias por escribirnos.')).toBe(0);
  });
});

describe('demoras entre burbujas', () => {
  it('respeta el rango configurado', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = randomDelaySeconds(2, 6);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('acota valores fuera de rango en vez de confiar en la configuración', () => {
    const value = randomDelaySeconds(-10, 999);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(60);
  });
});

describe('firma del webhook', () => {
  // Réplica exacta de la verificación del controller, para fijar el criterio.
  const verify = (raw: Buffer, signature: string, secret: string) => {
    if (!signature.startsWith('sha256=')) return false;
    const received = Buffer.from(signature.slice(7), 'hex');
    const expected = createHmac('sha256', secret).update(raw).digest();
    return received.length === expected.length && received.equals(expected);
  };

  it('acepta una firma legítima', () => {
    const raw = Buffer.from(JSON.stringify({entry: []}));
    const secret = 'app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verify(raw, signature, secret)).toBe(true);
  });

  it('rechaza un cuerpo alterado', () => {
    const raw = Buffer.from(JSON.stringify({entry: []}));
    const secret = 'app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verify(Buffer.from(JSON.stringify({entry: [{hackeado: true}]})), signature, secret)).toBe(false);
  });

  it('rechaza una firma sin el prefijo esperado', () => {
    const raw = Buffer.from('{}');
    expect(verify(raw, createHmac('sha256', 's').update(raw).digest('hex'), 's')).toBe(false);
  });
});
