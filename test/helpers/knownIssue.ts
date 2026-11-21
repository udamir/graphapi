/**
 * Known-issue tests are declared with `itFails` (a stricter `it.fails` that also reports the error message).
 * The test passes while `fn` throws (the implementation still violates the expectation)
 * and fails once `fn` stops throwing, which signals that the issue was fixed and the
 * test should be turned back into a regular `it`.
 */
export const itFails = (name: string, fn: () => unknown | Promise<unknown>): void => {
  it(`[known issue] ${name}`, async () => {
    let failed = false
    let message = ""
    try {
      await fn()
    } catch (e: any) {
      failed = true
      message = e?.message ?? String(e)
    }
    if (!failed) {
      throw new Error(`Known issue appears to be fixed: "${name}" no longer fails. Convert it into a regular test.`)
    }
    expect(typeof message).toBe("string")
  })
}
