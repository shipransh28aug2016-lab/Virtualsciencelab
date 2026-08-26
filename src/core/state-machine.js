/**
 * Experiment state machine (§22).
 * INITIALISED → READY → RUNNING → MEASURING → OBSERVATION → CALCULATION
 *            → RESULT → ASSESSMENT → COMPLETED
 * RESET / RETRY are legal from anywhere.
 */
export const STATES = Object.freeze({
  INITIALISED: 'INITIALISED',
  READY: 'READY',
  RUNNING: 'RUNNING',
  MEASURING: 'MEASURING',
  OBSERVATION: 'OBSERVATION',
  CALCULATION: 'CALCULATION',
  RESULT: 'RESULT',
  ASSESSMENT: 'ASSESSMENT',
  COMPLETED: 'COMPLETED',
});

const FORWARD = {
  INITIALISED: ['READY'],
  READY: ['RUNNING', 'MEASURING'],
  RUNNING: ['MEASURING', 'READY'],
  MEASURING: ['OBSERVATION', 'RUNNING', 'READY'],
  OBSERVATION: ['CALCULATION', 'RUNNING', 'READY', 'MEASURING'],
  CALCULATION: ['RESULT', 'OBSERVATION'],
  RESULT: ['ASSESSMENT', 'OBSERVATION', 'CALCULATION'],
  ASSESSMENT: ['COMPLETED', 'RESULT'],
  COMPLETED: ['ASSESSMENT'],
};

export class ExperimentMachine {
  constructor(onChange) {
    this.state = STATES.INITIALISED;
    this.history = [this.state];
    this.onChange = onChange || (() => {});
  }

  can(next) {
    if (next === STATES.READY || next === this.state) return true; // RESET / RETRY
    return (FORWARD[this.state] || []).includes(next);
  }

  to(next, meta = {}) {
    if (!STATES[next]) throw new Error(`Unknown state: ${next}`);
    if (!this.can(next)) {
      console.warn(`[state] illegal transition ${this.state} → ${next}`);
      return false;
    }
    const prev = this.state;
    this.state = next;
    this.history.push(next);
    this.onChange(next, prev, meta);
    return true;
  }

  reset() {
    const prev = this.state;
    this.state = STATES.READY;
    this.history.push('RESET');
    this.onChange(this.state, prev, { reset: true });
  }

  /** Furthest point reached, for the progress ring. */
  get furthest() {
    const order = Object.keys(STATES);
    return this.history.reduce((max, s) => Math.max(max, order.indexOf(s)), 0);
  }
}

export const STATE_LABELS = {
  INITIALISED: 'Loading',
  READY: 'Ready',
  RUNNING: 'Running',
  MEASURING: 'Measuring',
  OBSERVATION: 'Observations',
  CALCULATION: 'Calculating',
  RESULT: 'Result',
  ASSESSMENT: 'Assessment',
  COMPLETED: 'Completed',
};
