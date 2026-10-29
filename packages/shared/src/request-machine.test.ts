import { describe, it, expect } from 'vitest';
import { evaluateTransition, availableActions, REQUEST_TRANSITIONS, REQUEST_STATES } from './request-machine';
import { normalizeAvatar, DEFAULT_AVATAR } from './avatar';

describe('request state machine', () => {
  it('allows the receiver to accept a submitted request', () => {
    expect(evaluateTransition('submitted', 'accept', ['receiver'])).toEqual({ ok: true, to: 'accepted' });
  });

  it('prevents the requester from accepting their own request', () => {
    const r = evaluateTransition('submitted', 'accept', ['requester']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN_SIDE');
  });

  it('requires a reason when rejecting', () => {
    const r = evaluateTransition('submitted', 'reject', ['receiver'], '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOTE_REQUIRED');
    expect(evaluateTransition('submitted', 'reject', ['receiver'], 'Out of scope this quarter').ok).toBe(true);
  });

  it('only lets the requester approve a delivery — internal completion is not approval', () => {
    expect(evaluateTransition('delivered', 'approve', ['receiver']).ok).toBe(false);
    expect(evaluateTransition('delivered', 'approve', ['requester'])).toEqual({ ok: true, to: 'completed' });
    expect(evaluateTransition('in_progress', 'approve', ['requester']).ok).toBe(false);
  });

  it('supports the full happy path with a change-request loop', () => {
    let s: any = 'submitted';
    const steps: Array<[any, any, string?]> = [
      ['request_clarification', 'receiver', 'Which metrics?'],
      ['provide_clarification', 'requester', 'CTR and conversions'],
      ['accept', 'receiver'],
      ['start', 'receiver'],
      ['deliver', 'receiver', 'Deployed to staging'],
      ['request_changes', 'requester', 'Add export button'],
      ['start', 'receiver'],
      ['deliver', 'receiver', 'Export added'],
      ['approve', 'requester'],
    ];
    for (const [a, side, note] of steps) {
      const r = evaluateTransition(s, a, [side], note);
      expect(r.ok, `${a} from ${s}`).toBe(true);
      if (r.ok) s = r.to;
    }
    expect(s).toBe('completed');
  });

  it('terminal states have no outgoing actions', () => {
    for (const s of ['completed', 'rejected', 'cancelled'] as const) {
      expect(availableActions(s, ['requester', 'receiver'])).toEqual([]);
    }
  });

  it('every transition targets a known state', () => {
    for (const d of Object.values(REQUEST_TRANSITIONS)) expect(REQUEST_STATES).toContain(d.to);
  });
});

describe('avatar normalisation', () => {
  it('falls back to defaults for invalid input', () => {
    expect(normalizeAvatar({ skinTone: 'red' })).toEqual(DEFAULT_AVATAR);
    expect(normalizeAvatar(null)).toEqual(DEFAULT_AVATAR);
  });
  it('keeps valid partial overrides', () => {
    expect(normalizeAvatar({ outfit: 'thobe', headwear: 'shemagh' }).headwear).toBe('shemagh');
  });
});
