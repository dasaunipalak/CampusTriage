import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(70000),
    headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}
const modeName = mode => ({ openai: 'OpenAI', mock: 'Mock demo', 'legacy-mock': 'Legacy mock',
  'injected-failure': 'Failure simulation', injected: 'Test adapter' })[mode] || mode;
const dateLabel = date => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function App() {
  const [screen, setScreen] = useState(location.hash === '#admin' ? 'admin' : 'student');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const loadStatus = useCallback(async () => {
    try { setStatus(await api('/api/status')); setStatusError(''); }
    catch { setStatusError('Cannot reach the backend. Check that the server is running.'); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => {
    const onHash = () => setScreen(location.hash === '#admin' ? 'admin' : 'student');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const analysis = status?.analysis;
  return <>
    <header className="topbar">
      <a href="#student" className="brand" aria-label="CampusTriage home"><span className="brand-mark">ct</span><span>Campus<span className="brand-light">Triage</span><small>CAMPUS MAINTENANCE</small></span></a>
      <nav aria-label="Main navigation"><a href="#student" aria-current={screen === 'student' ? 'page' : undefined}>Student report</a><a href="#admin" aria-current={screen === 'admin' ? 'page' : undefined}>Admin queue</a></nav>
      <span className="prototype">SE PROJECT / PROTOTYPE</span>
    </header>
    <div className={`modebar ${analysis?.mode === 'openai' && analysis.ready ? 'live' : ''}`} role="status">
      {statusError || (!analysis ? 'Checking analysis configuration…' : <>
        <strong>{modeName(analysis.mode)}{analysis.mode === 'mock' ? ' · deterministic simulation' : ''}</strong>
        <span>{analysis.mode === 'openai' ? analysis.ready
          ? analysis.liveVerified ? 'Live AI request verified in this server session' : 'Configured · live AI not yet verified'
          : `AI unavailable · missing ${analysis.missingSettings.join(', ')} · submissions saved for manual review`
          : 'Fictional examples only. Results are not live AI.'}</span>
        {status.simulation && <span>Simulation clock: {status.referenceTime}</span>}
      </>)}
    </div>
    <main>{screen === 'student' ? <Student onSubmitted={loadStatus}/> : <Admin onRefresh={loadStatus}/>}</main>
    <footer><span>CampusTriage / Software Engineering submission</span><span>Human review remains part of every safety decision.</span></footer>
  </>;
}

function Student({ onSubmitted }) {
  const [description, setDescription] = useState('');
  const [locationValue, setLocationValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(null);
    try {
      const result = await api('/complaints', { method: 'POST', body: JSON.stringify({ description, location: locationValue }) });
      setSaved(result); setDescription(''); setLocationValue(''); onSubmitted();
    } catch (error) { setError(error.name === 'TimeoutError' ? 'The request timed out. Check the admin queue before retrying.' : error.message); }
    finally { setBusy(false); }
  }
  return <div className="student-layout">
    <section className="intro">
      <p className="eyebrow">A CAMPUS THAT LISTENS</p>
      <h1>Small report.<br/>Better campus.</h1>
      <p className="lead">Describe a maintenance issue in your own words. We’ll help the campus team understand what needs attention.</p>
      <div className="process"><span>01 <b>You describe it</b></span><span>02 <b>AI helps make sense of it</b></span><span>03 <b>The campus team reviews it</b></span></div>
      <aside className="note"><strong>Everyday language is welcome.</strong><p>English or Hinglish works. Mention what happened and exactly where it is. For this classroom demo, use fictional details.</p></aside>
      <p className="urgent-note">For an immediate danger, contact campus emergency staff directly. This prototype is not an emergency service.</p>
    </section>
    <section className="form-card" aria-labelledby="report-title">
      <span className="small-tag">STUDENT DESK</span><h2 id="report-title">Report an issue</h2><p>What should the maintenance team know?</p>
      {saved && <div className="success" role="status"><strong>Complaint #{saved.id} received</strong><p>Saved to the pending queue. Analysis source: {modeName(saved.analysisMode)}.</p><p>{saved.needsReview ? 'Manual review is required.' : 'The admin can now review its place in the queue.'}</p>{saved.analysisStatus === 'failed' && <p>AI analysis was unavailable. Your original complaint is saved.</p>}<a href="#admin">View admin queue</a></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label htmlFor="description">Describe the issue</label>
        <textarea id="description" required maxLength={5000} rows={6} value={description} disabled={busy} onChange={e => setDescription(e.target.value)} placeholder="For example: washroom ke socket mein paani ja raha hai…"/>
        <div className="field-meta"><span>Include the details that matter.</span><span>{description.length}/5000</span></div>
        <label htmlFor="location">Where is it?</label>
        <input id="location" required maxLength={200} value={locationValue} disabled={busy} onChange={e => setLocationValue(e.target.value)} placeholder="Building, floor, room or nearby landmark"/>
        <button className="primary submit" disabled={busy || !description.trim() || !locationValue.trim()}>{busy ? 'Saving and analysing…' : 'Submit complaint'}</button>
        <p className="form-footnote">Your original words stay with the report. Possible safety concerns go to an admin for review.</p>
      </form>
    </section>
  </div>;
}

function Admin({ onRefresh }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setQueue(await api('/complaints')); onRefresh(); }
    catch (error) { setError(`Could not refresh the queue: ${error.message}`); }
    finally { setLoading(false); }
  }, [onRefresh]);
  useEffect(() => { load(); }, [load]);
  async function resolve(id) {
    setResolving(id); setError(''); setNotice('');
    try {
      await api(`/complaints/${id}/resolve`, { method: 'PATCH' });
      setNotice(`Complaint #${id} resolved.`);
      await load();
    } catch (error) { setError(`Could not resolve complaint: ${error.message}`); }
    finally { setResolving(null); }
  }
  return <section className="admin" aria-labelledby="queue-title">
    <div className="queue-heading"><div><p className="eyebrow">CAMPUS OPERATIONS</p><h1 id="queue-title">Attention, in order.</h1><p className="lead">A pending queue with a reason behind every position.</p></div><button className="secondary" onClick={load} disabled={loading}>Refresh queue</button></div>
    <div className="queue-explainer"><strong>{queue.length} pending</strong><span>Possible hazards first</span><span>Then routine tickets waiting 48+ hours</span><span>Then weighted score</span></div>
    <p className="scoring-note">Provisional scoring: new complaints use severity, urgency and impact of 5/10. Waiting adds up to 1 point. Safety and overdue rules override the score.</p>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error} Previously loaded tickets may be out of date.</p>}
    {loading && <p className="state" role="status">Loading the ranked queue…</p>}
    {!loading && !error && queue.length === 0 && <div className="empty"><span className="empty-symbol">✓</span><h2>Nothing waiting right now.</h2><p>New student reports will appear here, ranked by the backend.</p><a href="#student">Submit a report</a></div>}
    <ol className="queue" aria-label="Ranked pending complaints">{queue.map((complaint, index) => <li key={complaint.id} className={`ticket ${complaint.ranking.tier}`} data-testid={`ticket-${complaint.id}`}>
      <div className="rank-number"><small>RANK</small><strong>{String(index + 1).padStart(2, '0')}</strong></div>
      <article>
        <div className="ticket-top"><span className={`badge ${complaint.ranking.tier}`}>{complaint.ranking.tier === 'safety' ? 'Possible safety concern' : complaint.ranking.tier === 'overdue' ? 'Waiting 48+ hours' : 'Routine'}</span><span className="ticket-meta">#{complaint.id} · {dateLabel(complaint.createdAt)}</span></div>
        <h2>{complaint.analysis?.summary || 'Awaiting manual analysis'}</h2><p className="location">{complaint.location}</p>
        <dl className="ticket-details"><div><dt>Original report</dt><dd>{complaint.description}</dd></div>
          <div><dt>Risk evidence</dt><dd>{complaint.analysis?.riskEvidence ? <q>{complaint.analysis.riskEvidence}</q> : complaint.analysisStatus === 'failed' ? 'Unknown: AI analysis failed.' : 'No evidence supplied by the analyzer.'}</dd></div>
        </dl>
        <div className="ticket-status"><span>Category: {complaint.analysis?.category ?? 'unknown'}</span><span>Review: {complaint.needsReview ? 'required' : 'not required'}</span><span>Source: {modeName(complaint.analysisMode)}</span><span>Analysis: {complaint.analysisStatus}</span></div>
        {complaint.analysisError && <p className="review-warning">{complaint.analysisError}</p>}
        <div className="rank-reason"><strong>Why this position</strong><p>{complaint.ranking.rankReason}</p><small>Score {complaint.ranking.score.toFixed(2)} / 10 · Severity {complaint.severity} · Urgency {complaint.urgency} · Impact {complaint.impact} · Waiting {complaint.ranking.factors.waiting.toFixed(2)} · {complaint.scoringSource}</small></div>
        <button className="resolve" aria-label={`Resolve complaint ${complaint.id}`} disabled={resolving !== null || loading} onClick={() => resolve(complaint.id)}>{resolving === complaint.id ? 'Resolving…' : 'Mark resolved'}</button>
      </article>
    </li>)}</ol>
  </section>;
}

createRoot(document.getElementById('root')).render(<App/>);
