import test from 'node:test';import assert from 'node:assert/strict';import {evaluateForecasts} from '../research/player-predictions/evaluate.mjs';
const row={fixtureId:1,playerId:1,forecastAt:'2026-11-01T10:00:00Z',kickoff:'2026-11-01T11:00:00Z',latestInputObservedAt:'2026-11-01T09:00:00Z',probability:.8,baselineProbability:.5};
test('paired scores are calculated against the same known outcome',()=>{const r=evaluateForecasts([row],[{fixtureId:1,playerId:1,outcome:1}]);assert.ok(Math.abs(r.model.brier-.04)<1e-12);assert.equal(r.baseline.brier,.25);});
test('unknown outcome remains excluded, not a loss',()=>{const r=evaluateForecasts([row],[]);assert.equal(r.unknownOutcomes,1);assert.equal(r.model,null);});
test('future inputs or forecast after kickoff cannot enter evaluation',()=>{for(const change of [{latestInputObservedAt:'2026-11-01T10:01:00Z'},{forecastAt:row.kickoff}])assert.throws(()=>evaluateForecasts([{...row,...change}],[]));});
test('duplicate predictions and malformed probabilities fail',()=>{assert.throws(()=>evaluateForecasts([row,row],[]));assert.throws(()=>evaluateForecasts([{...row,probability:'0.8'}],[]));});
