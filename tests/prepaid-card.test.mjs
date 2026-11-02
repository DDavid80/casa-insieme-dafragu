import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isScheduledPrepaidExpense } from '../lib/prepaid-card.ts';

test('personal scheduled card purchases are paid from either prepaid card', () => {
  for (const [person, commonAccount] of [['Davide', 'Ricaricabile BPER'], ['Francesca', 'PREPAGATA Mediolanum']]) {
    assert.equal(isScheduledPrepaidExpense({ scheduleId: 1, kind: 'Spesa', person, commonAccount }), true);
  }
});

test('transfers, income and other accounts keep their existing treatment', () => {
  const base = { scheduleId: 1, kind: 'Spesa', person: 'Davide', commonAccount: 'Ricaricabile BPER' };
  for (const change of [{ scheduleId: null }, { kind: 'Entrata' }, { person: 'Comune' }, { commonAccount: 'BBVA Utenze' }]) {
    assert.equal(isScheduledPrepaidExpense({ ...base, ...change }), false);
  }
});
