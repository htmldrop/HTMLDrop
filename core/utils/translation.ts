import en_US from '../translations/en_US.mjs'
import nb_NO from '../translations/nb_NO.mjs'

type TranslationStrings = Record<string, string>
type TranslationsMap = Record<string, TranslationStrings>

const translations: TranslationsMap = { en_US, nb_NO }

/**
 * Translate a string based on locale
 * Falls back to the original string if no translation is found
 */
export default function translate(str: string, locale: string): string {
  if (typeof translations?.[locale]?.[str] !== 'undefined') {
    return translations[locale][str]
  }
  return str
}
