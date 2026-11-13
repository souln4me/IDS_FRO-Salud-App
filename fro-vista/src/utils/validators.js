/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común, usado por CU01, CU02 y CU05.
 */
// CU01, CU02, CU05 — validar el dígito verificador del RUT
export const validateRut = (fullRut) => {
  if (!fullRut || typeof fullRut !== 'string') return false;
  const cleanRut = fullRut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 8) return false;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expectedResult = 11 - (sum % 11);
  let expectedDv;
  if (expectedResult === 11) expectedDv = '0';
  else if (expectedResult === 10) expectedDv = 'K';
  else expectedDv = expectedResult.toString();
  return dv === expectedDv;
};