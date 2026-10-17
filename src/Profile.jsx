import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import { supabase } from './supabaseClient.js'

function Profile({ userId, email, avatarRefreshKey, onAvatarUpdated, onBack, onSettings, onLogout }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [savedUsername, setSavedUsername] = useState('')
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const fileInputRef = useRef(null)

  const uploadAvatar = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Choose an image file to upload.')
      return
    }

    setIsUploading(true)
    setErrorMessage('')

    try {
      const filePath = `${userId}/${Date.now()}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { contentType: file.type, cacheControl: '3600' })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', userId)
        .select('id')
        .single()

      if (profileError) throw profileError
      onAvatarUpdated()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload your profile picture.')
    } finally {
      setIsUploading(false)
    }
  }

  const saveUsername = async (event) => {
    event.preventDefault()
    const nextUsername = username.trim()
    if (!nextUsername) return

    setIsSavingUsername(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ username: nextUsername })
        .eq('id', userId)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Your profile could not be found.')
      setUsername(nextUsername)
      setSavedUsername(nextUsername)
      setIsEditingUsername(false)
      setSuccessMessage('Username saved successfully.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your username.')
    } finally {
      setIsSavingUsername(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      setErrorMessage('')

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', userId)
          .maybeSingle()

        if (error) throw error
        if (!isMounted) return

        setFullName(data?.full_name ?? '')
        setUsername(data?.username ?? '')
        setSavedUsername(data?.username ?? '')
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load your profile.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [userId])

  return (
    <section className="profile-section" aria-labelledby="profile-heading">
      <button type="button" className="back-button profile-back-button" onClick={onBack}>Back</button>
      <div className="section-heading profile-heading">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h2 id="profile-heading">Your profile</h2>
        </div>
        <div className="profile-avatar-control">
          <button
            type="button"
            className="profile-avatar-button"
            aria-label={isUploading ? 'Uploading profile picture' : 'Change profile picture'}
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
          >
            <Avatar userId={userId} refreshKey={avatarRefreshKey} fallbackName={fullName || savedUsername || email || ''} />
            <span className="profile-avatar-camera" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className="profile-photo-change-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
          >
            {isUploading ? 'Uploading...' : 'Change photo'}
          </button>
          <input
            ref={fileInputRef}
            className="profile-avatar-input"
            type="file"
            accept="image/*"
            aria-label="Choose a profile picture"
            onChange={uploadAvatar}
            disabled={isLoading || isUploading}
          />
        </div>
      </div>

      {isLoading ? <p className="empty-state" role="status">Loading your profile...</p> : (
        <div className="auth-panel profile-panel">
          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
          <div className="profile-detail">
            <h3>Full Name</h3>
            <p>{fullName || 'Not provided'}</p>
          </div>
          <div className="profile-detail">
            <h3>Email</h3>
            <p>{email || 'Not provided'}</p>
          </div>
          <div className="profile-detail">
            <h3>Username</h3>
            {isEditingUsername ? (
              <form className="settings-username-editor" onSubmit={saveUsername}>
                <input
                  id="profile-username"
                  type="text"
                  autoComplete="username"
                  aria-label="Username"
                  value={username}
                  onChange={(event) => { setUsername(event.target.value); setSuccessMessage('') }}
                  required
                  disabled={isSavingUsername}
                  autoFocus
                />
                <button type="submit" className="settings-icon-button settings-confirm-button" aria-label="Confirm username" title="Confirm" disabled={isSavingUsername || !username.trim()}>✓</button>
                <button
                  type="button"
                  className="settings-icon-button settings-cancel-button"
                  aria-label="Cancel username edit"
                  title="Cancel"
                  disabled={isSavingUsername}
                  onClick={() => { setUsername(savedUsername); setIsEditingUsername(false); setErrorMessage(''); setSuccessMessage('') }}
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
                  onClick={() => { setUsername(savedUsername); setIsEditingUsername(true); setErrorMessage(''); setSuccessMessage('') }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
          {successMessage && <p className="confirmation-message" role="status">{successMessage}</p>}
        </div>
      )}

      <div className="profile-navigation-actions">
        <button type="button" className="fund-back-button" onClick={onSettings}>Settings</button>
        <button type="button" className="settings-logout-button" onClick={onLogout}>Log out</button>
      </div>
    </section>
  )
}

export default Profile