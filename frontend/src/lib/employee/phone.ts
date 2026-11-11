// Canadian / US phone numbers (the North American Numbering Plan): a 3-digit area code,
// a 3-digit exchange and a 4-digit line number, with an optional leading +1 country code.

const ALLOWED = /^[\d\s().+-]*$/

/** The 10 significant digits, with any leading country code 1 dropped. */
export function phoneDigits(input: string) {
  const digits = input.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** A specific message for what's wrong, or null when the number is valid. */
export function validatePhone(input: string): string | null {
  const value = input.trim()
  if (!value) return 'Enter a phone number.'
  if (!ALLOWED.test(value)) return 'Use digits only. Spaces, brackets, dashes and a leading + are fine.'
  if (value.includes('+') && !/^\+1\D*\d/.test(value)) return 'Only Canadian and US numbers (+1) are supported.'

  const all = value.replace(/\D/g, '')
  if (all.length > 11 || (all.length === 11 && !all.startsWith('1'))) return 'That has too many digits. A phone number has 10.'

  const d = phoneDigits(value)
  if (d.length < 10) return `A phone number has 10 digits. You've entered ${d.length}.`
  if (/^[01]/.test(d)) return "The area code can't start with 0 or 1."
  if (d[1] === '1' && d[2] === '1') return `${d.slice(0, 3)} is a service number, not an area code.`
  if (/^[01]/.test(d.slice(3))) return "The 3 digits after the area code can't start with 0 or 1."
  if (/^(\d)\1{9}$/.test(d)) return "That doesn't look like a real phone number."
  return null
}

/** (604) 555-0142, for showing a valid number. */
export const formatPhone = (input: string) => {
  const d = phoneDigits(input)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : input
}

/** +16045550142 (E.164), the format sent to and stored by the backend. Cognito's phone_number uses it too. */
export const toStoredPhone = (input: string) => `+1${phoneDigits(input)}`
