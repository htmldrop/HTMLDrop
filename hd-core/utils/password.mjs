import bcrypt from 'bcrypt'

export const hash = async (password) => {
  const hash = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS, 12) || 12)
  return hash
}

export const verify = async (password, hash) => {
  const match = await bcrypt.compare(password, hash)
  return match
}

export const validate = (password) => {
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
