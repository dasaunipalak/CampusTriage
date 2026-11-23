// AI teammate: replace this function's implementation, retaining the async contract.
async function analyzeComplaint(description) {
  const electrical = /socket|wire|electrical|spark|bijli/i.test(description);
  const risk = electrical && /water|paani|spark|exposed|shock|smoke|burn/i.test(description);
  return {
    category: electrical ? 'electrical' : 'general',
    summary: description.trim().replace(/\s+/g, ' '),
    possibleSafetyRisk: risk,
    riskEvidence: risk ? description.trim() : null,
    needsReview: risk,
  };
}

function isValidAnalysis(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof value.category === 'string' && value.category.trim().length > 0
    && typeof value.summary === 'string' && value.summary.trim().length > 0
    && typeof value.possibleSafetyRisk === 'boolean'
    && typeof value.needsReview === 'boolean'
    && (value.riskEvidence === null || typeof value.riskEvidence === 'string')
    && (!value.possibleSafetyRisk || (typeof value.riskEvidence === 'string'
      && value.riskEvidence.trim().length > 0));
}

module.exports = { analyzeComplaint, isValidAnalysis };
