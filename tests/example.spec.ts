import { test, expect } from '@playwright/test'

test.describe('Example API Tests', () => {
  test('should verify simple arithmetic', async ({ request }) => {
    // In upcoming tests, we would make requests using the request context:
    // const response = await request.get('/some-endpoint');
    // expect(response.ok()).toBeTruthy();

    expect(request).toBeDefined()

    const sum = 1 + 1
    expect(sum).toBe(2)
  })
})
