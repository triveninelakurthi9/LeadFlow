'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Won' | 'Lost';

type Discussion = {
  id: string;
  lead_id: string;
  note: string;
  created_at: string;
  follow_up_at?: string | null;
};

type Lead = {
  id: string;
  name: string;
  company: string;
  phone: string;
  status: LeadStatus;
  follow_up_at?: string | null;
  created_at: string;
  updated_at: string;
  last_discussion?: { note: string; created_at: string } | null;
};

const STATUSES: LeadStatus[] = [
  'New',
  'Contacted',
  'Qualified',
  'Proposal Sent',
  'Won',
  'Lost',
];

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function timeAgo(value?: string | null) {
  if (!value) return 'No discussions yet';

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  );

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function dayLabel(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sameDay(value: string, date: Date) {
  const valueDate = new Date(value);

  return (
    valueDate.getFullYear() === date.getFullYear() &&
    valueDate.getMonth() === date.getMonth() &&
    valueDate.getDate() === date.getDate()
  );
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState('All leads');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', company: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      setLeads(await request<Lead[]>('/api/leads'));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load leads. Is the API running?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    return leads
      .filter((lead) => {
        const matchesFilter =
          filter === 'All leads' || lead.status === filter;
        const matchesSearch = `${lead.name} ${lead.company}`
          .toLowerCase()
          .includes(search.toLowerCase());

        return matchesFilter && matchesSearch;
      })
      .sort((a, b) => {
        const aHasFollowUpToday =
          a.follow_up_at && sameDay(a.follow_up_at, new Date()) ? 0 : 1;
        const bHasFollowUpToday =
          b.follow_up_at && sameDay(b.follow_up_at, new Date()) ? 0 : 1;

        if (aHasFollowUpToday !== bHasFollowUpToday) {
          return aHasFollowUpToday - bHasFollowUpToday;
        }

        return (
          new Date(b.updated_at).getTime() -
          new Date(a.updated_at).getTime()
        );
      });
  }, [leads, filter, search]);

  const todaysFollowUps = visible.filter(
    (lead) => lead.follow_up_at && sameDay(lead.follow_up_at, new Date())
  );

  const overdueCount = leads.filter((lead) => {
    if (!lead.follow_up_at) return false;

    const isOverdue = new Date(lead.follow_up_at) < new Date();
    const isToday = sameDay(lead.follow_up_at, new Date());
    const isClosed = ['Won', 'Lost'].includes(lead.status);

    return isOverdue && !isToday && !isClosed;
  }).length;

  async function openLead(lead: Lead) {
    setSelected(lead);
    setNote('');
    setFollowUp('');

    try {
      setDiscussions(
        await request<Discussion[]>(`/api/leads/${lead.id}/discussions`)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load timeline');
    }
  }

  async function addLead(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await request<Lead>('/api/leads', {
        method: 'POST',
        body: JSON.stringify(newLead),
      });

      setNewLead({ name: '', company: '', phone: '' });
      setShowAdd(false);
      setToast('Lead added successfully');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create lead');
    } finally {
      setSaving(false);
    }
  }

  async function saveDiscussion(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !note.trim()) return;

    setSaving(true);
    setError('');

    try {
      const body: { note: string; follow_up_at?: string } = {
        note: note.trim(),
      };

      if (followUp) {
        body.follow_up_at = new Date(followUp).toISOString();
      }

      await request<Discussion>(`/api/leads/${selected.id}/discussions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setNote('');
      setFollowUp('');
      setDiscussions(
        await request<Discussion[]>(`/api/leads/${selected.id}/discussions`)
      );
      await refresh();
      setToast('Discussion saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save discussion');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: string) {
    if (!selected) return;

    setSaving(true);

    try {
      const updatedLead = await request<Lead>(`/api/leads/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      setSelected(updatedLead);
      await refresh();
      setToast('Status updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">L</span>
          <span>
            leadflow<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="topbar-right">
          <span className="workspace-label">
            <span className="online-dot" />
            LeadFlow CRM
          </span>
          <div className="avatar">LF</div>
        </div>
      </header>

      <section className="content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              SALES WORKSPACE <span> / </span> LEADS
            </div>
            <h1>Your leads, in good hands.</h1>
            <p className="subtitle">
              Build relationships. Keep every conversation moving.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setError('');
              setShowAdd(true);
            }}
          >
            <span className="plus">＋</span> Add lead
          </button>
        </div>

        <div className="stats">
          <div className="stat-card">
            <span className="stat-label">Total leads</span>
            <strong>{leads.length.toString().padStart(2, '0')}</strong>
            <span className="stat-note">In your workspace</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Today's follow-ups</span>
            <strong>
              {leads
                .filter(
                  (lead) =>
                    lead.follow_up_at &&
                    sameDay(lead.follow_up_at, new Date())
                )
                .length.toString()
                .padStart(2, '0')}
            </strong>
            <span className="stat-note">Conversations to continue</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Needs attention</span>
            <strong className={overdueCount ? 'red-number' : ''}>
              {overdueCount.toString().padStart(2, '0')}
            </strong>
            <span className="stat-note">Overdue follow-ups</span>
          </div>

          <div className="stat-card stat-highlight">
            <span className="stat-label">A little reminder</span>
            <strong className="stat-message">Consistency builds trust.</strong>
            <span className="stat-note">Every follow-up matters.</span>
          </div>
        </div>

        {error && (
          <div className="alert" role="alert">
            <span>!</span>
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <section className="list-panel">
          <div className="list-header">
            <div>
              <h2>
                All leads <span className="count-pill">{visible.length}</span>
              </h2>
              <p>A clear view of every relationship you're building.</p>
            </div>

            <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search leads or companies…"
                aria-label="Search leads"
              />
              <kbd>⌘ K</kbd>
            </div>
          </div>

          <div className="filters">
            <button
              className={filter === 'All leads' ? 'filter active' : 'filter'}
              onClick={() => setFilter('All leads')}
            >
              All leads
            </button>

            {STATUSES.map((status) => (
              <button
                key={status}
                className={filter === status ? 'filter active' : 'filter'}
                onClick={() => setFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="empty-state">
              <span className="spinner" />
              Loading your leads…
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <strong>{search ? 'No leads found' : 'A fresh start'}</strong>
              <p>
                {search
                  ? 'Try another name or company.'
                  : 'Add your first lead to start building relationships.'}
              </p>
              {!search && (
                <button
                  className="secondary-button"
                  onClick={() => setShowAdd(true)}
                >
                  Add your first lead
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>LEAD</th>
                    <th>STATUS</th>
                    <th>LAST DISCUSSION</th>
                    <th>LAST ACTIVE</th>
                    <th>FOLLOW-UP</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {visible.map((lead) => {
                    const overdue =
                      !!lead.follow_up_at &&
                      new Date(lead.follow_up_at) < new Date() &&
                      !sameDay(lead.follow_up_at, new Date()) &&
                      !['Won', 'Lost'].includes(lead.status);

                    const isToday =
                      !!lead.follow_up_at &&
                      sameDay(lead.follow_up_at, new Date());

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => void openLead(lead)}
                        className="lead-row"
                      >
                        <td>
                          <div className="person-cell">
                            <div
                              className={`person-avatar avatar-${lead.name.charCodeAt(0) % 5}`}
                            >
                              {lead.name
                                .split(' ')
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </div>
                            <div>
                              <strong>{lead.name}</strong>
                              <span>{lead.company || 'Independent'}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`status status-${lead.status
                              .toLowerCase()
                              .replaceAll(' ', '-')}`}
                          >
                            <i />
                            {lead.status}
                          </span>
                        </td>

                        <td className="last-note">
                          {lead.last_discussion?.note || (
                            <span className="muted">No discussion yet</span>
                          )}
                        </td>

                        <td className="time-cell">
                          {timeAgo(lead.last_discussion?.created_at)}
                        </td>

                        <td>
                          {lead.follow_up_at ? (
                            <span
                              className={`followup ${
                                overdue
                                  ? 'overdue'
                                  : isToday
                                    ? 'due-today'
                                    : ''
                              }`}
                            >
                              <span>
                                {overdue ? '!' : isToday ? '◷' : '↗'}
                              </span>
                              {overdue
                                ? 'Overdue'
                                : isToday
                                  ? `Today, ${new Date(
                                      lead.follow_up_at
                                    ).toLocaleTimeString([], {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}`
                                  : dayLabel(lead.follow_up_at)}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>

                        <td>
                          <button
                            className="row-arrow"
                            aria-label={`Open ${lead.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void openLead(lead);
                            }}
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {todaysFollowUps.length > 0 && (
            <div className="pinned-note">
              <span className="pin-icon">⌖</span>
              <div>
                <strong>
                  {todaysFollowUps.length} follow-up
                  {todaysFollowUps.length === 1 ? '' : 's'} today
                </strong>
                <span>
                  Today's conversations are prioritized at the top of your list.
                </span>
              </div>
            </div>
          )}
        </section>

        <footer>
          <span>© 2026 LeadFlow</span>
          <span>
            Made for thoughtful follow-through <b>✳</b>
          </span>
        </footer>
      </section>

      {showAdd && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAdd(false);
          }}
        >
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">NEW RELATIONSHIP</div>
                <h2 id="add-title">Add a lead</h2>
                <p>Start with the basics. You can add context later.</p>
              </div>
              <button
                className="close-button"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={addLead} className="form-stack">
              <label>
                Full name <span>*</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={newLead.name}
                  onChange={(event) =>
                    setNewLead({ ...newLead, name: event.target.value })
                  }
                  placeholder="e.g. Sarah Connor"
                />
              </label>

              <label>
                Company <small>Optional</small>
                <input
                  maxLength={120}
                  value={newLead.company}
                  onChange={(event) =>
                    setNewLead({ ...newLead, company: event.target.value })
                  }
                  placeholder="Company or organization"
                />
              </label>

              <label>
                Phone <small>Optional</small>
                <input
                  maxLength={40}
                  value={newLead.phone}
                  onChange={(event) =>
                    setNewLead({ ...newLead, phone: event.target.value })
                  }
                  placeholder="Phone number"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="primary-button"
                  type="submit"
                >
                  {saving ? 'Saving…' : 'Create lead'} <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="modal timeline-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-title"
          >
            <div className="timeline-top">
              <div className="timeline-person">
                <div
                  className={`person-avatar big avatar-${selected.name.charCodeAt(0) % 5}`}
                >
                  {selected.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <div className="eyebrow">LEAD PROFILE</div>
                  <h2 id="timeline-title">{selected.name}</h2>
                  <p>
                    {selected.company || 'Independent'}
                    {selected.phone ? ` · ${selected.phone}` : ''}
                  </p>
                </div>
              </div>

              <button
                className="close-button"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="status-editor">
              <label htmlFor="lead-status">Current status</label>
              <select
                id="lead-status"
                value={selected.status}
                disabled={saving}
                onChange={(event) => void changeStatus(event.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>

              {selected.follow_up_at && (
                <span
                  className={`followup ${
                    new Date(selected.follow_up_at) < new Date() &&
                    !sameDay(selected.follow_up_at, new Date())
                      ? 'overdue'
                      : sameDay(selected.follow_up_at, new Date())
                        ? 'due-today'
                        : ''
                  }`}
                >
                  ◷ {dayLabel(selected.follow_up_at)}
                </span>
              )}
            </div>

            <div className="timeline-body">
              <div className="section-label">
                CONVERSATION HISTORY
                <span>
                  {discussions.length}{' '}
                  {discussions.length === 1 ? 'ENTRY' : 'ENTRIES'}
                </span>
              </div>

              {discussions.length === 0 ? (
                <div className="timeline-empty">
                  No conversations yet. Add the first note below.
                </div>
              ) : (
                <div className="timeline-list">
                  {discussions.map((discussion) => (
                    <article className="discussion" key={discussion.id}>
                      <div className="timeline-dot" />
                      <div className="discussion-meta">
                        <strong>You</strong>
                        <time>{dayLabel(discussion.created_at)}</time>
                      </div>
                      <p>{discussion.note}</p>
                      {discussion.follow_up_at && (
                        <div className="discussion-followup">
                          ◷ Follow-up: {dayLabel(discussion.follow_up_at)}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form className="note-form" onSubmit={saveDiscussion}>
              <label htmlFor="discussion-note">ADD A DISCUSSION</label>
              <textarea
                id="discussion-note"
                required
                maxLength={4000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did you discuss? Capture the details that matter…"
                rows={3}
              />

              <div className="followup-input">
                <label htmlFor="follow-up">
                  Next follow-up <span>Optional</span>
                </label>
                <input
                  id="follow-up"
                  type="datetime-local"
                  value={followUp}
                  onChange={(event) => setFollowUp(event.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelected(null)}
                >
                  Done
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || !note.trim()}
                >
                  {saving ? 'Saving…' : 'Save discussion'} <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}