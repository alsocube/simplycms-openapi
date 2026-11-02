import { type FormEvent, useState } from 'react'
import { login } from './auth'

type LoginPageProps = {
  onNavigate: (path: string) => void
}

function LoginPage({ onNavigate }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await login({ identifier, password, rememberMe })
      onNavigate('/')
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'An unexpected error occurred while logging in.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page-shell login-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="SimplyCMS home">
          <span className="brand-mark" aria-hidden="true">
            s
          </span>
          <span>simplycms</span>
        </a>
        <button className="header-link" onClick={() => onNavigate('/')} type="button">
          Back to gallery
        </button>
      </header>

      <section className="login-section" aria-labelledby="login-title">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-title">Log in</h1>
          <p className="login-description">
            Sign in to continue to your SimplyCMS account.
          </p>
          <form className="login-form" onSubmit={submitLogin}>
            <label className="form-field" htmlFor="login-identifier">
              <span>Email or username</span>
              <input
                autoComplete="username"
                disabled={isSubmitting}
                id="login-identifier"
                onChange={(event) => setIdentifier(event.currentTarget.value)}
                required
                value={identifier}
              />
            </label>
            <label className="form-field" htmlFor="login-password">
              <span>Password</span>
              <input
                autoComplete="current-password"
                disabled={isSubmitting}
                id="login-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="remember-field">
              <input
                checked={rememberMe}
                disabled={isSubmitting}
                onChange={(event) => setRememberMe(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Remember me</span>
            </label>
            {error && (
              <p className="upload-feedback upload-error" role="alert">
                {error}
              </p>
            )}
            <button className="submit-login" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      </section>

      <footer className="site-footer">
        <span>Made for things worth keeping.</span>
        <span>SimplyCMS</span>
      </footer>
    </main>
  )
}

export default LoginPage
