import { describe, expect, it } from 'vitest'
import { formattingLocale } from './locale'

describe('formattingLocale', () => {
  it('keeps a plain BCP 47 tag', () => {
    expect(formattingLocale('en-GB')).toBe('en-GB')
    expect(formattingLocale('nl-NL')).toBe('nl-NL')
  })

  it('uses the macOS region format over the language region', () => {
    expect(formattingLocale('en-US@currency=eur;rg=nlzzzz')).toBe('en-NL')
    expect(formattingLocale('de_DE@rg=chzzzz')).toBe('de-CH')
  })

  it('drops ICU keywords it has no use for', () => {
    expect(formattingLocale('fr_FR@calendar=gregorian')).toBe('fr-FR')
  })

  it('falls back when there is nothing usable', () => {
    expect(formattingLocale('')).toBe('en-GB')
    expect(formattingLocale(null)).toBe('en-GB')
    expect(formattingLocale('!!')).toBe('en-GB')
  })

  it('formats money the way the locale expects', () => {
    const gbp = (locale: string): string =>
      new Intl.NumberFormat(formattingLocale(locale), {
        style: 'currency',
        currency: 'GBP'
      }).format(46982.37)
    expect(gbp('nl_NL')).toMatch(/46\.982,37/)
    expect(gbp('en-GB')).toBe('£46,982.37')
  })
})
