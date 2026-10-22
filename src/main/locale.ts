/**
 * Turns what `app.getSystemLocale()` returns into a BCP 47 tag `Intl` accepts. On macOS it can be
 * an ICU id like `en-US@currency=eur;rg=nlzzzz`: English, with the Netherlands chosen as the
 * region format. That becomes `en-NL`, which CLDR formats the English way (`£46,982.37`);
 * a Dutch-language system (`nl-NL`) gets `£ 46.982,37`.
 */
export function formattingLocale(raw: string | null | undefined, fallback = 'en-GB'): string {
  if (!raw) return fallback
  const [base, keywords = ''] = raw.replace(/_/g, '-').split('@')
  const region = /(?:^|;)rg=([a-z]{2})/i.exec(keywords)?.[1]
  const language = base.split('-')[0]
  const candidate = region ? `${language}-${region.toUpperCase()}` : base
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? fallback
  } catch {
    return fallback
  }
}
