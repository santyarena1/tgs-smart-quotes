/**
 * Respuestas copiadas de las charlas de ejemplo. Salen tal cual, sin IA:
 * el precio de un producto no se dice, y stock, reclamo o pedido pasan a una persona.
 */

export type ScriptedTurn = {
  bubbles: string[];
  escalate: boolean;
  reason: string | null;
  createRequest: boolean;
};

const GREETING = 'Hola! Soy Fede de The Gamer Shop!';

export const PAYMENT_LIST = [
  'FORMAS DE PAGO',
  '• Efectivo (Precio del presupuesto)',
  '• Transferencia (Precio del presupuesto)',
  '• Dolares Cara grande (Precio del presupuesto convertido a dolares)',
  '• Tarjeta de Credito en cuotas (3 / 6 / 12 cuotas con interes)',
  '• Tarjeta de Credito BBVA (3 Cuotas sin interes del precio del lista)',
  '• Tarjeta de Debito (Se cobra un recargo)',
  '• Criptomoneda (Se cobra un recargo)',
].join('\n');

export const CASH_PRICE_REPLY = 'El precio que te paso es el de efectivo o transferencia. Con tarjeta de credito, debito o cripto tiene un recargo!';

export const AVAILABILITY_REPLY = 'Ya te digo si tengo disponibilidad!';

export const ORDER_STATUS_REPLY = 'Decime a nombre de quien esta su pedido asi verifico el estado!';

export const COMPLAINT_REPLY = 'Perfecto, decime a nombre de quien esta su Pc para que pueda ver su pedido';

export const PC_USE_QUESTION = 'Comentame, buscas una Pc para juegos, diseño, trabajo, estudio?';

export const GAMES_QUESTION = 'Perfecto, cuales juegos te gustaria jugar en tu Pc?';

export const PROGRAMS_QUESTION = 'Cuales programas de diseño y juegos le gustaria usar en tu Pc?';

export const WEB_QUESTION = 'Perfecto, viste alguno en nuestra web?';

export const WHICH_PRODUCT_QUESTION = 'Perfecto, cuales productos busca?';

export const BRAND_QUESTION = 'Perfecto! Viste alguna marca o modelo en especial!';

export const AULA_INTRO = 'Dale! Nosotros recomendamos mucho nuestra linea de productos Aula! Le dejo los teclados Aula disponible!';

export const AULA_LINK = 'https://thegamershop.com.ar/?s=teclado+aula&post_type=product';

export const WHICH_ONE = 'Comentame cual te gusta mas!';

export const STORE_REPLY = 'Cualquier cosa nos mandas un mensaje o podes venir a nuestro local! Estamos en Liniers, Av Lisandro de la Torre 373 - CABA - https://www.google.com/maps/place/The+Gamer+Shop/@-34.6431396,-58.5234052,17z';

export const QUOTE_REPLY = 'Perfecto, ya te paso presupuesto';

export const GAMES_EXPLAIN = 'Los juegos livianos, como CS o Valorant, te andan con la grafica integrada. Los pesados, como Red Dead, necesitan una placa de video dedicada';

export const PERIPHERALS_QUESTION = 'Buscas tambien monitor, teclado, mouse, auriculares o parlantes?';

export const DESIGN_3D_QUESTION = 'Perfecto, alguno de los programas lo usas en 3D?';

export const FLUENCY_REPLY = 'Perfecto, ya te recomiendo una Pc para poder usar los programas que me mencionaste y mas con total fluides y profesionalismo!';

const PRODUCT_CATEGORIES = ['procesador', 'teclado', 'placa', 'monitor', 'mouse', 'auricular', 'auriculares', 'fuente', 'gabinete', 'memoria', 'disco', 'ssd', 'cooler', 'mother'];

