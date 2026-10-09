import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'

function Settings({ onBack }) {
  const [profileId, setProfileId] = useState(null)
  const [username, setUsername] = useState('')
  const [savedUsername, setSavedUsername] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadUsername = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) throw new Error('You must be logged in to view settings.')

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
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load settings.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadUsername()

    return () => {
      isMounted = false
    }
  }, [])

  const saveUsername = async (event) => {
    event.preventDefault()
    if (!profileId) return

    const nextUsername = username.trim()
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

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
      setIsEditing(false)
      setSuccessMessage('Username saved successfully.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your username.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-heading">
      <button type="button" className="back-button settings-back-button" onClick={onBack}>Back</button>
      <p className="eyebrow">ACCOUNT</p>
      <h2 id="settings-heading">Settings</h2>

      {isLoading ? (
        <p className="empty-state" role="status">Loading settings...</p>
      ) : (
        <div className="auth-panel profile-panel settings-form">
          <div className="settings-username-block">
            <h3>Username</h3>
            {isEditing ? (
              <form className="settings-username-editor" onSubmit={saveUsername}>
                <input
                  id="settings-username"
                  type="text"
                  autoComplete="username"
                  aria-label="Username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setSuccessMessage('')
                  }}
                  required
                  disabled={isSaving || !profileId}
                  autoFocus
                />
                <button
                  type="submit"
                  className="settings-icon-button settings-confirm-button"
                  aria-label="Confirm username"
                  title="Confirm"
                  disabled={isSaving || !profileId || !username.trim()}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="settings-icon-button settings-cancel-button"
                  aria-label="Cancel username edit"
                  title="Cancel"
                  disabled={isSaving}
                  onClick={() => {
                    setUsername(savedUsername)
                    setIsEditing(false)
                    setErrorMessage('')
                    setSuccessMessage('')
                  }}
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
                  onClick={() => {
                    setUsername(savedUsername)
                    setIsEditing(true)
                    setErrorMessage('')
                    setSuccessMessage('')
                  }}
                  disabled={!profileId}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
          {successMessage && <p className="confirmation-message" role="status">{successMessage}</p>}
        </div>
      )}
    </section>
  )
}

export default Settings