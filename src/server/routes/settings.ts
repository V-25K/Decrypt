import { Hono } from 'hono';
import type {
  SettingsValidationRequest,
  SettingsValidationResponse,
} from '@devvit/web/shared';
import type { Context } from 'hono';
import { NumericRangeSettingValidator } from './settings.validators';

export const settingsRoutes = new Hono();

const publishHourValidator = new NumericRangeSettingValidator({
  name: 'Publish hour',
  min: 0,
  max: 23,
});
const logicalPercentValidator = new NumericRangeSettingValidator({
  name: 'Logical percent',
  min: 0,
  max: 100,
});
const aiRetriesValidator = new NumericRangeSettingValidator({
  name: 'AI retries',
  min: 1,
  max: 5,
});

const validateNumericSetting = async (
  c: Context,
  validator: NumericRangeSettingValidator
) => {
  const body = await c.req.json<SettingsValidationRequest<number>>();
  return c.json<SettingsValidationResponse>(validator.validate(body.value), 200);
};

settingsRoutes.post('/validate-publish-hour', async (c) => {
  return validateNumericSetting(c, publishHourValidator);
});

settingsRoutes.post('/validate-logical-percent', async (c) => {
  return validateNumericSetting(c, logicalPercentValidator);
});

settingsRoutes.post('/validate-ai-retries', async (c) => {
  return validateNumericSetting(c, aiRetriesValidator);
});
