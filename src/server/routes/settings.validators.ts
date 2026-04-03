import type { SettingsValidationResponse } from '@devvit/web/shared';

type NumericRangeValidatorConfig = {
  max: number;
  min: number;
  name: string;
};

export class NumericRangeSettingValidator {
  readonly #max: number;
  readonly #min: number;
  readonly #name: string;

  public constructor(config: NumericRangeValidatorConfig) {
    this.#max = config.max;
    this.#min = config.min;
    this.#name = config.name;
  }

  public validate(value: number | undefined): SettingsValidationResponse {
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value < this.#min ||
      value > this.#max
    ) {
      return {
        success: false,
        error: `${this.#name} must be between ${this.#min} and ${this.#max}.`,
      };
    }

    return { success: true };
  }
}
