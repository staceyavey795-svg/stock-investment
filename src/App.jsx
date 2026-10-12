import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './App.css'
import Avatar from './Avatar.jsx'
import CandlestickChart from './CandlestickChart.jsx'
import Portfolio from './Portfolio.jsx'
import Profile from './Profile.jsx'
import { supabase } from './supabaseClient.js'

const stocks = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: '$227.16', change: '+1.24%', positive: true },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: '$512.41', change: '+0.86%', positive: true },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: '$176.48', change: '+2.41%', positive: true },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: '$342.33', change: '-1.18%', positive: false },
  { symbol: 'USO', name: 'United States Oil Fund', price: '$79.40', change: '0.00%', positive: true },
  { symbol: 'DHI', name: 'D.R. Horton Inc.', price: '$152.30', change: '0.00%', positive: true },
  { symbol: 'LEN', name: 'Lennar Corp.', price: '$138.75', change: '0.00%', positive: true },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: '$178.20', change: '0.00%', positive: true },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: '$245.60', change: '0.00%', positive: true },
  { symbol: 'ASML', name: 'ASML Holding N.V.', price: '$812.40', change: '0.00%', positive: true },
  { symbol: 'SAP', name: 'SAP SE', price: '$246.10', change: '0.00%', positive: true },
  { symbol: 'NVO', name: 'Novo Nordisk A/S', price: '$68.90', change: '0.00%', positive: true },
  { symbol: 'JPH', name: 'JP Homes Inc.', price: '$64.75', change: '0.00%', positive: true },
]

const STORAGE_KEY = 'stock-investment-state'

function getInitialAuthUrlState() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const hasError = Boolean(
    query.get('error') || query.get('error_description') || query.get('error_code')
    || hash.get('error') || hash.get('error_description') || hash.get('error_code'),
  )

  return {
    isRecoveryMode: query.get('reset') === 'true' || hash.get('type') === 'recovery' || hasError,
    hasError,
  }
}

