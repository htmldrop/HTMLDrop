import bcrypt from 'bcrypt'

export interface ValidationResult {
  valid: boolean
  message?: string
}

export const hash = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.SALT_ROUNDS || '12', 10)
  const hashed = await bcrypt.hash(password, saltRounds)
  return hashed
}

export const verify = async (password: string, hash: string): Promise<boolean> => {
  const match = await bcrypt.compare(password, hash)
  return match
}

export const validate = (password: string): ValidationResult => {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialChar = /[!@#$%^&*(),.?":;{}|<>]/.test(password)

  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long` }
  }
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' }
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' }
  }
  if (!hasNumber) {
    return { valid: false, message: 'Password must contain at least one number' }
  }
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' }
  }

  return { valid: true }
}
