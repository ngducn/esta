/** The zod-free half of the property model, for client forms: vocabularies, kind fields and the code suggestion. */
export * from './kinds';
export { PROPERTY_CODE_MAX_LENGTH, suggestPropertyCode } from './code';
export { KIND_FIELDS, kindDetailsText, readKindDetails, vndInputText, type KindField, type KindFieldInput, type KindFieldTexts } from './form-fields';