function plain(value: string): string {
  return value
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function says(message: string, phrases: string[]): boolean {
  const text = ` ${plain(message)} `;
  return phrases.some((phrase) => text.includes(` ${phrase} `));
}

function exact(message: string, phrases: string[]): boolean {
  const text = plain(message);
  return phrases.includes(text);
}

/** Un modelo concreto ("5600ge", "3060"), no un juego corto como "cs2". */
function mentionsModel(message: string): boolean {
  return plain(message).split(' ').some((token) => {
    if (token.length < 4 || token.length > 14) return false;
    if (/^\d{4,5}[a-z]{0,3}$/.test(token)) return true;
    return /\d/.test(token) && /[a-z]/.test(token);
  });
}

function withGreeting(bubbles: string[], alreadyGreeted: boolean): string[] {
  if (alreadyGreeted || bubbles[0] === GREETING) return bubbles;
  return [GREETING, ...bubbles];
}

function handoff(bubbles: string[], reason: string, alreadyGreeted: boolean): ScriptedTurn {
  return {bubbles: withGreeting(bubbles, alreadyGreeted), escalate: true, reason, createRequest: false};
}

function answer(bubbles: string[], alreadyGreeted: boolean, createRequest = false): ScriptedTurn {
  return {bubbles: withGreeting(bubbles, alreadyGreeted), escalate: false, reason: null, createRequest};
}

export function scriptedTurn(
  message: string,
  context: {alreadyGreeted: boolean; recentText?: string; fromAd?: boolean},
): ScriptedTurn | null {
  const recent = plain(context.recentText ?? '');
  const greeted = context.alreadyGreeted;

  if (says(message, ['ya esta lista', 'esta lista mi', 'estado del pedido', 'estado de mi pedido', 'mi pedido', 'numero de pedido'])) {
    return handoff([ORDER_STATUS_REPLY], 'Pregunta por un pedido ya hecho: se pide el nombre y lo ve un vendedor.', greeted);
  }
  if (says(message, ['no me anda', 'no anda', 'no funciona', 'reclamo', 'les compre', 'le compre', 'compre una pc', 'ya la compre', 'me la vendieron', 'problema con mi pc'])) {
    return handoff([COMPLAINT_REPLY], 'Reclamo de una PC ya vendida: se pide el nombre y lo ve un vendedor.', greeted);
  }
  if (says(message, ['descuento en efectivo', 'en efectivo tengo', 'descuento por efectivo', 'precio en efectivo'])) {
    return answer([CASH_PRICE_REPLY], greeted);
  }
  if (says(message, ['formas de pago', 'medios de pago', 'como se paga', 'como pago', 'tienen cuotas', 'aceptan tarjeta', 'tarjeta de credito', 'tarjeta de debito', 'criptomoneda'])) {
    return answer([PAYMENT_LIST], greeted);
  }
  if (says(message, ['solo la pc', 'solo la computadora', 'solamente la pc'])) {
    return answer([QUOTE_REPLY], greeted, true);
  }
  if (!context.fromAd && exact(message, ['dale']) && recent.includes('cual te gusta mas')) {
    return answer([STORE_REPLY], greeted);
  }
  if (!context.fromAd && exact(message, ['bueno']) && (recent.includes('http') || recent.includes('disponible'))) {
    return answer([WHICH_ONE], greeted);
  }
  if (!context.fromAd && says(message, ['mostrame', 'no mostrame']) && recent.includes('teclado')) {
    return answer([AULA_INTRO, AULA_LINK], greeted);
  }
  if (says(message, ['disponibilidad', 'hay stock', 'tenes stock', 'tienen stock', 'queda stock', 'en stock']) || (mentionsModel(message) && says(message, ['busco', 'quiero', 'necesito', 'tenes', 'tienen', 'cuanto sale', 'que precio']))) {
    return handoff([AVAILABILITY_REPLY], 'Pide un modelo o la disponibilidad: lo confirma un vendedor, sin decir el precio.', greeted);
  }
  if (context.fromAd) return null;
  if (says(message, ['averiguar sobre productos', 'ver productos', 'sobre productos'])) {
    return answer([WHICH_PRODUCT_QUESTION], greeted);
  }
  if (exact(message, ['teclado gamer', 'teclado', 'un teclado', 'teclados'])) {
    return answer([BRAND_QUESTION], greeted);
  }
  if (says(message, PRODUCT_CATEGORIES) && says(message, ['busco', 'quiero', 'necesito', 'averiguar']) && !mentionsModel(message) && !says(message, ['pc', 'computadora'])) {
    return answer([WEB_QUESTION], greeted);
  }
  if (says(message, ['busco una pc', 'quiero una pc', 'necesito una pc', 'pc completa', 'una computadora']) && !says(message, ['juegos', 'jugar', 'diseno', 'trabajo', 'estudio'])) {
    return answer([PC_USE_QUESTION], greeted);
  }
  if (exact(message, ['para juegos', 'para jugar', 'juegos'])) {
    return answer([GAMES_QUESTION], greeted);
  }
  if (exact(message, ['para diseno', 'para diseno y juegos', 'diseno y juegos', 'para diseno y juego'])) {
    return answer([PROGRAMS_QUESTION], greeted);
  }
  if (recent.includes('usas en 3d') && !message.includes('?')) {
    return answer([FLUENCY_REPLY], greeted, true);
  }
  if (recent.includes('programas de diseno') && !message.includes('?')) {
    return answer([DESIGN_3D_QUESTION], greeted);
  }
  if (recent.includes('cuales juegos') && !message.includes('?')) {
    return answer([GAMES_EXPLAIN, PERIPHERALS_QUESTION], greeted);
  }
  return null;
}
