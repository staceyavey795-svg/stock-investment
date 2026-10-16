import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import './Support.css'

const MESSAGE_COLUMNS = 'id, thread_user_id, sender_id, sender_role, body, read_at, created_at'

function mergeMessage(messages, nextMessage) {
  if (messages.some((message) => message.id === nextMessage.id)) return messages
  return [...messages, nextMessage].sort((first, second) => new Date(first.created_at) - new Date(second.created_at))
}

function messageTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
}

function ChatBubble({ user }) {
  const userId = user?.id
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const newestMessageRef = useRef(null)

  useEffect(() => {
    if (!userId) return undefined

    let isCurrent = true
    const loadUnread = async () => {
      if (isOpen) return
      const { count, error: unreadError } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_user_id', userId)
        .eq('sender_role', 'admin')
        .is('read_at', null)
      if (isCurrent && !unreadError) setUnreadCount(count ?? 0)
    }

    if (!isOpen) loadUnread()
    window.addEventListener('focus', loadUnread)
    return () => {
      isCurrent = false
      window.removeEventListener('focus', loadUnread)
    }
  }, [userId, isOpen])

  useEffect(() => {
    if (!userId || !isOpen) return undefined

    let isCurrent = true

    const markRead = async () => {
      const { error: readError } = await supabase.rpc('support_mark_read', { p_thread: userId })
      if (!isCurrent) return
      if (readError) setError(readError.message)
      else setUnreadCount(0)
    }

    const loadMessages = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('support_messages')
          .select(MESSAGE_COLUMNS)
          .eq('thread_user_id', userId)
          .order('created_at', { ascending: true })
        if (loadError) throw loadError
        if (isCurrent) setMessages(data ?? [])
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Could not load your messages.')
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    const channel = supabase
      .channel(`support-user-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_user_id=eq.${userId}`,
      }, (payload) => {
        if (!isCurrent) return
        setMessages((currentMessages) => mergeMessage(currentMessages, payload.new))
        if (payload.new.sender_role === 'admin') markRead()
      })
      .subscribe()

    loadMessages()
    markRead()

    return () => {
      isCurrent = false
      supabase.removeChannel(channel)
    }
  }, [userId, isOpen])

  useEffect(() => {
    newestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isOpen])

  const sendMessage = async (event) => {
    event.preventDefault()
    const messageBody = body.trim()
    if (!userId || !messageBody || messageBody.length > 2000 || isSending) return

    setIsSending(true)
    setError('')
    try {
      const { data, error: sendError } = await supabase
        .from('support_messages')
        .insert({
          thread_user_id: userId,
          sender_id: userId,
          sender_role: 'user',
          body: messageBody,
        })
        .select(MESSAGE_COLUMNS)
        .single()
      if (sendError) throw sendError
      setMessages((currentMessages) => mergeMessage(currentMessages, data))
      setBody('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send your message.')
    } finally {
      setIsSending(false)
    }
  }

  const openChat = () => {
    setIsLoading(true)
    setError('')
    setIsOpen(true)
  }

  if (!userId) return null

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          className="support-chat-bubble"
          aria-label={unreadCount ? `Open Customer Care, ${unreadCount} unread replies` : 'Open Customer Care chat'}
          onClick={openChat}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5h-7L5 20v-4.5a2.5 2.5 0 01-1-2z" /></svg>
          {unreadCount > 0 && <span className="support-chat-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
      )}

      {isOpen && (
        <section className="support-chat-panel" aria-labelledby="support-chat-title">
          <header className="support-chat-header">
            <div>
              <p className="eyebrow">CUSTOMER CARE</p>
              <h2 id="support-chat-title">Customer Care</h2>
            </div>
            <button type="button" className="support-chat-close" aria-label="Close Customer Care" onClick={() => setIsOpen(false)}>×</button>
          </header>
          <p className="support-chat-notice">Never share your PIN or password. We will never ask for it.</p>
          <div className="support-chat-messages" aria-live="polite">
            {isLoading ? (
              <p className="support-chat-state" role="status">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="support-chat-state">Hi! How can we help you today?</p>
            ) : (
              messages.map((message) => (
                <article key={message.id} className={`support-message ${message.sender_role === 'user' ? 'is-user' : 'is-support'}`}>
                  <p>{message.body}</p>
                  <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
                </article>
              ))
            )}
            <div ref={newestMessageRef} />
          </div>
          {error && <p className="support-chat-error" role="alert">{error}</p>}
          <form className="support-chat-compose" onSubmit={sendMessage}>
            <label className="support-chat-label" htmlFor="customer-care-message">Message</label>
            <textarea
              id="customer-care-message"
              rows="3"
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a message..."
              disabled={isSending}
            />
            <div className="support-chat-compose-footer">
              <span>{body.length}/2000</span>
              <button type="submit" className="confirm-button" disabled={!body.trim() || isSending}>
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  )
}

export default ChatBubble