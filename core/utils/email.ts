export interface ValidationResult {
  valid: boolean
  message?: string
}

export const validate = (email: string | undefined | null): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!email) {
    return { valid: false, message: 'Email is required' }
  }
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Invalid email format' }
  }

  return { valid: true }
}
