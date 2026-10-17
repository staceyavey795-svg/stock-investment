import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'

function Avatar({ userId, refreshKey = 0, className = '', label = 'Profile picture', fallbackName = '' }) {
  const [avatarUrl, setAvatarUrl] = useState('')
  const nameParts = fallbackName.trim().split(/\s+/).filter(Boolean)
  const initials = nameParts.length > 1
    ? nameParts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
    : (nameParts[0] ?? '').slice(0, 2).toUpperCase()

  useEffect(() => {
    let isMounted = true

    const loadAvatar = async () => {
      if (!userId) {
        setAvatarUrl('')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle()

      if (isMounted) setAvatarUrl(error ? '' : data?.avatar_url ?? '')
    }

    loadAvatar()

    return () => {
      isMounted = false
    }
  }, [userId, refreshKey])

  return (
    <div className={`user-avatar ${className}`.trim()} role="img" aria-label={label}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" />
      ) : initials ? (
        <span className="user-avatar-initials" aria-hidden="true">{initials}</span>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 21a7.5 7.5 0 0115 0" />
        </svg>
      )}
    </div>
  )
}

export default Avatar