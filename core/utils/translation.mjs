import en_US from '../translations/en_US.mjs'
import nb_NO from '../translations/nb_NO.mjs'

const translations = { en_US, nb_NO }

export default (str, locale) => {
  if (typeof translations?.[locale]?.[str] !== 'undefined') {
    return translations[locale][str]
  }
  return str
}
