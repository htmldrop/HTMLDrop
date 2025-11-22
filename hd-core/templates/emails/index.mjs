import welcomeEmail from './welcome.mjs'
import passwordResetEmail from './password-reset.mjs'

export { welcomeEmail, passwordResetEmail }

export default {
  welcome: welcomeEmail,
  passwordReset: passwordResetEmail
}
