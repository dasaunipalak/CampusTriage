// Fictional, deterministic simulation. No claim about real-world response times or AI accuracy.
const AFTER = '2026-11-24T12:00:00.000Z';
const BEFORE = '2026-11-24T11:59:59.999Z';
const fixtures = [
  { id: 1, description: 'Reading room fan is not working.', location: 'Fictional library',
    createdAt: '2026-11-22T12:00:00.000Z', severity: 2, urgency: 2, impact: 4 },
  { id: 2, description: 'Classroom projector is not working.', location: 'Fictional Room 102',
    createdAt: '2026-11-24T06:00:00.000Z', severity: 9, urgency: 9, impact: 9 },
  { id: 3, description: 'washroom ke socket mein paani ja raha hai', location: 'Fictional hostel',
    createdAt: '2026-11-24T11:00:00.000Z', severity: 5, urgency: 5, impact: 5 },
];
module.exports = { AFTER, BEFORE, fixtures };