function PasswordVisibilityButton({ visible, onToggle, disabled }) {
  return (
    <button
      type="button"
      className="auth-password-toggle"
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
      onClick={onToggle}
      disabled={disabled}
    >
      {visible ? (
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
  )
}

function AuthScreens({ authView, setAuthView, setIsRecoveryMode, onLogin, onRecoveryComplete, serverError, onClearError }) {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const isSignUp = mode === 'signup'

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setErrorMessage('')
    onClearError()
  }

  const submitAuth = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    onClearError()

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

  const sendResetLink = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    setResetSent(false)
    onClearError()

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/?reset=true',
      })
      if (error) throw error
      setResetSent(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not send the reset link. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const updatePassword = async (event) => {
    event.preventDefault()
    setErrorMessage('')

    if (password.length < 8) {
      setErrorMessage('Your password must be at least 8 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        if (/password.*(weak|short|characters|length)|weak.*password/i.test(error.message)) {
          throw new Error('Your password is too weak. Choose a password with at least 8 characters.')
        }
        if (/expired|invalid|token|session/i.test(error.message)) {
          throw new Error('This password reset link has expired or is invalid. Request a new link and try again.')
        }
        throw error
      }
      onRecoveryComplete()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update your password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const returnToLogin = () => {
    setIsRecoveryMode(false)
    setAuthView('login')
    setErrorMessage('')
    setResetSent(false)
    onClearError()
  }

  const error = errorMessage || serverError

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <p className="eyebrow">STOCK INVESTMENT</p>

        {authView === 'reset' && (
          <>
            <h2 id="auth-heading">Reset your password</h2>
            <form className="auth-form" onSubmit={sendResetLink}>
              <label htmlFor="auth-reset-email">Email</label>
              <input
                id="auth-reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setResetSent(false) }}
                required
                disabled={isLoading}
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              {resetSent && <p className="auth-success" role="status">If an account exists for that email, a reset link has been sent</p>}
              <button type="submit" className="confirm-button auth-submit" disabled={isLoading || !email}>
                {isLoading ? 'Sending...' : 'Send reset link'}
              </button>
              <button type="button" className="auth-text-link" onClick={returnToLogin} disabled={isLoading}>Back to log in</button>
            </form>
          </>
        )}

        {authView === 'expired' && (
          <div className="auth-result" role="alert">
            <h2 id="auth-heading">Reset link expired</h2>
            <p className="auth-error">This reset link has expired. Please request a new one.</p>
            <button
              type="button"
              className="auth-text-link"
              onClick={() => {
                setIsRecoveryMode(false)
                setAuthView('reset')
                setErrorMessage('')
                onClearError()
              }}
            >
              Back to forgot password
            </button>
          </div>
        )}

        {authView === 'recovery' && (
          <>
            <h2 id="auth-heading">Set a new password</h2>
            <form className="auth-form" onSubmit={updatePassword}>
              <label htmlFor="auth-new-password">New password</label>
              <div className="auth-password-field">
                <input
                  id="auth-new-password"
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                  disabled={isLoading}
                />
                <PasswordVisibilityButton visible={isPasswordVisible} onToggle={() => setIsPasswordVisible((visible) => !visible)} disabled={isLoading} />
              </div>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <div className="auth-password-field">
                <input
                  id="auth-confirm-password"
                  type={isConfirmPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                  disabled={isLoading}
                />
                <PasswordVisibilityButton visible={isConfirmPasswordVisible} onToggle={() => setIsConfirmPasswordVisible((visible) => !visible)} disabled={isLoading} />
              </div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button type="submit" className="confirm-button auth-submit" disabled={isLoading || password.length < 8 || confirmPassword.length < 8 || password !== confirmPassword}>
                {isLoading ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        )}

        {authView === 'updated' && (
          <div className="auth-result" role="status">
            <h2 id="auth-heading">Password updated</h2>
            <p>Your password has been updated successfully.</p>
          </div>
        )}

        {(authView === 'login' || authView === 'signup') && (
          <>
            <h2 id="auth-heading">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
            <div className="auth-mode-toggle" aria-label="Authentication mode">
              <button type="button" className={isSignUp ? 'auth-mode-button' : 'auth-mode-button active'} aria-pressed={!isSignUp} onClick={() => changeMode('login')} disabled={isLoading}>Log In</button>
              <button type="button" className={isSignUp ? 'auth-mode-button active' : 'auth-mode-button'} aria-pressed={isSignUp} onClick={() => changeMode('signup')} disabled={isLoading}>Sign Up</button>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              {isSignUp && (
                <>
                  <label htmlFor="auth-full-name">Full Name</label>
                  <input id="auth-full-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required disabled={isLoading} />
                  <label htmlFor="auth-username">Username</label>
                  <input id="auth-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={isLoading} />
                </>
              )}
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={isLoading} />
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
                <PasswordVisibilityButton visible={isPasswordVisible} onToggle={() => setIsPasswordVisible((visible) => !visible)} disabled={isLoading} />
              </div>
              {!isSignUp && <button type="button" className="auth-text-link auth-forgot-link" onClick={() => { setAuthView('reset'); setErrorMessage(''); onClearError() }}>Forgot password?</button>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button type="submit" className="confirm-button auth-submit" disabled={isLoading || !email || !password || (isSignUp && (!fullName || !username))}>
                {isLoading ? (isSignUp ? 'Creating account...' : 'Logging in...') : (isSignUp ? 'Create account' : 'Log In')}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

function SettingsPage({ user, onBack, onLogout }) {
  const [profileId, setProfileId] = useState(null)
  const [username, setUsername] = useState('')
  const [savedUsername, setSavedUsername] = useState('')
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(true)
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountSuccess, setAccountSuccess] = useState('')
  const [securityAction, setSecurityAction] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [isAccountPasswordVisible, setIsAccountPasswordVisible] = useState(false)
  const [isSecuritySaving, setIsSecuritySaving] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const [securitySuccess, setSecuritySuccess] = useState('')
  const [wrongPinAttempts, setWrongPinAttempts] = useState(0)
  const [pinLockUntil, setPinLockUntil] = useState(0)
  const [pinLockRemaining, setPinLockRemaining] = useState(0)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    let isMounted = true

    const loadUsername = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', user.id)
          .maybeSingle()
        if (error) throw error
        if (!isMounted) return

        setProfileId(user.id)
        setUsername(data?.username ?? '')
        setSavedUsername(data?.username ?? '')
      } catch (error) {
        if (isMounted) setAccountError(error instanceof Error ? error.message : 'Could not load your account details.')
      } finally {
        if (isMounted) setIsLoadingAccount(false)
      }
    }

    loadUsername()
    return () => { isMounted = false }
  }, [user.id])

  useEffect(() => {
    if (!pinLockUntil) return undefined

    const updateLockRemaining = () => {
      const remaining = Math.max(0, Math.ceil((pinLockUntil - Date.now()) / 1000))
      setPinLockRemaining(remaining)
      if (remaining === 0) {
        setPinLockUntil(0)
        setWrongPinAttempts(0)
        setSecurityError('')
      }
    }

    updateLockRemaining()
    const intervalId = window.setInterval(updateLockRemaining, 1000)
    return () => window.clearInterval(intervalId)
  }, [pinLockUntil])

  const saveUsername = async (event) => {
    event.preventDefault()
    if (!profileId) return

    const nextUsername = username.trim()
    setIsSavingUsername(true)
    setAccountError('')
    setAccountSuccess('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ username: nextUsername })
        .eq('id', profileId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Your profile could not be found.')
      setUsername(nextUsername)
      setSavedUsername(nextUsername)
      setIsEditingUsername(false)
      setAccountSuccess('Username saved successfully.')
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Could not save your username.')
    } finally {
      setIsSavingUsername(false)
    }
  }

  const startSecurityAction = (action) => {
    setSecurityAction(action)
    setSecurityError('')
    setSecuritySuccess('')
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setNewPassword('')
    setConfirmPassword('')
    setAccountPassword('')
  }

  const updatePassword = async (event) => {
    event.preventDefault()
    setSecurityError('')
    setSecuritySuccess('')
    if (newPassword.length < 8) {
      setSecurityError('Your password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('The passwords do not match.')
      return
    }

    setIsSecuritySaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setSecuritySuccess('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
      setSecurityAction('')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update your password.')
    } finally {
      setIsSecuritySaving(false)
    }
  }

  const registerIncorrectAttempt = () => {
    const attempts = wrongPinAttempts + 1
    setWrongPinAttempts(attempts)
    if (attempts >= 3) {
      setPinLockUntil(Date.now() + 60000)
      setPinLockRemaining(60)
      setSecurityError('Too many incorrect attempts. Try again in 60 seconds.')
    }
  }

  const savePinHash = async (pinHash) => {
    const { data, error: lookupError } = await supabase
      .from('user_pins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupError) throw lookupError

    const result = data
      ? await supabase.from('user_pins').update({ pin_hash: pinHash }).eq('user_id', user.id)
      : await supabase.from('user_pins').insert({ user_id: user.id, pin_hash: pinHash })
    if (result.error) throw result.error
  }

  const validateNewPin = () => {
    if (!/^\d{4}$/.test(newPin)) {
      setSecurityError('Your new PIN must contain exactly 4 digits.')
      return false
    }
    if (newPin !== confirmPin) {
      setSecurityError('The new PINs do not match.')
      return false
    }
    return true
  }

  const changePin = async (event) => {
    event.preventDefault()
    setSecurityError('')
    setSecuritySuccess('')
    if (pinLockRemaining > 0 || !validateNewPin()) return

    setIsSecuritySaving(true)
    try {
      const { data, error } = await supabase
        .from('user_pins')
        .select('pin_hash')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      if (!data?.pin_hash) throw new Error('No PIN is set. Use “Forgot PIN?” to create one.')

      const currentPinHash = await hashUserPin(currentPin, user.id)
      if (currentPinHash !== data.pin_hash) {
        registerIncorrectAttempt()
        setSecurityError(wrongPinAttempts >= 2 ? 'Too many incorrect attempts. Try again in 60 seconds.' : 'Current PIN is incorrect.')
        return
      }

      await savePinHash(await hashUserPin(newPin, user.id))
      setWrongPinAttempts(0)
      setPinLockUntil(0)
      setPinLockRemaining(0)
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setSecurityAction('')
      setSecuritySuccess('PIN updated successfully.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update your PIN.')
    } finally {
      setIsSecuritySaving(false)
    }
  }

  const verifyAccountPassword = async (event) => {
    event.preventDefault()
    setSecurityError('')
    if (pinLockRemaining > 0) return
    setIsSecuritySaving(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: accountPassword })
      if (error) {
        registerIncorrectAttempt()
        setSecurityError(wrongPinAttempts >= 2 ? 'Too many incorrect attempts. Try again in 60 seconds.' : 'Account password is incorrect.')
        return
      }
      setWrongPinAttempts(0)
      setPinLockUntil(0)
      setPinLockRemaining(0)
      setAccountPassword('')
      setSecurityAction('forgot-set')
      setSecuritySuccess('Password confirmed. Choose a new PIN.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not verify your account password.')
    } finally {
      setIsSecuritySaving(false)
    }
  }

  const setForgottenPin = async (event) => {
    event.preventDefault()
    setSecurityError('')
    setSecuritySuccess('')
    if (!validateNewPin()) return
    setIsSecuritySaving(true)
    try {
      await savePinHash(await hashUserPin(newPin, user.id))
      setNewPin('')
      setConfirmPin('')
      setSecurityAction('')
      setSecuritySuccess('PIN updated successfully.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update your PIN.')
    } finally {
      setIsSecuritySaving(false)
    }
  }

  const viewTransactionHistory = async () => {
    setIsHistoryOpen(true)
    setIsHistoryLoading(true)
    setHistoryError('')
    try {
      const [depositsResult, withdrawalsResult] = await Promise.all([
        supabase.from('deposits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('withdrawals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      ])
      if (depositsResult.error && withdrawalsResult.error) throw depositsResult.error

      const normalize = (rows, type) => (rows ?? []).map((row, index) => ({
        id: row.id ?? `${type}-${index}`,
        amount: Number(row.amount ?? row.value ?? 0),
        method: row.method ?? row.payment_method ?? type,
        type,
        date: row.created_at ?? row.createdAt ?? row.date ?? '',
      }))
      setTransactions([
        ...normalize(depositsResult.data, 'Deposit'),
        ...normalize(withdrawalsResult.data, 'Withdrawal'),
      ].sort((first, second) => new Date(second.date) - new Date(first.date)).slice(0, 10))
      if (depositsResult.error || withdrawalsResult.error) setHistoryError('Some transaction history could not be loaded.')
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load transaction history.')
      setTransactions([])
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const isEmailVerified = Boolean(user.email_confirmed_at || user.confirmed_at)
  const pinInput = (id, label, value, onChange, autocomplete = 'new-password') => (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="settings-pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        autoComplete={autocomplete}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
        required
        disabled={isSecuritySaving || pinLockRemaining > 0}
      />
    </>
  )

  return (
    <section className="settings-section" aria-labelledby="settings-heading">
      <button type="button" className="back-button settings-back-button" onClick={onBack}>Back</button>
      <p className="eyebrow">ACCOUNT</p>
      <h2 id="settings-heading">Settings</h2>

      {isLoadingAccount ? (
        <p className="empty-state" role="status">Loading settings...</p>
      ) : (
        <div className="settings-card-grid">
          <article className="settings-card" aria-labelledby="settings-account-heading">
            <h3 id="settings-account-heading">Account</h3>
            <div className="settings-account-detail">
              <span>Email</span>
              <div className="settings-email-value">
                <p>{user.email || 'Not provided'}</p>
                {isEmailVerified && <span className="settings-verified">Verified</span>}
              </div>
            </div>
            <div className="settings-username-block">
              <h4>Username</h4>
              {isEditingUsername ? (
                <form className="settings-username-editor" onSubmit={saveUsername}>
                  <input
                    id="settings-username"
                    type="text"
                    autoComplete="username"
                    aria-label="Username"
                    value={username}
                    onChange={(event) => { setUsername(event.target.value); setAccountSuccess('') }}
                    required
                    disabled={isSavingUsername || !profileId}
                    autoFocus
                  />
                  <button type="submit" className="settings-icon-button settings-confirm-button" aria-label="Confirm username" title="Confirm" disabled={isSavingUsername || !profileId || !username.trim()}>✓</button>
                  <button
                    type="button"
                    className="settings-icon-button settings-cancel-button"
                    aria-label="Cancel username edit"
                    title="Cancel"
                    disabled={isSavingUsername}
                    onClick={() => { setUsername(savedUsername); setIsEditingUsername(false); setAccountError(''); setAccountSuccess('') }}
                  >
                    ×
                  </button>
                </form>
              ) : (
                <div className="settings-username-display">
                  <p>{savedUsername || 'Not provided'}</p>
                  <button
                    type="button"
                    className="settings-edit-button"
                    onClick={() => { setUsername(savedUsername); setIsEditingUsername(true); setAccountError(''); setAccountSuccess('') }}
                    disabled={!profileId}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            {accountError && <p className="auth-error" role="alert">{accountError}</p>}
            {accountSuccess && <p className="confirmation-message" role="status">{accountSuccess}</p>}
          </article>

          <article className="settings-card" aria-labelledby="settings-security-heading">
            <h3 id="settings-security-heading">Security</h3>
            {!securityAction && (
              <div className="settings-security-actions">
                <button type="button" className="fund-back-button settings-large-action" onClick={() => startSecurityAction('password')}>Change password</button>
                <button type="button" className="fund-back-button settings-large-action" onClick={() => startSecurityAction('pin')}>Change PIN</button>
                <button type="button" className="settings-edit-button settings-forgot-pin" onClick={() => startSecurityAction('forgot-password')}>Forgot PIN?</button>
              </div>
            )}

            {securityAction === 'password' && (
              <form className="settings-security-form" onSubmit={updatePassword}>
                <label htmlFor="settings-new-password">New password</label>
                <div className="auth-password-field">
                  <input id="settings-new-password" type={isNewPasswordVisible ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={isSecuritySaving} />
                  <PasswordVisibilityButton visible={isNewPasswordVisible} onToggle={() => setIsNewPasswordVisible((visible) => !visible)} disabled={isSecuritySaving} />
                </div>
                <label htmlFor="settings-confirm-password">Confirm password</label>
                <div className="auth-password-field">
                  <input id="settings-confirm-password" type={isConfirmPasswordVisible ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={isSecuritySaving} />
                  <PasswordVisibilityButton visible={isConfirmPasswordVisible} onToggle={() => setIsConfirmPasswordVisible((visible) => !visible)} disabled={isSecuritySaving} />
                </div>
                <div className="settings-form-actions">
                  <button type="button" className="fund-back-button" onClick={() => startSecurityAction('')}>Cancel</button>
                  <button type="submit" className="confirm-button" disabled={isSecuritySaving || newPassword.length < 8 || confirmPassword.length < 8 || newPassword !== confirmPassword}>{isSecuritySaving ? 'Saving...' : 'Update password'}</button>
                </div>
              </form>
            )}

            {securityAction === 'pin' && (
              <form className="settings-security-form" onSubmit={changePin}>
                {pinInput('settings-current-pin', 'Current 4-digit PIN', currentPin, setCurrentPin, 'current-password')}
                {pinInput('settings-new-pin', 'New 4-digit PIN', newPin, setNewPin)}
                {pinInput('settings-confirm-pin', 'Confirm new PIN', confirmPin, setConfirmPin)}
                {pinLockRemaining > 0 && <p className="fund-pin-status" role="status">Try again in {pinLockRemaining} seconds.</p>}
                <div className="settings-form-actions">
                  <button type="button" className="fund-back-button" onClick={() => startSecurityAction('')}>Cancel</button>
                  <button type="submit" className="confirm-button" disabled={isSecuritySaving || pinLockRemaining > 0 || currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}>{isSecuritySaving ? 'Saving...' : 'Update PIN'}</button>
                </div>
              </form>
            )}

            {securityAction === 'forgot-password' && (
              <form className="settings-security-form" onSubmit={verifyAccountPassword}>
                <p className="settings-security-note">Verify your account password before creating a new PIN.</p>
                <label htmlFor="settings-account-password">Account password</label>
                <div className="auth-password-field">
                  <input id="settings-account-password" type={isAccountPasswordVisible ? 'text' : 'password'} autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required disabled={isSecuritySaving || pinLockRemaining > 0} />
                  <PasswordVisibilityButton visible={isAccountPasswordVisible} onToggle={() => setIsAccountPasswordVisible((visible) => !visible)} disabled={isSecuritySaving || pinLockRemaining > 0} />
                </div>
                {pinLockRemaining > 0 && <p className="fund-pin-status" role="status">Try again in {pinLockRemaining} seconds.</p>}
                <div className="settings-form-actions">
                  <button type="button" className="fund-back-button" onClick={() => startSecurityAction('')}>Cancel</button>
                  <button type="submit" className="confirm-button" disabled={isSecuritySaving || pinLockRemaining > 0 || !accountPassword}>{isSecuritySaving ? 'Verifying...' : 'Verify password'}</button>
                </div>
              </form>
            )}

            {securityAction === 'forgot-set' && (
              <form className="settings-security-form" onSubmit={setForgottenPin}>
                {pinInput('settings-forgot-new-pin', 'New 4-digit PIN', newPin, setNewPin)}
                {pinInput('settings-forgot-confirm-pin', 'Confirm new PIN', confirmPin, setConfirmPin)}
                <div className="settings-form-actions">
                  <button type="button" className="fund-back-button" onClick={() => startSecurityAction('')}>Cancel</button>
                  <button type="submit" className="confirm-button" disabled={isSecuritySaving || newPin.length !== 4 || confirmPin.length !== 4 || newPin !== confirmPin}>{isSecuritySaving ? 'Saving...' : 'Save new PIN'}</button>
                </div>
              </form>
            )}
            {securityError && <p className="fund-pin-error" role="alert">{securityError}</p>}
            {securitySuccess && <p className="confirmation-message" role="status">{securitySuccess}</p>}
          </article>

          <article className="settings-card settings-history-card" aria-labelledby="settings-history-heading">
            <div className="settings-card-heading">
              <h3 id="settings-history-heading">Transaction history</h3>
              <button type="button" className="confirm-button settings-history-button" onClick={viewTransactionHistory} disabled={isHistoryLoading}>
                {isHistoryLoading ? 'Loading...' : isHistoryOpen ? 'Refresh history' : 'View history'}
              </button>
            </div>
            {isHistoryOpen && (
              <div className="settings-history-content" aria-live="polite">
                {historyError && <p className="fund-pin-status" role="status">{historyError}</p>}
                {isHistoryLoading ? (
                  <p className="fund-pin-status" role="status">Loading recent transactions...</p>
                ) : transactions.length ? (
                  <ul className="settings-transaction-list">
                    {transactions.map((transaction) => (
                      <li key={`${transaction.type}-${transaction.id}`}>
                        <div>
                          <strong>{transaction.type}</strong>
                          <span>{transaction.method}</span>
                        </div>
                        <div className="settings-transaction-value">
                          <strong>${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          <time dateTime={transaction.date}>{transaction.date ? new Date(transaction.date).toLocaleString() : 'Date unavailable'}</time>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : !historyError && <p className="withdrawal-empty-state">No recent transactions.</p>}
              </div>
            )}
          </article>
        </div>
      )}

      <button type="button" className="settings-logout-button" onClick={onLogout}>Log out</button>
    </section>
  )
}

async function hashUserPin(pin, userId) {
  const pinBytes = new TextEncoder().encode(`${userId}:${pin}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', pinBytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getPriceHistory(stock) {
  if (!stock) return []

  const currentPrice = Number.parseFloat(stock.price.replace('$', ''))
  return Array.from({ length: 30 }, (_, index) => {
    const dayOffset = 29 - index
    const movement = Math.sin(index * 0.58 + stock.symbol.length) * 0.035
      + Math.cos(index * 0.27 + stock.symbol.charCodeAt(0)) * 0.02
      + ((index % 5) - 2) * 0.004
    const price = index === 29 ? currentPrice : currentPrice * (1 + movement - dayOffset * 0.0015)
    return { date: `${dayOffset}d ago`, price: Number(price.toFixed(2)) }
  })
}

function getOhlcHistory(stock, priceHistory) {
  if (!stock) return []

  const today = new Date()
  return priceHistory.map((point, index) => {
    const previousClose = index === 0
      ? point.price * (1 + ((stock.symbol.charCodeAt(0) % 7) - 3) * 0.002)
      : priceHistory[index - 1].price
    const close = point.price
    const spread = close * (0.0025 + (stock.symbol.charCodeAt(index % stock.symbol.length) % 5) * 0.0007)
    const high = Math.max(previousClose, close) + spread
    const low = Math.min(previousClose, close) - spread
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - (priceHistory.length - 1 - index))

    return {
      time: date.toISOString().slice(0, 10),
      open: Number(previousClose.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close,
    }
  })
}

function loadSavedState() {
  const defaultState = { walletBalance: 10000, portfolio: {}, watchlist: [] }

  try {
    if (typeof window === 'undefined') return defaultState

    const savedState = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    if (!savedState || typeof savedState !== 'object') return defaultState

    return {
      walletBalance: Number.isFinite(savedState.walletBalance) && savedState.walletBalance >= 0
        ? savedState.walletBalance
        : defaultState.walletBalance,
      portfolio: savedState.portfolio && typeof savedState.portfolio === 'object' && !Array.isArray(savedState.portfolio)
        ? savedState.portfolio
        : defaultState.portfolio,
      watchlist: Array.isArray(savedState.watchlist)
        ? savedState.watchlist.filter((symbol) => typeof symbol === 'string')
        : defaultState.watchlist,
    }
  } catch {
    return defaultState
  }
}

function App() {
  const [initialState] = useState(loadSavedState)
  const [user, setUser] = useState(null)
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [authError, setAuthError] = useState('')
  const [isRecoveryMode, setIsRecoveryMode] = useState(() => getInitialAuthUrlState().isRecoveryMode)
  const [authView, setAuthView] = useState(() => getInitialAuthUrlState().hasError ? 'expired' : 'login')
  const [activeTab, setActiveTab] = useState('home')
  const [settingsReturnView, setSettingsReturnView] = useState({ tab: 'home', selectedSymbol: null })
  const [aboutReturnView, setAboutReturnView] = useState({ tab: 'home', selectedSymbol: null })
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [watchlist, setWatchlist] = useState(initialState.watchlist)
  const [buyingSymbol, setBuyingSymbol] = useState(null)
  const [investmentAmounts, setInvestmentAmounts] = useState({})
  const [confirmedOrders, setConfirmedOrders] = useState({})
  const [portfolio, setPortfolio] = useState(initialState.portfolio)
  const [walletBalance, setWalletBalance] = useState(initialState.walletBalance)
  const walletBalanceRef = useRef(initialState.walletBalance)
  const [isFunding, setIsFunding] = useState(false)
  const [fundingAmount, setFundingAmount] = useState('')
  const [fundingStep, setFundingStep] = useState('amount')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalStep, setWithdrawalStep] = useState('amount')
  const [withdrawalMethod, setWithdrawalMethod] = useState('')
  const [withdrawalError, setWithdrawalError] = useState('')
  const [isProcessingWithdrawal, setIsProcessingWithdrawal] = useState(false)
  const [withdrawalHistoryState, setWithdrawalHistoryState] = useState({ userId: null, items: [], isLoading: true, error: '' })
  const [savedPinHash, setSavedPinHash] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirmation, setPinConfirmation] = useState('')
  const [pinError, setPinError] = useState('')
  const [wrongPinAttempts, setWrongPinAttempts] = useState(0)
  const [pinLockUntil, setPinLockUntil] = useState(0)
  const [pinLockRemaining, setPinLockRemaining] = useState(0)
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [buyError, setBuyError] = useState({})
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [chartMode, setChartMode] = useState('line')

  const withdrawalHistory = withdrawalHistoryState.userId === user?.id ? withdrawalHistoryState.items : []
  const isLoadingWithdrawals = Boolean(user?.id) && (
    withdrawalHistoryState.userId !== user.id || withdrawalHistoryState.isLoading
  )
  const withdrawalHistoryError = withdrawalHistoryState.userId === user?.id ? withdrawalHistoryState.error : ''

  const updateWalletBalance = (nextBalance) => {
    walletBalanceRef.current = nextBalance
    setWalletBalance(nextBalance)
  }

  useEffect(() => {
    let isMounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true)
        setAuthView('recovery')
      }
      if (event === 'SIGNED_OUT') setAuthView('login')
      setUser(session?.user ?? null)
      setIsCheckingSession(false)
      setAuthError('')
    })

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!isMounted) return
        if (error) setAuthError(error.message)
        setUser(session?.user ?? null)
        setIsCheckingSession(false)
      })
      .catch((error) => {
        if (!isMounted) return
        setAuthError(error instanceof Error ? error.message : 'Could not restore your session.')
        setIsCheckingSession(false)
      })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (authView !== 'updated') return undefined

    const timeoutId = window.setTimeout(() => setAuthView('login'), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [authView])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ walletBalance, portfolio, watchlist }))
    } catch {
      // Storage can be unavailable or full; the app remains usable for this session.
    }
  }, [walletBalance, portfolio, watchlist])

  useEffect(() => {
    if (!user?.id) return undefined

    let isCurrent = true
    const userId = user.id
    supabase
      .from('withdrawals')
      .select('id, amount, method, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!isCurrent) return
        if (error) throw error
        setWithdrawalHistoryState((currentState) => {
          const existingItems = currentState.userId === userId ? currentState.items : []
          const mergedItems = [...existingItems, ...(data ?? [])]
          const uniqueItems = [...new Map(mergedItems.map((item) => [item.id, item])).values()]
            .sort((first, second) => new Date(second.created_at) - new Date(first.created_at))

          return { userId, items: uniqueItems.slice(0, 10), isLoading: false, error: '' }
        })
      })
      .catch((error) => {
        if (!isCurrent) return
        setWithdrawalHistoryState((currentState) => ({
          userId,
          items: currentState.userId === userId ? currentState.items : [],
          isLoading: false,
          error: error instanceof Error ? error.message : 'Could not load withdrawal history.',
        }))
      })

    return () => { isCurrent = false }
  }, [user?.id])

  useEffect(() => {
    if (!pinLockUntil) return undefined

    const updateLockRemaining = () => {
      const remaining = Math.max(0, Math.ceil((pinLockUntil - Date.now()) / 1000))
      setPinLockRemaining(remaining)
      if (remaining === 0) {
        setPinLockUntil(0)
        setWrongPinAttempts(0)
        setPinError('')
      }
    }

    updateLockRemaining()
    const intervalId = window.setInterval(updateLockRemaining, 1000)
    return () => window.clearInterval(intervalId)
  }, [pinLockUntil])

  useEffect(() => {
    if (!isMenuOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isMenuOpen])

  const toggleWatchlist = (symbol) => {
    setWatchlist((currentWatchlist) =>
      currentWatchlist.includes(symbol)
        ? currentWatchlist.filter((item) => item !== symbol)
        : [...currentWatchlist, symbol],
    )
  }

  const openBuyForm = (symbol) => {
    setBuyingSymbol(symbol)
    setConfirmedOrders((currentOrders) => ({ ...currentOrders, [symbol]: false }))
    setBuyError((currentErrors) => ({ ...currentErrors, [symbol]: '' }))
  }

  const closeBuyForm = () => {
    setBuyingSymbol(null)
  }

  const updateInvestmentAmount = (symbol, amount) => {
    setInvestmentAmounts((currentAmounts) => ({ ...currentAmounts, [symbol]: amount }))
    setConfirmedOrders((currentOrders) => ({ ...currentOrders, [symbol]: false }))
    setBuyError((currentErrors) => ({ ...currentErrors, [symbol]: '' }))
  }

  const confirmBuy = (stock) => {
    const amount = Number(investmentAmounts[stock.symbol])
    const currentPrice = Number(stock.price.replace('$', ''))
    if (amount <= 0) return
    if (amount > walletBalanceRef.current) {
      setBuyError((currentErrors) => ({ ...currentErrors, [stock.symbol]: 'Insufficient wallet balance.' }))
      return
    }

    const quantity = amount / currentPrice
    setPortfolio((currentPortfolio) => {
      const existingHolding = currentPortfolio[stock.symbol]
      const totalInvested = (existingHolding?.totalInvested || 0) + amount
      const totalQuantity = (existingHolding?.quantity || 0) + quantity

      return {
        ...currentPortfolio,
        [stock.symbol]: {
          symbol: stock.symbol,
          name: stock.name,
          quantity: totalQuantity,
          totalInvested,
          averageBuyPrice: totalInvested / totalQuantity,
          currentPrice,
        },
      }
    })
    updateWalletBalance(walletBalanceRef.current - amount)
    setConfirmedOrders((currentOrders) => ({ ...currentOrders, [stock.symbol]: true }))
  }

  const sellHolding = (symbol, shares) => {
    const holding = portfolio[symbol]
    if (!holding || shares <= 0 || shares > holding.quantity) return

    const proceeds = shares * holding.currentPrice
    const remainingQuantity = holding.quantity - shares
    setPortfolio((currentPortfolio) => {
      if (remainingQuantity <= 0.0000001) {
        const remainingPortfolio = { ...currentPortfolio }
        delete remainingPortfolio[symbol]
        return remainingPortfolio
      }

      return {
        ...currentPortfolio,
        [symbol]: { ...holding, quantity: remainingQuantity },
      }
    })
    updateWalletBalance(walletBalanceRef.current + proceeds)
  }

  const choosePaymentMethod = (event) => {
    event.preventDefault()
    if (Number(fundingAmount) <= 0) return
    setFundingStep('method')
  }

  const chooseWithdrawalMethod = (event) => {
    event.preventDefault()
    const amount = Number(withdrawalAmount)
    if (!withdrawalAmount || !Number.isFinite(amount) || amount <= 0) return
    if (amount > walletBalanceRef.current) {
      setWithdrawalError('Amount exceeds your available balance.')
      return
    }
    setWithdrawalError('')
    setWithdrawalStep('method')
  }

  const checkFundingPin = async (event) => {
    event.preventDefault()
    if (!user?.id || !paymentMethod) return

    setFundingStep('pin-checking')
    setPinError('')

    try {
      const { data, error } = await supabase
        .from('user_pins')
        .select('pin_hash')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      setSavedPinHash(data?.pin_hash ?? '')
      setPin('')
      setPinConfirmation('')
      setFundingStep(data?.pin_hash ? 'pin-enter' : 'pin-create')
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not check your PIN.')
      setFundingStep('method')
    }
  }

  const fundWallet = () => {
    const amount = Number(fundingAmount)
    if (amount <= 0 || !paymentMethod) return

    updateWalletBalance(walletBalanceRef.current + amount)
    setFundingStep('success')
  }

  const checkWithdrawalPin = async (event) => {
    event.preventDefault()
    if (!user?.id || !withdrawalMethod) return

    setWithdrawalStep('pin-checking')
    setPinError('')
    setWithdrawalError('')

    try {
      const { data, error } = await supabase
        .from('user_pins')
        .select('pin_hash')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      setSavedPinHash(data?.pin_hash ?? '')
      setPin('')
      setPinConfirmation('')
      setWithdrawalStep(data?.pin_hash ? 'pin-enter' : 'pin-create')
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not check your PIN.')
      setWithdrawalStep('method')
    }
  }

  const withdrawWalletFunds = async () => {
    const amount = Number(withdrawalAmount)
    if (!user?.id || !withdrawalMethod || !Number.isFinite(amount) || amount <= 0) return false

    const currentBalance = walletBalanceRef.current
    if (amount > currentBalance) {
      setPinError('Amount exceeds your available balance.')
      return false
    }

    updateWalletBalance(currentBalance - amount)
    try {
      const { error } = await supabase.from('withdrawals').insert({
        user_id: user.id,
        amount,
        method: withdrawalMethod,
      })
      if (error) throw error

      const newWithdrawal = {
        id: `local-${Date.now()}`,
        amount,
        method: withdrawalMethod,
        created_at: new Date().toISOString(),
      }
      setWithdrawalHistoryState((currentState) => ({
        userId: user.id,
        items: [newWithdrawal, ...(currentState.userId === user.id ? currentState.items : [])].slice(0, 10),
        isLoading: false,
        error: '',
      }))
      setWithdrawalStep('success')
      setPinError('')
      return true
    } catch (error) {
      updateWalletBalance(walletBalanceRef.current + amount)
      setPinError(error instanceof Error ? error.message : 'Could not record this withdrawal. Please try again.')
      return false
    }
  }

  const createWithdrawalPin = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin) || pin !== pinConfirmation || !user?.id || isSavingPin) return

    setIsSavingPin(true)
    setPinError('')
    setIsProcessingWithdrawal(true)

    try {
      const pinHash = await hashUserPin(pin, user.id)
      const { error } = await supabase
        .from('user_pins')
        .insert({ user_id: user.id, pin_hash: pinHash })

      if (error) throw error

      setSavedPinHash(pinHash)
      await withdrawWalletFunds()
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not save your PIN.')
    } finally {
      setIsSavingPin(false)
      setIsProcessingWithdrawal(false)
    }
  }

  const verifyWithdrawalPin = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin) || pinLockRemaining > 0 || isProcessingWithdrawal) return

    setIsProcessingWithdrawal(true)
    setPinError('')
    try {
      const enteredPinHash = await hashUserPin(pin, user.id)
      if (enteredPinHash === savedPinHash) {
        const succeeded = await withdrawWalletFunds()
        if (succeeded) {
          setWrongPinAttempts(0)
          setPin('')
        }
        return
      }

      const attempts = wrongPinAttempts + 1
      setWrongPinAttempts(attempts)
      setPin('')
      setPinError('Incorrect PIN')
      if (attempts >= 3) {
        setPinLockUntil(Date.now() + 60000)
        setPinLockRemaining(60)
      }
    } catch {
      setPinError('Could not verify your PIN. Please try again.')
    } finally {
      setIsProcessingWithdrawal(false)
    }
  }

  const returnToWithdrawalMethod = () => {
    setPin('')
    setPinConfirmation('')
    setPinError('')
    setWithdrawalStep('method')
  }

  const createFundingPin = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin) || pin !== pinConfirmation || !user?.id) return

    setIsSavingPin(true)
    setPinError('')

    try {
      const pinHash = await hashUserPin(pin, user.id)
      const { error } = await supabase
        .from('user_pins')
        .insert({ user_id: user.id, pin_hash: pinHash })

      if (error) throw error

      setSavedPinHash(pinHash)
      fundWallet()
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not save your PIN.')
    } finally {
      setIsSavingPin(false)
    }
  }

  const verifyFundingPin = async (event) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin) || pinLockRemaining > 0) return

    setPinError('')

    try {
      const enteredPinHash = await hashUserPin(pin, user.id)
      if (enteredPinHash === savedPinHash) {
        setWrongPinAttempts(0)
        setPin('')
        fundWallet()
        return
      }

      const attempts = wrongPinAttempts + 1
      setWrongPinAttempts(attempts)
      setPin('')
      setPinError('Incorrect PIN')
      if (attempts >= 3) {
        setPinLockUntil(Date.now() + 60000)
        setPinLockRemaining(60)
      }
    } catch {
      setPinError('Could not verify your PIN. Please try again.')
    }
  }

  const returnToPaymentMethod = () => {
    setPin('')
    setPinConfirmation('')
    setPinError('')
    setFundingStep('method')
  }

  const closeFunding = () => {
    setIsFunding(false)
    setFundingStep('amount')
    setPaymentMethod('')
    setFundingAmount('')
    setSavedPinHash('')
    setPin('')
    setPinConfirmation('')
    setPinError('')
  }

  const closeWithdrawal = () => {
    setIsWithdrawing(false)
    setWithdrawalStep('amount')
    setWithdrawalAmount('')
    setWithdrawalMethod('')
    setWithdrawalError('')
    setSavedPinHash('')
    setPin('')
    setPinConfirmation('')
    setPinError('')
  }

  const handleAuthSuccess = async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      setAuthError(error.message)
      return
    }
    setUser(data.session?.user ?? null)
  }

  const completePasswordRecovery = () => {
    setIsRecoveryMode(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('reset')
    url.hash = ''
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setAuthView('updated')
    setAuthError('')
  }

  const logOut = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
  }

  const watchlistedStocks = stocks.filter((stock) => watchlist.includes(stock.symbol))
  const selectedStock = stocks.find((stock) => stock.symbol === selectedSymbol)
  const priceHistory = useMemo(() => getPriceHistory(selectedStock), [selectedStock])
  const ohlcHistory = useMemo(() => getOhlcHistory(selectedStock, priceHistory), [selectedStock, priceHistory])

  const StockCard = ({ stock }) => {
    const isWatched = watchlist.includes(stock.symbol)
    const investmentAmount = investmentAmounts[stock.symbol] || ''
    const numericAmount = Number(investmentAmount)
    const stockPrice = Number.parseFloat(stock.price.replace('$', ''))
    const fractionalShares = numericAmount > 0 ? numericAmount / stockPrice : 0
    const isBuying = buyingSymbol === stock.symbol
    const isConfirmed = confirmedOrders[stock.symbol]
    const errorMessage = buyError[stock.symbol]

    return (
      <article
        className={isBuying ? 'stock-card is-buying' : 'stock-card'}
        role="group"
        tabIndex={0}
        aria-label={`Open details for ${stock.name}`}
        onClick={(event) => {
          if (event.target.closest('button, form, input, label')) return
          setSelectedSymbol(stock.symbol)
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
          event.preventDefault()
          setSelectedSymbol(stock.symbol)
        }}
      >
        <div className="stock-row">
          <div className="stock-identity">
            <span className="stock-symbol">{stock.symbol}</span>
                <button type="button" className="stock-name stock-name-button" onClick={() => setSelectedSymbol(stock.symbol)}>
                  {stock.name}
                </button>
          </div>
          <div className="stock-value">
            <strong>{stock.price}</strong>
            <span className={stock.positive ? 'change positive' : 'change negative'}>
              {stock.change}
            </span>
          </div>
          <button
            type="button"
            className="buy-button"
            onClick={() => (isBuying ? closeBuyForm() : openBuyForm(stock.symbol))}
          >
            {isBuying ? 'Close' : 'Buy'}
          </button>
          <button
            type="button"
            className={isWatched ? 'watch-button active' : 'watch-button'}
            onClick={() => toggleWatchlist(stock.symbol)}
            aria-label={isWatched ? `Remove ${stock.symbol} from watchlist` : `Add ${stock.symbol} to watchlist`}
            aria-pressed={isWatched}
          >
            {isWatched ? '★' : '☆'}
          </button>
        </div>
        {isBuying && (
          <form className="buy-form" onSubmit={(event) => { event.preventDefault(); confirmBuy(stock) }}>
            <label htmlFor={`investment-${stock.symbol}`}>How much do you want to invest ($)?</label>
            <div className="buy-form-controls">
              <input
                id={`investment-${stock.symbol}`}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={investmentAmount}
                onChange={(event) => updateInvestmentAmount(stock.symbol, event.target.value)}
                autoFocus
              />
              <button type="submit" className="confirm-button" disabled={!investmentAmount || Number(investmentAmount) <= 0}>
                Confirm buy
              </button>
            </div>
            {investmentAmount && Number(investmentAmount) > 0 && (
              <p className="fractional-preview">You will receive <strong>{fractionalShares.toFixed(4)} shares</strong> of {stock.symbol}.</p>
            )}
            {isConfirmed && <p className="confirmation-message">Purchase confirmed for {stock.symbol}.</p>}
            {errorMessage && <p className="buy-error">{errorMessage}</p>}
          </form>
        )}
      </article>
    )
  }

  if (isRecoveryMode) {
    const recoveryView = authView === 'expired' ? 'expired' : 'recovery'
    return <AuthScreens authView={recoveryView} setAuthView={setAuthView} setIsRecoveryMode={setIsRecoveryMode} onLogin={handleAuthSuccess} onRecoveryComplete={completePasswordRecovery} serverError={authError} onClearError={() => setAuthError('')} />
  }

  if (isCheckingSession) {
    return <main className="auth-loading" aria-live="polite">Checking your session...</main>
  }

  if (authView === 'updated' || authView === 'reset') {
    return <AuthScreens authView={authView} setAuthView={setAuthView} setIsRecoveryMode={setIsRecoveryMode} onLogin={handleAuthSuccess} onRecoveryComplete={completePasswordRecovery} serverError={authError} onClearError={() => setAuthError('')} />
  }

  if (!user) {
    return <AuthScreens authView={authView} setAuthView={setAuthView} setIsRecoveryMode={setIsRecoveryMode} onLogin={handleAuthSuccess} onRecoveryComplete={completePasswordRecovery} serverError={authError} onClearError={() => setAuthError('')} />
  }

  return (
    <main className={activeTab === 'about' ? 'app-shell about-app-shell' : 'app-shell'}>
      {activeTab !== 'about' && (
        <>
      <button
        type="button"
        className={isMenuOpen ? 'menu-toggle is-open' : 'menu-toggle'}
        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMenuOpen}
        aria-controls="app-drawer"
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
      >
        <span />
        <span />
        <span />
      </button>
      <Avatar userId={user.id} refreshKey={avatarRefreshKey} className="app-user-avatar" />
      <button
        type="button"
        className={isMenuOpen ? 'drawer-backdrop is-visible' : 'drawer-backdrop'}
        aria-label="Close menu"
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside id="app-drawer" className={isMenuOpen ? 'app-drawer is-open' : 'app-drawer'} aria-hidden={!isMenuOpen}>
        <p className="eyebrow">NAVIGATION</p>
        <nav className="drawer-nav" aria-label="Menu">
          <button
            type="button"
            tabIndex={isMenuOpen ? 0 : -1}
            onClick={() => {
              setActiveTab('home')
              setSelectedSymbol(null)
              setIsMenuOpen(false)
            }}
          >
            Dashboard
          </button>
          <button
            type="button"
            tabIndex={isMenuOpen ? 0 : -1}
            onClick={() => {
              if (activeTab !== 'settings') {
                setSettingsReturnView({ tab: activeTab, selectedSymbol })
              }
              setActiveTab('settings')
              setSelectedSymbol(null)
              setIsMenuOpen(false)
            }}
          >
            Settings
          </button>
          <button
            type="button"
            tabIndex={isMenuOpen ? 0 : -1}
            onClick={() => {
              setActiveTab('profile')
              setSelectedSymbol(null)
              setIsMenuOpen(false)
            }}
          >
            Profile
          </button>
          <button
            type="button"
            className="drawer-logout-button"
            tabIndex={isMenuOpen ? 0 : -1}
            onClick={() => {
              setIsMenuOpen(false)
              logOut()
            }}
          >
            Log Out
          </button>
          <button
            type="button"
            tabIndex={isMenuOpen ? 0 : -1}
            onClick={() => {
              if (activeTab !== 'about') setAboutReturnView({ tab: activeTab, selectedSymbol })
              setActiveTab('about')
              setSelectedSymbol(null)
              setIsMenuOpen(false)
            }}
          >
            About
          </button>
        </nav>
      </aside>

      <header className="app-header">
        <div>
          <p className="eyebrow">MARKET OVERVIEW</p>
          <h1>Track what matters.</h1>
        </div>
        <div className="header-actions">
          <span className="market-status"><i /> Market open</span>
        </div>
      </header>
        </>
      )}

      {activeTab !== 'about' && authError && <p className="auth-error" role="alert">{authError}</p>}

      {activeTab !== 'settings' && activeTab !== 'about' && <nav className="tab-nav" aria-label="Primary navigation">
        {[
          ['home', 'Home'],
          ['watchlist', 'Watchlist'],
          ['portfolio', 'Portfolio'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'tab-button active' : 'tab-button'}
            onClick={() => {
              setActiveTab(tab)
              setSelectedSymbol(null)
            }}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>}

      {activeTab === 'home' && (
        <section className="wallet-panel" aria-labelledby="wallet-heading">
          <div>
            <p className="eyebrow">AVAILABLE FUNDS</p>
            <h2 id="wallet-heading">${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
          </div>
          <div className="wallet-actions">
            <button
              type="button"
              className="fund-button"
              onClick={() => {
                if (isFunding) closeFunding()
                else {
                  if (isWithdrawing) closeWithdrawal()
                  setIsFunding(true)
                }
              }}
            >
              {isFunding ? 'Close' : 'Add funds'}
            </button>
            <button
              type="button"
              className="fund-button"
              onClick={() => {
                if (isWithdrawing) closeWithdrawal()
                else {
                  if (isFunding) closeFunding()
                  setIsWithdrawing(true)
                }
              }}
            >
              {isWithdrawing ? 'Close' : 'Withdraw'}
            </button>
          </div>
          {isFunding && (
            <div className="fund-form">
              {fundingStep === 'amount' && (
                <form onSubmit={choosePaymentMethod}>
                  <label htmlFor="funding-amount">Add money to wallet ($)</label>
                  <div className="fund-form-controls">
                    <input
                      id="funding-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={fundingAmount}
                      onChange={(event) => setFundingAmount(event.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="confirm-button" disabled={!fundingAmount || Number(fundingAmount) <= 0}>
                      Add funds
                    </button>
                  </div>
                </form>
              )}

              {fundingStep === 'method' && (
                <form className="fund-payment-step" onSubmit={checkFundingPin}>
                  <p className="fund-amount-summary">
                    Amount being added <strong>${Number(fundingAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                  <fieldset className="fund-payment-options">
                    <legend>Choose payment method</legend>
                    {['PayPal', 'Credit/Debit Card', 'Bank Transfer', 'Crypto (USDT)'].map((method) => (
                      <label key={method} className={paymentMethod === method ? 'selected' : ''}>
                        <input
                          type="radio"
                          name="payment-method"
                          value={method}
                          checked={paymentMethod === method}
                          onChange={() => setPaymentMethod(method)}
                        />
                        <span>{method}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="fund-step-actions">
                    <button
                      type="button"
                      className="fund-back-button"
                      onClick={() => { setFundingStep('amount'); setPaymentMethod('') }}
                    >
                      Back
                    </button>
                    <button type="submit" className="confirm-button" disabled={!paymentMethod}>
                      Continue
                    </button>
                  </div>
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                </form>
              )}

              {fundingStep === 'pin-checking' && (
                <p className="fund-pin-status" role="status">Checking your PIN setup...</p>
              )}

              {fundingStep === 'pin-create' && (
                <form className="fund-pin-step" onSubmit={createFundingPin}>
                  <p className="fund-pin-title">Create your PIN</p>
                  <label htmlFor="funding-pin">Enter a 4-digit PIN</label>
                  <input
                    id="funding-pin"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="new-password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={isSavingPin}
                  />
                  <label htmlFor="funding-pin-confirm">Confirm your PIN</label>
                  <input
                    id="funding-pin-confirm"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="new-password"
                    value={pinConfirmation}
                    onChange={(event) => setPinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={isSavingPin}
                  />
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                  <div className="fund-pin-actions">
                    <button type="button" className="fund-back-button" onClick={returnToPaymentMethod} disabled={isSavingPin}>Back</button>
                    <button
                      type="submit"
                      className="confirm-button"
                      disabled={isSavingPin || pin.length !== 4 || pinConfirmation.length !== 4 || pin !== pinConfirmation}
                    >
                      {isSavingPin ? 'Saving...' : 'Save PIN'}
                    </button>
                  </div>
                </form>
              )}

              {fundingStep === 'pin-enter' && (
                <form className="fund-pin-step" onSubmit={verifyFundingPin}>
                  <p className="fund-pin-title">Enter your 4-digit secret PIN</p>
                  <label htmlFor="funding-pin">Enter your PIN</label>
                  <input
                    id="funding-pin"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="current-password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={pinLockRemaining > 0}
                  />
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                  {pinLockRemaining > 0 && (
                    <p className="fund-pin-status" role="status">Try again in {pinLockRemaining} seconds.</p>
                  )}
                  <div className="fund-pin-actions">
                    <button type="button" className="fund-back-button" onClick={returnToPaymentMethod}>Back</button>
                    <button type="submit" className="confirm-button" disabled={pin.length !== 4 || pinLockRemaining > 0}>
                      Verify PIN
                    </button>
                  </div>
                </form>
              )}

              {fundingStep === 'success' && (
                <div className="fund-success" role="status">
                  <p><strong>Funds added successfully.</strong></p>
                  <p>${Number(fundingAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added using {paymentMethod}.</p>
                  <button type="button" className="confirm-button" onClick={closeFunding}>Done</button>
                </div>
              )}
            </div>
          )}
          {isWithdrawing && (
            <div className="fund-form withdrawal-form">
              {withdrawalStep === 'amount' && (
                <form onSubmit={chooseWithdrawalMethod}>
                  <p className="fund-amount-summary">
                    Available balance <strong>${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                  <label htmlFor="withdrawal-amount">Amount to withdraw ($)</label>
                  <div className="fund-form-controls">
                    <input
                      id="withdrawal-amount"
                      type="text"
                      inputMode="decimal"
                      pattern="(?:\d+(?:\.\d{0,2})?|\.\d{1,2})?"
                      placeholder="0.00"
                      value={withdrawalAmount}
                      onChange={(event) => {
                        const value = event.target.value
                        if (/^\d*\.?\d{0,2}$/.test(value)) {
                          setWithdrawalAmount(value)
                          setWithdrawalError('')
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="confirm-button"
                      disabled={!withdrawalAmount || !Number.isFinite(Number(withdrawalAmount)) || Number(withdrawalAmount) <= 0 || Number(withdrawalAmount) > walletBalance}
                    >
                      Continue
                    </button>
                  </div>
                  {(withdrawalError || (Number(withdrawalAmount) > walletBalance && withdrawalAmount)) && (
                    <p className="fund-pin-error" role="alert">{withdrawalError || 'Amount exceeds your available balance.'}</p>
                  )}
                </form>
              )}

              {withdrawalStep === 'method' && (
                <form className="fund-payment-step" onSubmit={checkWithdrawalPin}>
                  <p className="fund-amount-summary">
                    Amount being withdrawn <strong>${Number(withdrawalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </p>
                  <fieldset className="fund-payment-options">
                    <legend>Choose withdrawal method</legend>
                    {['Bank Transfer', 'PayPal', 'Crypto (USDT)'].map((method) => (
                      <label key={method} className={withdrawalMethod === method ? 'selected' : ''}>
                        <input
                          type="radio"
                          name="withdrawal-method"
                          value={method}
                          checked={withdrawalMethod === method}
                          onChange={() => setWithdrawalMethod(method)}
                        />
                        <span>{method}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="fund-step-actions">
                    <button
                      type="button"
                      className="fund-back-button"
                      onClick={() => { setWithdrawalStep('amount'); setWithdrawalMethod(''); setPinError('') }}
                    >
                      Back
                    </button>
                    <button type="submit" className="confirm-button" disabled={!withdrawalMethod}>
                      Continue
                    </button>
                  </div>
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                </form>
              )}

              {withdrawalStep === 'pin-checking' && (
                <p className="fund-pin-status" role="status">Checking your PIN setup...</p>
              )}

              {withdrawalStep === 'pin-create' && (
                <form className="fund-pin-step" onSubmit={createWithdrawalPin}>
                  <p className="fund-pin-title">Create your PIN</p>
                  <label htmlFor="withdrawal-pin">Enter a 4-digit PIN</label>
                  <input
                    id="withdrawal-pin"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="new-password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={isSavingPin}
                  />
                  <label htmlFor="withdrawal-pin-confirm">Confirm your PIN</label>
                  <input
                    id="withdrawal-pin-confirm"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="new-password"
                    value={pinConfirmation}
                    onChange={(event) => setPinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={isSavingPin}
                  />
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                  <div className="fund-pin-actions">
                    <button type="button" className="fund-back-button" onClick={returnToWithdrawalMethod} disabled={isSavingPin}>Back</button>
                    <button
                      type="submit"
                      className="confirm-button"
                      disabled={isSavingPin || pin.length !== 4 || pinConfirmation.length !== 4 || pin !== pinConfirmation}
                    >
                      {isSavingPin ? 'Saving...' : 'Save PIN and withdraw'}
                    </button>
                  </div>
                </form>
              )}

              {withdrawalStep === 'pin-enter' && (
                <form className="fund-pin-step" onSubmit={verifyWithdrawalPin}>
                  <p className="fund-pin-title">Enter your 4-digit secret PIN</p>
                  <label htmlFor="withdrawal-pin">Enter your PIN</label>
                  <input
                    id="withdrawal-pin"
                    className="fund-pin-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="current-password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    disabled={pinLockRemaining > 0 || isProcessingWithdrawal}
                  />
                  {pinError && <p className="fund-pin-error" role="alert">{pinError}</p>}
                  {pinLockRemaining > 0 && (
                    <p className="fund-pin-status" role="status">Try again in {pinLockRemaining} seconds.</p>
                  )}
                  <div className="fund-pin-actions">
                    <button type="button" className="fund-back-button" onClick={returnToWithdrawalMethod} disabled={isProcessingWithdrawal}>Back</button>
                    <button type="submit" className="confirm-button" disabled={pin.length !== 4 || pinLockRemaining > 0 || isProcessingWithdrawal}>
                      {isProcessingWithdrawal ? 'Verifying...' : 'Verify PIN and withdraw'}
                    </button>
                  </div>
                </form>
              )}

              {withdrawalStep === 'success' && (
                <div className="fund-success" role="status">
                  <p><strong>Withdrawal successful.</strong></p>
                  <p>${Number(withdrawalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} withdrawn using {withdrawalMethod}.</p>
                  <button type="button" className="confirm-button" onClick={closeWithdrawal}>Done</button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'home' && (
        <section className="withdrawal-history" aria-labelledby="withdrawal-history-heading">
          <div className="withdrawal-history-heading">
            <h2 id="withdrawal-history-heading">Withdrawal history</h2>
          </div>
          {isLoadingWithdrawals ? (
            <p className="fund-pin-status" role="status">Loading withdrawal history...</p>
          ) : withdrawalHistoryError ? (
            <p className="fund-pin-error" role="alert">{withdrawalHistoryError}</p>
          ) : withdrawalHistory.length === 0 ? (
            <p className="withdrawal-empty-state">No withdrawals yet.</p>
          ) : (
            <ul className="withdrawal-list">
              {withdrawalHistory.map((withdrawal) => (
                <li key={withdrawal.id} className="withdrawal-history-row">
                  <strong>${Number(withdrawal.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span>{withdrawal.method}</span>
                  <time dateTime={withdrawal.created_at}>{new Date(withdrawal.created_at).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selectedStock ? (
        <section className="stock-detail" aria-labelledby="detail-heading">
          <button type="button" className="back-button" onClick={() => setSelectedSymbol(null)}>← Back</button>
          <div className="detail-heading">
            <div>
              <p className="eyebrow">STOCK DETAIL</p>
              <h2 id="detail-heading">{selectedStock.name}</h2>
              <span className="detail-symbol">{selectedStock.symbol}</span>
            </div>
            <div className="detail-price">
              <strong>{selectedStock.price}</strong>
              <span className={selectedStock.positive ? 'change positive' : 'change negative'}>
                {selectedStock.change} today
              </span>
            </div>
          </div>

          <div className="detail-chart" aria-labelledby="detail-chart-title">
            <div className="chart-heading">
              <h3 id="detail-chart-title">Price history</h3>
              <div className="chart-controls">
                <span>30 days</span>
                <div className="chart-view-toggle" role="group" aria-label="Chart view">
                  <button
                    type="button"
                    className={chartMode === 'line' ? 'active' : ''}
                    aria-pressed={chartMode === 'line'}
                    onClick={() => setChartMode('line')}
                  >
                    Line
                  </button>
                  <button
                    type="button"
                    className={chartMode === 'candlestick' ? 'active' : ''}
                    aria-pressed={chartMode === 'candlestick'}
                    onClick={() => setChartMode('candlestick')}
                  >
                    Candlestick
                  </button>
                </div>
              </div>
            </div>
            {chartMode === 'candlestick' ? (
              <CandlestickChart data={ohlcHistory} stockName={selectedStock.name} />
            ) : (
              <div className="chart-canvas" role="img" aria-label={`${selectedStock.name} 30-day line price chart`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval={5} />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value}`}
                      width={54}
                    />
                    <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Price']} />
                    <Line type="monotone" dataKey="price" stroke="var(--green)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <form className="buy-form detail-buy-form" onSubmit={(event) => { event.preventDefault(); confirmBuy(selectedStock) }}>
            <div>
              <p className="eyebrow">PLACE AN ORDER</p>
              <h3>Buy {selectedStock.symbol}</h3>
            </div>
            <label htmlFor={`detail-investment-${selectedStock.symbol}`}>How much do you want to invest ($)?</label>
            <div className="buy-form-controls">
              <input
                id={`detail-investment-${selectedStock.symbol}`}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={investmentAmounts[selectedStock.symbol] || ''}
                onChange={(event) => updateInvestmentAmount(selectedStock.symbol, event.target.value)}
              />
              <button type="submit" className="confirm-button" disabled={!investmentAmounts[selectedStock.symbol] || Number(investmentAmounts[selectedStock.symbol]) <= 0}>
                Confirm buy
              </button>
            </div>
            {investmentAmounts[selectedStock.symbol] && Number(investmentAmounts[selectedStock.symbol]) > 0 && (
              <p className="fractional-preview">
                You will receive <strong>{(Number(investmentAmounts[selectedStock.symbol]) / Number.parseFloat(selectedStock.price.replace('$', ''))).toFixed(4)} shares</strong> of {selectedStock.symbol}.
              </p>
            )}
            {confirmedOrders[selectedStock.symbol] && <p className="confirmation-message">Purchase confirmed for {selectedStock.symbol}.</p>}
            {buyError[selectedStock.symbol] && <p className="buy-error">{buyError[selectedStock.symbol]}</p>}
          </form>
        </section>
      ) : (
        <>
      {activeTab === 'about' && (
        <section className="about-page" aria-labelledby="about-heading">
          <button
            type="button"
            className="back-button about-back-button"
            onClick={() => {
              setActiveTab(aboutReturnView.tab)
              setSelectedSymbol(aboutReturnView.selectedSymbol)
            }}
          >
            Back
          </button>
          <div className="about-content">
            <h2 id="about-heading">About Us</h2>
            <div className="about-introduction">
              <p>Welcome to our investment platform, where we believe in building financial opportunities through informed decisions, transparency, and responsible investing.</p>
              <p>Our mission is to provide individuals with access to investment opportunities while helping them understand the importance of financial planning, risk management, and long-term growth.</p>
              <p>We are committed to creating a professional and user-friendly platform where users can explore available investment options, monitor their investments, and access important information to make informed financial decisions.</p>
            </div>
            <section className="about-copy-section" aria-labelledby="about-mission-heading">
              <h3 id="about-mission-heading">Our Mission</h3>
              <p>Our mission is to make investment opportunities more accessible by providing a platform focused on transparency, reliability, and responsible financial growth.</p>
            </section>
            <section className="about-copy-section" aria-labelledby="about-vision-heading">
              <h3 id="about-vision-heading">Our Vision</h3>
              <p>We aim to build a trusted investment community where individuals can pursue their financial goals with confidence, knowledge, and a clear understanding of investment risks.</p>
            </section>
            <section className="about-copy-section" aria-labelledby="about-values-heading">
              <h3 id="about-values-heading">Our Core Values</h3>
              <ul>
                <li><strong>Transparency:</strong> We believe in clear communication and honest information.</li>
                <li><strong>Security:</strong> We value the protection of users' personal information and account data.</li>
                <li><strong>Responsibility:</strong> We encourage informed investment decisions and responsible risk management.</li>
                <li><strong>Innovation:</strong> We strive to provide a convenient and user-friendly investment experience.</li>
                <li><strong>Customer Support:</strong> We aim to provide helpful assistance and clear information to our users.</li>
              </ul>
            </section>
            <section className="about-copy-section" aria-labelledby="about-commitment-heading">
              <h3 id="about-commitment-heading">Our Commitment</h3>
              <p>We are dedicated to providing a professional investment experience built on trust, accountability, and continuous improvement. We encourage every user to understand the terms, potential returns, and risks associated with any investment before committing funds.</p>
            </section>
            <p className="about-closing">Your financial future deserves careful planning, informed decisions, and responsible investing.</p>
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <SettingsPage
          user={user}
          onBack={() => {
            setActiveTab(settingsReturnView.tab)
            setSelectedSymbol(settingsReturnView.selectedSymbol)
          }}
          onLogout={logOut}
        />
      )}

      {activeTab === 'profile' && (
        <Profile
          userId={user.id}
          avatarRefreshKey={avatarRefreshKey}
          onAvatarUpdated={() => setAvatarRefreshKey((key) => key + 1)}
        />
      )}

      {(activeTab === 'home' || activeTab === 'portfolio') && (
        <Portfolio holdings={Object.values(portfolio)} onSell={sellHolding} onStockSelect={setSelectedSymbol} />
      )}

      {(activeTab === 'home' || activeTab === 'watchlist') && (
      <section className="watchlist-section" aria-labelledby="watchlist-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PERSONAL PICKS</p>
            <h2 id="watchlist-heading">My Watchlist</h2>
          </div>
          <span className="count-label">{watchlistedStocks.length} saved</span>
        </div>
        {watchlistedStocks.length > 0 ? (
          <div className="stock-list">
            {watchlistedStocks.map((stock) => <StockCard key={stock.symbol} stock={stock} />)}
          </div>
        ) : (
          <p className="empty-state">Star a stock below to keep it close.</p>
        )}
      </section>
      )}

      {activeTab === 'home' && (
      <section className="stocks-section" aria-labelledby="stocks-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXPLORE</p>
            <h2 id="stocks-heading">All stocks</h2>
          </div>
          <span className="count-label">{stocks.length} symbols</span>
        </div>
        <div className="stock-list">
          {stocks.map((stock) => <StockCard key={stock.symbol} stock={stock} />)}
        </div>
      </section>
      )}
        </>
      )}
    </main>
  )
}

export default App
