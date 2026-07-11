export interface LegalOperator {
  name: string
  country: string
  email: string
  registerEntry: string
  vatId: string
  hostingProvider: string
  hostingLocation: string
}

function publicValue(value: string | undefined) {
  return value?.trim() ?? ''
}

export const legalOperator: LegalOperator = {
  name: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_NAME),
  country: publicValue(import.meta.env.VITE_LEGAL_COUNTRY),
  email: publicValue(import.meta.env.VITE_LEGAL_EMAIL),
  registerEntry: publicValue(import.meta.env.VITE_LEGAL_REGISTER_ENTRY),
  vatId: publicValue(import.meta.env.VITE_LEGAL_VAT_ID),
  hostingProvider: publicValue(import.meta.env.VITE_LEGAL_HOSTING_PROVIDER),
  hostingLocation: publicValue(import.meta.env.VITE_LEGAL_HOSTING_LOCATION),
}

export const missingLegalOperatorFields = [
  ['operator name', legalOperator.name],
  ['country', legalOperator.country],
  ['email', legalOperator.email],
]
  .filter(([, value]) => !value)
  .map(([label]) => label)

export const hasCompleteLegalOperator = missingLegalOperatorFields.length === 0

export const missingPrivacyConfigurationFields = [
  ...missingLegalOperatorFields,
  ...[
    ['hosting provider', legalOperator.hostingProvider],
    ['hosting location', legalOperator.hostingLocation],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label),
]

export const hasCompletePrivacyConfiguration = missingPrivacyConfigurationFields.length === 0
