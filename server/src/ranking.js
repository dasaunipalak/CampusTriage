const PROVISIONAL_DEFAULTS = Object.freeze({ severity: 5, urgency: 5, impact: 5 });

// Pure: referenceTime is required; inputs and their array are never mutated.
function rankComplaints(complaints, referenceTime) {
  const now = new Date(referenceTime).getTime();
  if (!Number.isFinite(now)) throw new TypeError('A valid reference time is required');
  return complaints.map(complaint => {
    const created = new Date(complaint.createdAt).getTime();
    if (!Number.isFinite(created)) throw new TypeError('Invalid complaint creation time');
    const { severity, urgency, impact } = complaint;
    for (const value of [severity, urgency, impact]) {
      if (!Number.isFinite(value) || value < 0 || value > 10) {
        throw new TypeError('Severity, urgency and impact must each be between 0 and 10');
      }
    }
    const elapsedHours = Math.max(0, (now - created) / 3_600_000);
    const waiting = Math.min(10, elapsedHours / 6);
    const score = 0.4 * severity + 0.3 * urgency + 0.2 * impact + 0.1 * waiting;
    const hazard = complaint.analysis?.possibleSafetyRisk === true;
    const tier = hazard ? 'safety' : elapsedHours >= 48 ? 'overdue' : 'routine';
    const rankReason = hazard
      ? 'Possible safety hazard: prioritised for admin review.'
      : tier === 'overdue'
        ? 'Waiting at least 48 hours: prioritised oldest first.'
        : `Routine complaint: weighted score ${score.toFixed(2)}; ties go to the oldest complaint.`;
    return { ...complaint, ranking: { tier, score, elapsedHours, rankReason,
      factors: { severity, urgency, impact, waiting },
      scoringSource: complaint.scoringSource ?? 'explicit',
      provisional: complaint.scoringSource === 'provisional-defaults' } };
  }).sort((a, b) => {
    const tiers = { safety: 0, overdue: 1, routine: 2 };
    const tierOrder = tiers[a.ranking.tier] - tiers[b.ranking.tier];
    if (tierOrder) return tierOrder;
    if (a.ranking.tier === 'routine' && a.ranking.score !== b.ranking.score) {
      return b.ranking.score - a.ranking.score;
    }
    return new Date(a.createdAt) - new Date(b.createdAt) || (a.id ?? 0) - (b.id ?? 0);
  });
}

module.exports = { rankComplaints, PROVISIONAL_DEFAULTS };
