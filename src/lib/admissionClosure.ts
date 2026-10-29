/**
 * Why a Vault Keeper is admitting nothing.
 *
 * The table used to say "None admissible" for every closed keeper, which reads
 * identically whether the keeper is genuinely out of room or is simply part-way
 * through a capacity proof and will reopen on its own in a couple of minutes.
 * Those are opposite facts for anyone deciding where to store a file.
 *
 * Codes come from admissionClosureReasonCode in the VaultKeeper registry implementation.
 * ONLY code 1 means "no space left". Every other code is work in progress.
 */

export type AdmissionClosure = {
  /** Short label for the table cell. */
  label: string;
  /** True only for code 1: the keeper really has no room. */
  full: boolean;
  /** Longer sentence for the hover title. */
  detail: string;
};

const CLOSURES: Record<number, AdmissionClosure> = {
  1: {
    label: 'Full',
    full: true,
    detail:
      'No room left. Certified free space has fallen to the safety margin, so this ' +
      'keeper will not admit anything until something stored on it is deleted.',
  },
  2: {
    label: 'Catching up',
    full: false,
    detail:
      'Changes are waiting for a capacity proof and the backlog is not safe to add ' +
      'to yet. This clears on its own once the proof lands.',
  },
  3: {
    label: 'Proof overdue',
    full: false,
    detail:
      'The oldest change still waiting for a capacity proof has aged past its ' +
      'bound. The keeper closes rather than promise space it has not certified.',
  },
  4: {
    label: 'Overloaded',
    full: false,
    detail:
      'Too much proving work is queued against its deadlines to take on more. ' +
      'This clears as the queue drains.',
  },
  5: {
    label: 'Proving',
    full: false,
    detail:
      'The proof subsystem is busy or briefly unreachable, so the keeper cannot ' +
      'certify new storage right now. It reopens by itself.',
  },
  6: {
    label: 'Needs check',
    full: false,
    detail:
      'Local accounting and chain state disagree. The keeper fails closed rather ' +
      'than act on numbers it cannot reconcile.',
  },
  7: {
    label: 'No chain',
    full: false,
    detail:
      'Chain state could not be read, so the keeper cannot know what it has ' +
      'certified. It closes until the chain is readable again.',
  },
  8: {
    label: 'Reserving',
    full: false,
    detail:
      'Reservation state could not be read, so the keeper cannot tell how much of ' +
      'its space is already promised. It closes until it can.',
  },
};

/**
 * A keeper that is closed with no reason on chain yet. Reaching the chain takes a
 * transaction, so there is a real window where closed is true and the reason is 0.
 * Saying "Settling" is honest; saying "Full" would not be.
 */
const SETTLING: AdmissionClosure = {
  label: 'Settling',
  full: false,
  detail:
    'Admitting nothing right now. The reason has not reached the chain yet, which ' +
    'is normal for a few seconds after a keeper closes.',
};

export function admissionClosure(reasonCode: number | undefined): AdmissionClosure {
  if (reasonCode === undefined) return SETTLING;
  return CLOSURES[reasonCode] ?? SETTLING;
}
