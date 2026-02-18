import type { TransformFnParams } from 'class-transformer';

const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'si']);
const FALSY_VALUES = new Set(['false', '0', 'no']);

export const toOptionalBoolean = ({
  value,
}: TransformFnParams): boolean | undefined | string => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;
  return String(value);
};

export const toOptionalNumber = ({
  value,
}: TransformFnParams): number | undefined | string => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') return value;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? String(value) : parsed;
};

export const toOptionalDateOrNull = ({
  value,
}: TransformFnParams): Date | null | undefined | string => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  if (value instanceof Date) return value;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed;
};
