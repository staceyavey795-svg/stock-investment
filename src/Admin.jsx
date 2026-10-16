import { useEffect, useState } from 'react'
import AdminSupport from './AdminSupport.jsx'
import { supabase } from './supabaseClient.js'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Date unavailable'
}

function normalizeAdminUser(row) {
  return {
    userId: row.user_id ?? row.id,
    email: row.email ?? '',
    username: row.username ?? '',
    balance: Number(row.balance ?? 0),
    joinedAt: row.created_at ?? row.joined_at ?? row.join_date ?? null,
  }
}

async function fetchAdminUsers() {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw error
  return (data ?? []).map(normalizeAdminUser)
}

async function fetchAmountTotal(table) {
  let total = 0
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('amount')
      .range(offset, offset + pageSize - 1)
    if (error) throw error

    for (const row of data ?? []) total += Number(row.amount ?? 0)
    if (!data || data.length < pageSize) return total
    offset += pageSize
  }
}

function DataSection({ title, rows, isLoading, error, emptyMessage, children }) {
  return (
    <section className="admin-card admin-data-section">
      <h3>{title}</h3>
      {isLoading ? (
        <p className="admin-state" role="status">Loading {title.toLowerCase()}...</p>
      ) : error ? (
        <p className="admin-error" role="alert">{error}</p>
      ) : rows.length ? children : (
        <p className="admin-state">{emptyMessage}</p>
      )}
    </section>
  )
}

