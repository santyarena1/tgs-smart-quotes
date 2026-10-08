/**
 * Categoría de un producto para la memoria de IVA. Las categorías de los distribuidores son muy generales
 * ("Componentes PC", "Hardware"), así que primero se reconoce el tipo de producto por el nombre
 * (mother, procesador, placa de video…) y solo si no se reconoce se usa la categoría del distribuidor.
 */
export type IvaCategory = { key: string; label: string };

const RULES: Array<[RegExp, IvaCategory]> = [
  [/\b(motherboard|mother|mainboard|placa madre)\b/, { key: 'mother', label: 'Motherboards' }],
  [/\b(procesador|cpu|ryzen|athlon|pentium|celeron|core i[3579]|core ultra|xeon)\b/, { key: 'procesador', label: 'Procesadores' }],
  [/\b(placa de video|gpu|geforce|radeon|rtx|gtx|arc a\d+)\b/, { key: 'placa-de-video', label: 'Placas de video' }],
  [/\b(memoria ram|ram|ddr[2345]|sodimm|udimm)\b/, { key: 'memoria-ram', label: 'Memorias RAM' }],
  [/\b(ssd|nvme|m\.?2|disco|hdd|almacenamiento)\b/, { key: 'almacenamiento', label: 'Discos y SSD' }],
  [/\b(fuente|psu)\b/, { key: 'fuente', label: 'Fuentes' }],
  [/\b(gabinete|case|chasis)\b/, { key: 'gabinete', label: 'Gabinetes' }],
  [/\b(cooler|refrigeracion|water cooling|watercooling|disipador|ventilador|fan)\b/, { key: 'refrigeracion', label: 'Refrigeración' }],
  [/\b(monitor|pantalla)\b/, { key: 'monitor', label: 'Monitores' }],
  [/\b(notebook|laptop|netbook)\b/, { key: 'notebook', label: 'Notebooks' }],
  [/\b(teclado|mouse|auricular|auriculares|headset|parlante|webcam|joystick|gamepad|mousepad|microfono)\b/, { key: 'perifericos', label: 'Periféricos' }],
  [/\b(router|switch|access point|placa de red|wifi|adaptador)\b/, { key: 'redes', label: 'Redes' }],
  [/\b(impresora|cartucho|toner)\b/, { key: 'impresion', label: 'Impresión' }],
];

export function normalizeForCategory(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Categoría por nombre; si no se reconoce, la categoría del distribuidor (si hay); si no, null. */
export function categoryFor(name: string, nodoCategory?: string | null): IvaCategory | null {
  const text = normalizeForCategory(name);
  for (const [pattern, category] of RULES) if (pattern.test(text)) return category;
  const fallback = nodoCategory ? normalizeForCategory(nodoCategory) : '';
  return fallback ? { key: `nodo:${fallback}`, label: nodoCategory!.trim() } : null;
}
