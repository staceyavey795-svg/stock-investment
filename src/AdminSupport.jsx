import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import './Support.css'

const MESSAGE_COLUMNS = 'id, thread_user_id, sender_id, sender_role, body, read_at, created_at'

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Time unavailable'
}

function normalizeThread(row) {
  return {
    userId: row.thread_user_id ?? row.user_id,
    email: row.email ?? row.user_email ?? '',
    username: row.username ?? row.user_username ?? '',
    lastMessage: row.last_message ?? row.last_message_body ?? '',
    lastMessageAt: row.last_message_at ?? row.last_created_at ?? row.created_at ?? null,
    unreadCount: Number(row.unread_count ?? row.unread ?? 0),
  }
}

function mergeMessage(messages, nextMessage) {
  if (messages.some((message) => message.id === nextMessage.id)) return messages
  return [...messages, nextMessage].sort((first, second) => new Date(first.created_at) - new Date(second.created_at))
}

function SupportMessages({ messages, isLoading, error, emptyMessage }) {
  if (isLoading) return <p className="support-chat-state" role="status">Loading messages...</p>
  if (error) return <p className="support-chat-error" role="alert">{error}</p>
  if (!messages.length) return <p className="support-chat-state">{emptyMessage}</p>

  return messages.map((message, index) => (
    <article
      key={message.id ?? `${message.created_at}-${index}`}
      className={`support-message ${message.sender_role === 'admin' ? 'is-user' : 'is-support'}`}
    >
      <p>{message.body}</p>
      <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
    </article>
  ))
}