function Admin({ onBack, user }) {
  const [page, setPage] = useState('overview')
  const [users, setUsers] = useState([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [usersError, setUsersError] = useState('')
  const [totals, setTotals] = useState({ deposits: null, withdrawals: null })
  const [isLoadingTotals, setIsLoadingTotals] = useState(true)
  const [totalsError, setTotalsError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailErrors, setDetailErrors] = useState({})
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [activity, setActivity] = useState([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentError, setAdjustmentError] = useState('')
  const [adjustmentSuccess, setAdjustmentSuccess] = useState('')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isAdjusting, setIsAdjusting] = useState(false)

  useEffect(() => {
    let isCurrent = true

    const loadUsers = async () => {
      setIsLoadingUsers(true)
      setUsersError('')
      try {
        const result = await fetchAdminUsers()
        if (isCurrent) setUsers(result)
      } catch (error) {
        if (isCurrent) setUsersError(error instanceof Error ? error.message : 'Could not load users.')
      } finally {
        if (isCurrent) setIsLoadingUsers(false)
      }
    }

    const loadTotals = async () => {
      setIsLoadingTotals(true)
      setTotalsError('')
      const [deposits, withdrawals] = await Promise.allSettled([
        fetchAmountTotal('deposits'),
        fetchAmountTotal('withdrawals'),
      ])
      if (!isCurrent) return

      if (deposits.status === 'fulfilled' && withdrawals.status === 'fulfilled') {
        setTotals({ deposits: deposits.value, withdrawals: withdrawals.value })
      } else {
        const failedResult = deposits.status === 'rejected' ? deposits : withdrawals
        setTotalsError(failedResult.reason instanceof Error ? failedResult.reason.message : 'Could not load transaction totals.')
      }
      setIsLoadingTotals(false)
    }

    loadUsers()
    loadTotals()
    return () => { isCurrent = false }
  }, [])

  const loadActivity = async () => {
    setPage('activity')
    setIsLoadingActivity(true)
    setActivityError('')
    try {
      const { data, error } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setActivity(data ?? [])
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Could not load the activity log.')
      setActivity([])
    } finally {
      setIsLoadingActivity(false)
    }
  }

  const openUser = async (adminUser) => {
    setSelectedUserId(adminUser.userId)
    setDetailData(null)
    setDetailErrors({})
    setIsLoadingDetails(true)
    setAdjustmentError('')
    setAdjustmentSuccess('')
    setPage('detail')

    const requests = await Promise.allSettled([
      supabase.from('holdings').select('symbol, name, quantity, avg_price').eq('user_id', adminUser.userId),
      supabase.from('trades').select('symbol, side, quantity, price, total, created_at').eq('user_id', adminUser.userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('deposits').select('amount, method, created_at').eq('user_id', adminUser.userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('withdrawals').select('amount, method, created_at').eq('user_id', adminUser.userId).order('created_at', { ascending: false }).limit(10),
    ])

    const sections = ['holdings', 'trades', 'deposits', 'withdrawals']
    const nextData = {}
    const nextErrors = {}
    requests.forEach((request, index) => {
      const section = sections[index]
      if (request.status === 'rejected') {
        nextErrors[section] = request.reason instanceof Error ? request.reason.message : `Could not load ${section}.`
      } else if (request.value.error) {
        nextErrors[section] = request.value.error.message
      } else {
        nextData[section] = request.value.data ?? []
      }
    })

    setDetailData(nextData)
    setDetailErrors(nextErrors)
    setIsLoadingDetails(false)
  }

  const refreshUsers = async () => {
    const nextUsers = await fetchAdminUsers()
    setUsers(nextUsers)
  }

  const requestAdjustment = (event) => {
    event.preventDefault()
    const delta = Number(adjustmentAmount)
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustmentError('Enter a non-zero adjustment amount.')
      return
    }
    if (adjustmentReason.trim().length < 3) {
      setAdjustmentError('Reason must be at least 3 characters.')
      return
    }
    setAdjustmentError('')
    setIsConfirmOpen(true)
  }

  const confirmAdjustment = async () => {
    const delta = Number(adjustmentAmount)
    setIsAdjusting(true)
    setAdjustmentError('')
    setAdjustmentSuccess('')
    try {
      const { error } = await supabase.rpc('admin_adjust_balance', {
        p_user: selectedUserId,
        p_delta: delta,
        p_reason: adjustmentReason.trim(),
      })
      if (error) throw error

      await refreshUsers()
      setAdjustmentSuccess('Balance updated successfully.')
      setAdjustmentAmount('')
      setAdjustmentReason('')
      setIsConfirmOpen(false)
    } catch (error) {
      setAdjustmentError(error instanceof Error ? error.message : 'Could not adjust the balance.')
      setIsConfirmOpen(false)
    } finally {
      setIsAdjusting(false)
    }
  }

  const selectedUser = users.find((adminUser) => adminUser.userId === selectedUserId)
  const filteredUsers = users.filter((adminUser) => (
    `${adminUser.email} ${adminUser.username} ${adminUser.userId}`.toLowerCase().includes(search.trim().toLowerCase())
  ))
  const totalBalance = users.reduce((total, adminUser) => total + (Number(adminUser.balance) || 0), 0)

  const showDashboard = () => setPage('overview')
  const renderRows = (rows, renderRow, emptyMessage) => rows?.length
    ? rows.map(renderRow)
    : <p className="admin-state">{emptyMessage}</p>

  return (
    <section className="admin-page" aria-labelledby="admin-heading">
      <button type="button" className="back-button admin-back-button" onClick={onBack}>Back</button>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="admin-heading">{page === 'detail' ? selectedUser?.email || 'User details' : page === 'activity' ? 'Activity log' : 'Admin panel'}</h2>
        </div>
        {page !== 'overview' && (
          <button type="button" className="fund-back-button" onClick={showDashboard}>Overview</button>
        )}
      </div>

      {page === 'overview' && (
        <>
          <div className="admin-metrics">
            <article className="admin-card admin-metric">
              <span>Total users</span>
              <strong>{isLoadingUsers ? 'Loading...' : usersError ? 'Unavailable' : users.length.toLocaleString()}</strong>
            </article>
            <article className="admin-card admin-metric">
              <span>Total wallet balances</span>
              <strong>{isLoadingUsers ? 'Loading...' : usersError ? 'Unavailable' : formatCurrency(totalBalance)}</strong>
            </article>
            <article className="admin-card admin-metric">
              <span>Total deposits</span>
              <strong>{isLoadingTotals ? 'Loading...' : totalsError ? 'Unavailable' : formatCurrency(totals.deposits)}</strong>
            </article>
            <article className="admin-card admin-metric">
              <span>Total withdrawals</span>
              <strong>{isLoadingTotals ? 'Loading...' : totalsError ? 'Unavailable' : formatCurrency(totals.withdrawals)}</strong>
            </article>
          </div>
          {(usersError || totalsError) && <p className="admin-error" role="alert">{usersError || totalsError}</p>}

          <section className="admin-card admin-users-card">
            <div className="admin-section-heading">
              <h3>Users</h3>
              <button type="button" className="fund-back-button" onClick={loadActivity}>Activity log</button>
            </div>
            <label className="admin-search-label" htmlFor="admin-user-search">Search users</label>
            <input
              id="admin-user-search"
              className="admin-search"
              type="search"
              placeholder="Email, username, or user ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {isLoadingUsers ? (
              <p className="admin-state" role="status">Loading users...</p>
            ) : usersError ? (
              <p className="admin-error" role="alert">{usersError}</p>
            ) : filteredUsers.length ? (
              <div className="admin-user-list">
                {filteredUsers.map((adminUser) => (
                  <button type="button" className="admin-user-row" key={adminUser.userId} onClick={() => openUser(adminUser)}>
                    <span className="admin-user-identity">
                      <strong>{adminUser.email || 'Email unavailable'}</strong>
                      <span>{adminUser.username || 'No username'} · Joined {formatDate(adminUser.joinedAt)}</span>
                    </span>
                    <strong>{formatCurrency(adminUser.balance)}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="admin-state">{search ? 'No users match your search.' : 'No users found.'}</p>
            )}
          </section>
          <AdminSupport adminId={user?.id} />
        </>
      )}

      {page === 'detail' && (
        <>
          {!selectedUser && usersError && <p className="admin-error" role="alert">{usersError}</p>}
          {selectedUser && (
            <>
              <section className="admin-card admin-user-summary">
                <div><span>Email</span><strong>{selectedUser.email || 'Unavailable'}</strong></div>
                <div><span>Username</span><strong>{selectedUser.username || 'Not set'}</strong></div>
                <div><span>Joined</span><strong>{formatDate(selectedUser.joinedAt)}</strong></div>
                <div><span>Balance</span><strong>{formatCurrency(selectedUser.balance)}</strong></div>
              </section>

              <section className="admin-card admin-adjust-card">
                <h3>Adjust balance</h3>
                <form className="admin-adjust-form" onSubmit={requestAdjustment}>
                  <label htmlFor="admin-adjust-amount">Amount</label>
                  <input
                    id="admin-adjust-amount"
                    type="number"
                    step="0.01"
                    placeholder="Positive adds, negative subtracts"
                    value={adjustmentAmount}
                    onChange={(event) => setAdjustmentAmount(event.target.value)}
                    required
                  />
                  <label htmlFor="admin-adjust-reason">Reason</label>
                  <textarea
                    id="admin-adjust-reason"
                    rows="3"
                    minLength="3"
                    value={adjustmentReason}
                    onChange={(event) => setAdjustmentReason(event.target.value)}
                    required
                  />
                  {adjustmentError && <p className="admin-error" role="alert">{adjustmentError}</p>}
                  {adjustmentSuccess && <p className="admin-success" role="status">{adjustmentSuccess}</p>}
                  <button type="submit" className="confirm-button">Review adjustment</button>
                </form>
              </section>

              <div className="admin-detail-grid">
                <DataSection title="Holdings" rows={detailData?.holdings} isLoading={isLoadingDetails} error={detailErrors.holdings} emptyMessage="This user has no holdings.">
                  <ul className="admin-record-list">
                    {renderRows(detailData?.holdings, (holding) => (
                      <li key={holding.symbol}>
                        <strong>{holding.symbol} · {holding.name}</strong>
                        <span>{Number(holding.quantity).toLocaleString()} shares at {formatCurrency(holding.avg_price)}</span>
                      </li>
                    ), 'This user has no holdings.')}
                  </ul>
                </DataSection>
                <DataSection title="Recent trades" rows={detailData?.trades} isLoading={isLoadingDetails} error={detailErrors.trades} emptyMessage="This user has no recent trades.">
                  <ul className="admin-record-list">
                    {renderRows(detailData?.trades, (trade, index) => (
                      <li key={`${trade.symbol}-${trade.created_at}-${index}`}>
                        <strong>{trade.side} {trade.symbol}</strong>
                        <span>{Number(trade.quantity).toLocaleString()} shares · {formatCurrency(trade.total)} · {formatDate(trade.created_at)}</span>
                      </li>
                    ), 'This user has no recent trades.')}
                  </ul>
                </DataSection>
                <DataSection title="Deposits" rows={detailData?.deposits} isLoading={isLoadingDetails} error={detailErrors.deposits} emptyMessage="This user has no deposits.">
                  <ul className="admin-record-list">
                    {renderRows(detailData?.deposits, (deposit, index) => (
                      <li key={`${deposit.created_at}-${index}`}>
                        <strong>{formatCurrency(deposit.amount)}</strong>
                        <span>{deposit.method} · {formatDate(deposit.created_at)}</span>
                      </li>
                    ), 'This user has no deposits.')}
                  </ul>
                </DataSection>
                <DataSection title="Withdrawals" rows={detailData?.withdrawals} isLoading={isLoadingDetails} error={detailErrors.withdrawals} emptyMessage="This user has no withdrawals.">
                  <ul className="admin-record-list">
                    {renderRows(detailData?.withdrawals, (withdrawal, index) => (
                      <li key={`${withdrawal.created_at}-${index}`}>
                        <strong>{formatCurrency(withdrawal.amount)}</strong>
                        <span>{withdrawal.method} · {formatDate(withdrawal.created_at)}</span>
                      </li>
                    ), 'This user has no withdrawals.')}
                  </ul>
                </DataSection>
              </div>
            </>
          )}
          {isLoadingDetails && <p className="admin-state" role="status">Loading user details...</p>}
        </>
      )}

      {page === 'activity' && (
        <section className="admin-card admin-activity-card">
          <h3>Latest 50 actions</h3>
          {isLoadingActivity ? (
            <p className="admin-state" role="status">Loading activity...</p>
          ) : activityError ? (
            <p className="admin-error" role="alert">{activityError}</p>
          ) : activity.length ? (
            <ul className="admin-record-list">
              {activity.map((item, index) => {
                const target = item.target_user_email ?? item.target_user ?? item.target_user_id ?? 'Not specified'
                const details = typeof item.details === 'string' ? item.details : JSON.stringify(item.details ?? {})
                const time = item.created_at ?? item.time
                return (
                  <li key={item.id ?? `${item.action}-${time}-${index}`}>
                    <strong>{item.action ?? 'Action'}</strong>
                    <span>Target: {target}</span>
                    <span>{details}</span>
                    <time dateTime={time}>{formatDate(time)}</time>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="admin-state">No admin actions recorded.</p>
          )}
        </section>
      )}

      {isConfirmOpen && selectedUser && (
        <div className="admin-dialog-backdrop">
          <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-heading">
            <h3 id="admin-confirm-heading">Confirm balance adjustment</h3>
            <p><strong>User:</strong> {selectedUser.email}</p>
            <p><strong>Amount:</strong> {formatCurrency(adjustmentAmount)}</p>
            <p><strong>Reason:</strong> {adjustmentReason.trim()}</p>
            <div className="admin-dialog-actions">
              <button type="button" className="fund-back-button" onClick={() => setIsConfirmOpen(false)} disabled={isAdjusting}>Cancel</button>
              <button type="button" className="confirm-button" onClick={confirmAdjustment} disabled={isAdjusting}>
                {isAdjusting ? 'Applying...' : 'Confirm adjustment'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Admin