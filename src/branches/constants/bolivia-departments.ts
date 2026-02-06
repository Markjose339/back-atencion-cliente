export const BOLIVIA_DEPARTMENTS = [
  'La Paz',
  'Cochabamba',
  'Santa Cruz',
  'Oruro',
  'Potosí',
  'Chuquisaca',
  'Tarija',
  'Beni',
  'Pando',
] as const;

export type BoliviaDepartment = (typeof BOLIVIA_DEPARTMENTS)[number];