function AdminSupport({ adminId }) {
  const [view, setView] = useState('card')
  const [threads, setThreads] = useState([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [threadsError, setThreadsError] = useState('')
  const [search, setSearch] = useState('')
  const [activeThread, setActiveThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [reply, setReply] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const newestMessageRef = useRef(null)

  useEffect(() => {
    if (!adminId) return undefined

    let isCurrent = true
    const loadThreads = async () => {
      try {
        const { data, error } = await supabase.rpc('admin_support_threads')
        if (error) throw error
        if (isCurrent) {
          setThreads((data ?? []).map(normalizeThread))
          setThreadsError('')
        }
      } catch (error) {
        if (isCurrent) setThreadsError(error instanceof Error ? error.message : 'Could not load support conversations.')
      } finally {
        if (isCurrent) setIsLoadingThreads(false)
      }
    }

    loadThreads()
    const channel = supabase
      .channel(`admin-support-inbox-${adminId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_messages',
      }, () => loadThreads())
      .subscribe()

    return () => {
      isCurrent = false
      supabase.removeChannel(channel)
    }
  }, [adminId])

  useEffect(() => {
    const threadUserId = activeThread?.userId
    if (!threadUserId || !adminId) return undefined

    let isCurrent = true

    const markRead = async () => {
      const { error } = await supabase.rpc('support_mark_read', { p_thread: threadUserId })
      if (isCurrent && error) setMessagesError(error.message)
      if (!error && isCurrent) {
        setThreads((currentThreads) => currentThreads.map((thread) => (
          thread.userId === threadUserId ? { ...thread, unreadCount: 0 } : thread
        )))
      }
    }

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('support_messages')
          .select(MESSAGE_COLUMNS)
          .eq('thread_user_id', threadUserId)
          .order('created_at', { ascending: true })
        if (error) throw error
        if (isCurrent) setMessages(data ?? [])
      } catch (error) {
        if (isCurrent) setMessagesError(error instanceof Error ? error.message : 'Could not load this conversation.')
      } finally {
        if (isCurrent) setIsLoadingMessages(false)
      }
    }

    const channel = supabase
      .channel(`admin-support-thread-${threadUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_user_id=eq.${threadUserId}`,
      }, (payload) => {
        if (!isCurrent) return
        setMessages((currentMessages) => mergeMessage(currentMessages, payload.new))
        markRead()
      })
      .subscribe()

    loadMessages()
    markRead()

    return () => {
      isCurrent = false
      supabase.removeChannel(channel)
    }
  }, [activeThread?.userId, adminId])

  useEffect(() => {
    newestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, view])

  const openThread = (thread) => {
    setActiveThread(thread)
    setMessages([])
    setIsLoadingMessages(true)
    setMessagesError('')
    setSendError('')
    setView('conversation')
  }

  const sendReply = async (event) => {
    event.preventDefault()
    const body = reply.trim()
    if (!activeThread?.userId || !adminId || !body || body.length > 2000 || isSending) return

    setIsSending(true)
    setSendError('')
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          thread_user_id: activeThread.userId,
          sender_id: adminId,
          sender_role: 'admin',
          body,
        })
        .select(MESSAGE_COLUMNS)
        .single()
      if (error) throw error
      setMessages((currentMessages) => mergeMessage(currentMessages, data))
      setReply('')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send the reply.')
    } finally {
      setIsSending(false)
    }
  }

  const unreadTotal = threads.reduce((total, thread) => total + thread.unreadCount, 0)
  const filteredThreads = threads.filter((thread) => thread.email.toLowerCase().includes(search.trim().toLowerCase()))

  if (view === 'card') {
    return (
      <section className="admin-card support-inbox-card">
        <div>
          <h3>Support inbox</h3>
          <p className="admin-state">Customer conversations and replies</p>
        </div>
        <div className="support-inbox-card-actions">
          <span className="support-unread-badge" aria-label={`${unreadTotal} unread messages`}>{unreadTotal}</span>
          <button type="button" className="confirm-button" onClick={() => setView('inbox')}>Open inbox</button>
        </div>
      </section>
    )
  }

  if (view === 'inbox') {
    return (
      <section className="admin-card support-inbox-page">
        <div className="support-inbox-heading">
          <button type="button" className="back-button" onClick={() => setView('card')}>Back</button>
          <h3>Support inbox</h3>
          <span className="support-unread-badge">{unreadTotal} unread</span>
        </div>
        <label className="admin-search-label" htmlFor="support-thread-search">Search by email</label>
        <input
          id="support-thread-search"
          className="admin-search"
          type="search"
          placeholder="Email address"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {isLoadingThreads ? (
          <p className="admin-state" role="status">Loading conversations...</p>
        ) : threadsError ? (
          <p className="admin-error" role="alert">{threadsError}</p>
        ) : filteredThreads.length ? (
          <div className="support-thread-list">
            {filteredThreads.map((thread) => (
              <button type="button" className="support-thread-row" key={thread.userId} onClick={() => openThread(thread)}>
                <span className="support-thread-copy">
                  <strong>{thread.email || 'Email unavailable'}{thread.username ? ` · ${thread.username}` : ''}</strong>
                  <span>{thread.lastMessage || 'No messages yet'}</span>
                  <time dateTime={thread.lastMessageAt}>{formatDate(thread.lastMessageAt)}</time>
                </span>
                {thread.unreadCount > 0 && <span className="support-unread-badge">{thread.unreadCount}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="admin-state">{search ? 'No conversations match this email.' : 'No support conversations yet.'}</p>
        )}
      </section>
    )
  }

  return (
    <section className="admin-card support-admin-conversation">
      <header className="support-admin-heading">
        <button type="button" className="back-button" onClick={() => { setActiveThread(null); setView('inbox') }}>Back</button>
        <div>
          <h3>{activeThread?.email || 'Support conversation'}</h3>
          {activeThread?.username && <p className="admin-state">{activeThread.username}</p>}
        </div>
      </header>
      <div className="support-admin-messages" aria-live="polite">
        <SupportMessages
          messages={messages}
          isLoading={isLoadingMessages}
          error={messagesError}
          emptyMessage="No messages in this conversation yet."
        />
        <div ref={newestMessageRef} />
      </div>
      {sendError && <p className="support-chat-error" role="alert">{sendError}</p>}
      <form className="support-chat-compose" onSubmit={sendReply}>
        <label className="support-chat-label" htmlFor="admin-support-reply">Reply</label>
        <textarea
          id="admin-support-reply"
          rows="3"
          maxLength={2000}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Write a reply..."
          disabled={isSending}
        />
        <div className="support-chat-compose-footer">
          <span>{reply.length}/2000</span>
          <button type="submit" className="confirm-button" disabled={!reply.trim() || isSending}>
            {isSending ? 'Sending...' : 'Send reply'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default AdminSupport