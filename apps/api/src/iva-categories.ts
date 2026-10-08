/**
 * Mini motor que entiende qué producto es a partir de su nombre (el de NODO, la web o uno propio escrito a mano)
 * para sugerir el IVA que le corresponde según lo aprendido de su categoría. Es solo una sugerencia: el usuario
 * siempre puede cambiarla.
 *
 * Cada categoría tiene sinónimos y abreviaturas (MB, MOBO, MICRO, PROCES., GAB…). Gana la categoría cuya palabra
 * aparece primero en el nombre, porque el tipo de producto va al principio ("Auricular Gamer…", "GAB COOLER MASTER…").
 * Si el nombre no alcanza se prueba con la categoría que informa el distribuidor.
 */
export type IvaCategory = { key: string; label: string };

type Rule = IvaCategory & { pattern: RegExp };

/** Sin acentos, en minúscula y con espacios simples. */
export function normalizeForCategory(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const rule = (key: string, label: string, pattern: RegExp): Rule => ({ key, label, pattern });

export const CATEGORY_RULES: Rule[] = [
  rule('mother', 'Motherboards', /\b(motherboards?|mothers?|mainboards?|mobo|placas? madre|placas? base|m\/b)\b|(?<![\d.]\s?)\bmb\b/),
  rule('procesador', 'Procesadores', /\b(procesador(es)?|proces\.?|microprocesador(es)?|micros?(?!\s?(sd|usb|hdmi|atx|fono|ondas|switch|inversor))|cpu(?!\s?(cooler|fan))|ryzen|athlon|pentium|celeron|core i[3579]|core ultra|xeon|threadripper|epyc)\b/),
  rule('placa-de-video', 'Placas de video', /\b(placas? de video|placas? video|tarjetas? de video|tarjetas? graficas?|geforce|radeon|rtx|gtx|gpu|video card)\b/),
  rule('memoria-ram', 'Memorias RAM', /\b(memorias? ram|ram|ddr[2345]x?|sodimm|so-dimm|udimm|dimm)\b/),
  rule('pendrive-sd', 'Pendrives y tarjetas de memoria', /\b(pen ?drives?|flash drive|usb flash|tarjetas? de memoria|memorias? (sd|flash|usb)|micro ?sd[hx]?c?|sd[hx]c|cruzer)\b/),
  rule('almacenamiento', 'Discos y SSD', /\b(ssd|nvme|m\.2|discos?|hdd|hd externo|unidad de estado solido)\b/),
  rule('fuente', 'Fuentes de PC', /\b(fuentes?|psu)\b/),
  rule('gabinete', 'Gabinetes', /\b(gabinetes?|gab|chasis|pc case|computer case)\b/),
  rule('cooler-cpu', 'Coolers de CPU y water cooling', /\b(water ?cool(er|ing)?|liquid|masterliquid|aio|cpu cooler|cooler (de )?(cpu|procesador)|disipador(es)?|heatsink|pasta termica)\b/),
  rule('ventiladores', 'Ventiladores', /\b(fans?|ventiladores?|cooler(?! master))\b/),
  rule('monitor', 'Monitores', /\b(monitor(es)?|display|pantalla)\b/),
  rule('notebook', 'Notebooks', /\b(notebooks?|laptops?|netbooks?|portatil(es)?|chromebooks?|macbooks?)\b/),
  rule('celulares', 'Celulares y tablets', /\b(celulares?|smartphones?|iphone|tablets?|ipad)\b/),
  rule('pc-armada', 'PC de escritorio', /\b(pcs? (de escritorio|gamer|armada)|all in one|aio pc|mini ?pc|computadora)\b/),
  rule('teclado', 'Teclados', /\b(teclados?|keyboards?|tec\+mouse|combo (teclado|kit))\b/),
  rule('mousepad', 'Mouse pads', /\b(mouse ?pads?|pad mouse|alfombrilla)\b/),
  rule('mouse', 'Mouses', /\b(mouse|mice|raton(es)?)\b/),
  rule('auriculares', 'Auriculares', /\b(auricular(es)?|headsets?|headphones?|earbuds?|tws|manos libres|diademas?)\b/),
  rule('parlantes', 'Parlantes', /\b(parlantes?|altavoces?|speakers?|soundbars?|barras? de sonido)\b/),
  rule('microfono', 'Micrófonos', /\b(microfonos?|mics?)\b/),
  rule('webcam', 'Webcams', /\b(webcams?|camaras? web)\b/),
  rule('gamepad', 'Joysticks y volantes', /\b(gamepads?|joysticks?|volantes?|controles? (gamer|inalambrico)|mandos?)\b/),
  rule('camaras-seguridad', 'Cámaras y videovigilancia', /\b(camaras?|dvr|nvr|videovigilancia|domos?|timbres? (con )?video|ezviz|hilook|hikvision|dahua)\b/),
  rule('impresoras', 'Impresoras', /\b(impresoras?|multifuncion(es)?|mfl?|plotters?)\b/),
  rule('scanners', 'Scanners', /\b(scanners?|escaner(es)?)\b/),
  rule('cartuchos-tinta', 'Cartuchos de tinta', /\b(cartuchos?|cartridges?|ink)\b/),
  rule('toner-insumos', 'Tóner, botellas de tinta y cintas', /\b(toner(es)?|tintas?|drum|botellas?|cintas?)\b/),
  rule('ups', 'UPS y estabilizadores', /\b(ups|estabilizador(es)?|reguladores? de tension|zapatillas?|power ?banks?|cargadores?)\b/),
  rule('redes', 'Redes', /\b(routers?|switch(es)?|access ?points?|ap|placas? de red|tarjetas? de red|adaptador(es)? (de red|wifi|wireless|bluetooth|usb wifi)|repetidor(es)?|extensor(es)?|mesh|modems?|firewall|powerline|patch ?cords?|utp|cat ?[56]e?|poe|sfp|rj45)\b/),
  rule('cables', 'Cables y adaptadores', /\b(cables?|adaptador(es)?|conversor(es)?|hubs?|splitters?|hdmi|displayport|extension(es)?)\b/),
  rule('servidores', 'Servidores', /\b(servidor(es)?|servers?|srv|racks?|poweredge|proliant|hpe)\b/),
  rule('proyectores', 'Proyectores', /\b(proyector(es)?|pantallas? de proyeccion)\b/),
  rule('sillas', 'Sillas y escritorios', /\b(sillas?|sillones?|escritorios?)\b/),
  rule('bolsos', 'Mochilas y fundas', /\b(mochilas?|bolsos?|maletines?|fundas?)\b/),
  rule('herramientas', 'Herramientas', /\b(destornilladores?|linternas?|pinzas?|alicates?|llaves?|soldadores?|herramientas?|taladros?|canaletas?|crimpeadoras?|testers?)\b/),
];

/** Posición de la primera aparición de una categoría en un texto (menor = más al principio). */
function firstMatch(text: string): { index: number; rule: Rule } | null {
  let best: { index: number; rule: Rule } | null = null;
  for (const candidate of CATEGORY_RULES) {
    const found = candidate.pattern.exec(text);
    if (found && (best === null || found.index < best.index)) best = { index: found.index, rule: candidate };
  }
  return best;
}

/**
 * Categoría de un producto: primero por su nombre, después por la categoría que informa el distribuidor
 * (cuando el nombre no dice qué es, como una mother llamada "ASUS PRIME X670-P WIFI"), y si tampoco se reconoce
 * se usa la categoría del distribuidor tal cual. Null si no hay forma de saberlo.
 */
export function categoryFor(name: string, nodoCategory?: string | null): IvaCategory | null {
  const byName = firstMatch(normalizeForCategory(name));
  if (byName) return { key: byName.rule.key, label: byName.rule.label };
  const cat = nodoCategory ? normalizeForCategory(nodoCategory) : '';
  if (!cat) return null;
  const byCategory = firstMatch(cat);
  if (byCategory) return { key: byCategory.rule.key, label: byCategory.rule.label };
  return { key: `nodo:${cat}`, label: nodoCategory!.trim() };
}
