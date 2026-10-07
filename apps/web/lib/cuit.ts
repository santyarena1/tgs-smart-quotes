/** Solo los dígitos de un CUIT/CUIL (acepta guiones y espacios). Misma lógica que @tgs/contracts. */
export const normalizeCuit = (value: string): string => value.replace(/\D/g, "");

/** CUIT/CUIL argentino válido: 11 dígitos y dígito verificador correcto (módulo 11). */
export function isValidCuit(value: string): boolean {
  const digits = normalizeCuit(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const remainder = 11 - (sum % 11);
  const check = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return check === Number(digits[10]);
}
