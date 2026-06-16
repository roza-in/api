import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export interface DayHours {
  open: string; // "HH:mm" 24h format
  close: string; // "HH:mm" 24h format
}

export interface WorkingHoursMap {
  [key: string]: DayHours | null;
  monday: DayHours | null;
  tuesday: DayHours | null;
  wednesday: DayHours | null;
  thursday: DayHours | null;
  friday: DayHours | null;
  saturday: DayHours | null;
  sunday: DayHours | null;
}

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

@ValidatorConstraint({ name: 'isValidWorkingHours', async: false })
export class IsValidWorkingHoursConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const hours = value as Record<string, unknown>;

    for (const day of DAYS_OF_WEEK) {
      if (!(day in hours)) {
        return false;
      }

      const dayValue = hours[day];

      // null means closed — valid
      if (dayValue === null) {
        continue;
      }

      if (typeof dayValue !== 'object') {
        return false;
      }

      const dayHours = dayValue as Record<string, unknown>;

      if (
        typeof dayHours.open !== 'string' ||
        typeof dayHours.close !== 'string'
      ) {
        return false;
      }

      if (!TIME_REGEX.test(dayHours.open) || !TIME_REGEX.test(dayHours.close)) {
        return false;
      }

      // open must be before close
      if (dayHours.open >= dayHours.close) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'workingHours must be an object with keys monday–sunday, each being { open: "HH:mm", close: "HH:mm" } or null for closed days';
  }
}

export function IsValidWorkingHours(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidWorkingHoursConstraint,
    });
  };
}

export const DEFAULT_WORKING_HOURS: WorkingHoursMap = {
  monday: { open: '10:00', close: '20:00' },
  tuesday: { open: '10:00', close: '20:00' },
  wednesday: { open: '10:00', close: '20:00' },
  thursday: { open: '10:00', close: '20:00' },
  friday: { open: '10:00', close: '20:00' },
  saturday: { open: '10:00', close: '20:00' },
  sunday: null,
};
