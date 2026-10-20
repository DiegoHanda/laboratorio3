import { describe, it, expect } from 'vitest';
import { horaLabel, hoyISO, rangoLibre } from './format.js';

const franjas = [
  { hora: 8, libre: true },
  { hora: 9, libre: true },
  { hora: 10, libre: false },
  { hora: 11, libre: true },
];

describe('format', () => {
  it('formatea horas con dos dígitos', () => {
    expect(horaLabel(8)).toBe('08:00');
    expect(horaLabel(14)).toBe('14:00');
  });

  it('formatea la fecha local como YYYY-MM-DD', () => {
    expect(hoyISO(new Date(2026, 9, 5))).toBe('2026-10-05');
  });

  it('detecta rangos libres y rangos con una franja ocupada', () => {
    expect(rangoLibre(franjas, 8, 10)).toBe(true);
    expect(rangoLibre(franjas, 9, 12)).toBe(false);
    expect(rangoLibre(franjas, 11, 12)).toBe(true);
  });

  it('rechaza rangos que se salen de las franjas existentes', () => {
    expect(rangoLibre(franjas, 11, 14)).toBe(false);
  });
});
