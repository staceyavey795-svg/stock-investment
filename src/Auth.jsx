import { useState } from 'react'
import { supabase } from './supabaseClient.js'

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const isSignUp = mode === 'signup'

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setErrorMessage('')
  }

  const submitAuth = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (isSignUp) {
        if (!data.user) throw new Error('Your account was created, but its profile could not be saved.')

        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, full_name: fullName, username })

        if (profileError) throw profileError
      }

      onLogin(data.user)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <p className="eyebrow">STOCK INVESTMENT</p>
        <h2 id="auth-heading">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>

        <div className="auth-mode-toggle" aria-label="Authentication mode">
          <button
            type="button"
            className={isSignUp ? 'auth-mode-button' : 'auth-mode-button active'}
            aria-pressed={!isSignUp}
            onClick={() => changeMode('login')}
            disabled={isLoading}
          >
            Log In
          </button>
          <button
            type="button"
            className={isSignUp ? 'auth-mode-button active' : 'auth-mode-button'}
            aria-pressed={isSignUp}
            onClick={() => changeMode('signup')}
            disabled={isLoading}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={submitAuth}>
          {isSignUp && (
            <>
              <label htmlFor="auth-full-name">Full Name</label>
              <input
                id="auth-full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                disabled={isLoading}
              />

              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                disabled={isLoading}
              />
            </>
          )}

          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isLoading}
          />

          <label htmlFor="auth-password">Password</label>
          <div className="auth-password-field">
            <input
              id="auth-password"
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={isLoading}
            />
            <button
              type="button"
              className="auth-password-toggle"
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              aria-pressed={isPasswordVisible}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              disabled={isLoading}
            >
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.5 4.5 9.5 7-.4 1-1.3 2.3-2.6 3.5M6.2 6.2C3.9 7.7 2.8 9.8 2.5 12c1 2.5 4.3 7 9.5 7 1.1 0 2.1-.2 3-.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2.5 12S5.8 5 12 5s9.5 7 9.5 7-3.3 7-9.5 7-9.5-7-9.5-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}

          <button
            type="submit"
            className="confirm-button auth-submit"
            disabled={isLoading || !email || !password || (isSignUp && (!fullName || !username))}
          >
            {isLoading ? (isSignUp ? 'Creating account...' : 'Logging in...') : (isSignUp ? 'Create account' : 'Log In')}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Auth