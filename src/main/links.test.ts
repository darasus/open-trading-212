import { describe, expect, it } from 'vitest'
import { appLinkUrl, clickedLinkUrl } from './links'

describe('clickedLinkUrl', () => {
  it('opens any https link', () => {
    expect(clickedLinkUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
  })

  it('refuses every other scheme', () => {
    for (const url of [
      'http://example.com/',
      'file:///Applications/Calculator.app',
      'smb://attacker.net/share',
      'javascript:alert(1)',
      'x-custom-app://run',
      'not a url',
      42
    ]) {
      expect(clickedLinkUrl(url)).toBeNull()
    }
  })
})

describe('appLinkUrl', () => {
  it('opens the hosts the app links to', () => {
    expect(appLinkUrl('https://github.com/darasus/open-trading-212')).toBe(
      'https://github.com/darasus/open-trading-212'
    )
    expect(appLinkUrl('https://console.anthropic.com/settings/keys')).not.toBeNull()
  })

  it('refuses other hosts and schemes', () => {
    expect(appLinkUrl('https://example.com/')).toBeNull()
    expect(appLinkUrl('https://github.com.attacker.net/')).toBeNull()
    expect(appLinkUrl('http://github.com/')).toBeNull()
    expect(appLinkUrl('file:///etc/passwd')).toBeNull()
  })
})
