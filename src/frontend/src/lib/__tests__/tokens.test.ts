import { describe, it, expect } from 'vitest'
import { getToken, getThemeTokens, THEMES } from '../tokens'

describe('Design Tokens', () => {
  it('exports THEMES array with 3 themes', () => {
    expect(THEMES).toHaveLength(3)
    expect(THEMES).toContain('liquid-glass')
    expect(THEMES).toContain('liquid-glass-dark')
    expect(THEMES).toContain('midnight')
  })

  it('getToken returns a value for known tokens', () => {
    const bg = getToken('background')
    expect(bg).toBeDefined()
    expect(typeof bg).toBe('string')
  })

  it('getToken returns undefined for unknown tokens', () => {
    const unknown = getToken('nonexistent-token')
    expect(unknown).toBeUndefined()
  })

  it('getThemeTokens returns an object with color values', () => {
    const tokens = getThemeTokens('liquid-glass')
    expect(tokens).toBeDefined()
    expect(tokens.background).toBeDefined()
    expect(tokens.foreground).toBeDefined()
    expect(tokens.primary).toBeDefined()
  })

  it('getThemeTokens works for all 3 themes', () => {
    for (const theme of THEMES) {
      const tokens = getThemeTokens(theme)
      expect(tokens).toBeDefined()
      expect(tokens.background).toBeDefined()
    }
  })
})
