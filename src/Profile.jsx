import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import { supabase } from './supabaseClient.js'

function Profile({ userId, avatarRefreshKey, onAvatarUpdated }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
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
            <Avatar userId={userId} refreshKey={avatarRefreshKey} />
            <span className="profile-avatar-camera" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
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

      {isLoading ? (
        <p className="empty-state" role="status">Loading your profile...</p>
      ) : (
        errorMessage ? (
          <p className="auth-error" role="alert">{errorMessage}</p>
        ) : (
          <div className="auth-panel profile-panel">
            <div className="profile-detail">
              <h3>Full Name</h3>
              <p>{fullName || 'Not provided'}</p>
            </div>
            <div className="profile-detail">
              <h3>Username</h3>
              <p>{username || 'Not provided'}</p>
            </div>
          </div>
        )
      )}
    </section>
  )
}

export default Profile