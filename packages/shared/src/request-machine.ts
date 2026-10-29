/**
 * Cross-department request state machine.
 *
 * The requesting side (admins of the *source* department) and the receiving side
 * (admins of the *target* department) each own different transitions. Company admins
 * may act on either side. The machine is pure and is the single source of truth for
 * both server validation and UI affordances.
 *
 * Completion of internal tasks never implies approval: only the requesting side can
 * move a request from `delivered` to `completed`.
 */

export const REQUEST_STATES = [
  'submitted',
  'clarification_requested',
  'accepted',
  'in_progress',
  'delivered',
  'changes_requested',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  submitted: 'New request',
  clarification_requested: 'Clarification needed',
  accepted: 'Accepted',
  in_progress: 'In progress',
  delivered: 'Delivered',
  changes_requested: 'Changes requested',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const REQUEST_ACTIONS = [
  'accept',
  'reject',
  'request_clarification',
  'provide_clarification',
  'start',
  'deliver',
  'approve',
  'request_changes',
  'cancel',
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

export type RequestSide = 'requester' | 'receiver';

interface TransitionDef {
  from: RequestState[];
  to: RequestState;
  side: RequestSide;
  /** Whether a free-text reason/note is mandatory. */
  requiresNote: boolean;
}

export const REQUEST_TRANSITIONS: Record<RequestAction, TransitionDef> = {
  accept: { from: ['submitted'], to: 'accepted', side: 'receiver', requiresNote: false },
  reject: { from: ['submitted', 'clarification_requested'], to: 'rejected', side: 'receiver', requiresNote: true },
  request_clarification: { from: ['submitted'], to: 'clarification_requested', side: 'receiver', requiresNote: true },
  provide_clarification: { from: ['clarification_requested'], to: 'submitted', side: 'requester', requiresNote: true },
  start: { from: ['accepted', 'changes_requested'], to: 'in_progress', side: 'receiver', requiresNote: false },
  deliver: { from: ['in_progress'], to: 'delivered', side: 'receiver', requiresNote: true },
  approve: { from: ['delivered'], to: 'completed', side: 'requester', requiresNote: false },
  request_changes: { from: ['delivered'], to: 'changes_requested', side: 'requester', requiresNote: true },
  cancel: {
    from: ['submitted', 'clarification_requested', 'accepted'],
    to: 'cancelled',
    side: 'requester',
    requiresNote: false,
  },
};

export const REQUEST_TERMINAL: RequestState[] = ['completed', 'rejected', 'cancelled'];

export type TransitionResult =
  | { ok: true; to: RequestState }
  | { ok: false; code: 'INVALID_TRANSITION' | 'FORBIDDEN_SIDE' | 'NOTE_REQUIRED'; message: string };

export function evaluateTransition(
  current: RequestState,
  action: RequestAction,
  actorSides: RequestSide[],
  note?: string | null,
): TransitionResult {
  const def = REQUEST_TRANSITIONS[action];
  if (!def) return { ok: false, code: 'INVALID_TRANSITION', message: `Unknown action ${action}` };
  if (!def.from.includes(current)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `Cannot ${action.replace(/_/g, ' ')} a request that is ${REQUEST_STATE_LABEL[current].toLowerCase()}`,
    };
  }
  if (!actorSides.includes(def.side)) {
    return {
      ok: false,
      code: 'FORBIDDEN_SIDE',
      message: `Only the ${def.side === 'receiver' ? 'receiving' : 'requesting'} department's admins can ${action.replace(/_/g, ' ')}`,
    };
  }
  if (def.requiresNote && !(note && note.trim().length >= 3)) {
    return { ok: false, code: 'NOTE_REQUIRED', message: 'A note explaining this decision is required' };
  }
  return { ok: true, to: def.to };
}

/** Actions available to an actor in a given state — drives UI buttons. */
export function availableActions(current: RequestState, actorSides: RequestSide[]): RequestAction[] {
  return (Object.keys(REQUEST_TRANSITIONS) as RequestAction[]).filter((a) => {
    const d = REQUEST_TRANSITIONS[a];
    return d.from.includes(current) && actorSides.includes(d.side);
  });
}
