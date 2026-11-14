/**
 * Turns a failed API response into an Error carrying the backend's own message, so the UI can show it as-is.
 * The Lambdas reply `{ error, details }` (400, 403, 404, 409); API Gateway itself replies `{ message }`
 * (for example 401 "Unauthorized" when the sign-in token is missing or expired).
 */
export async function apiError(res: Response): Promise<Error> {
  const text = await res.text()
  let message = text
  try {
    const body = JSON.parse(text) as { error?: string; message?: string }
    message = body.error ?? body.message ?? text
  } catch { /* plain-text body */ }
  return new Error(message || `${res.status} ${res.statusText}`)
}
