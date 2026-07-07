import { test, expect } from '@playwright/test'

test.describe('Example Tests', () => {
  test('should verify simple arithmetic', () => {
    const sum = 1 + 1
    expect(sum).toBe(2)
  })
})
