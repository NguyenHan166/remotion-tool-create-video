export type AutosavePhase = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export type AutosaveState = {
  phase: AutosavePhase;
  draftVersion: number;
  changeSequence: number;
  savedSequence: number;
  savingSequence: number | null;
  message: string | null;
};

export type AutosaveAction =
  | {
      type: 'observe-change';
      changeSequence: number;
    }
  | {
      type: 'begin';
    }
  | {
      type: 'saved';
      savingSequence: number;
      draftVersion: number;
    }
  | {
      type: 'failed';
      savingSequence: number;
      message: string;
    }
  | {
      type: 'conflict';
      savingSequence: number;
      message: string;
    }
  | {
      type: 'retry';
    }
  | {
      type: 'keep-local';
      remoteDraftVersion: number;
    }
  | {
      type: 'use-remote';
      remoteDraftVersion: number;
    }
  | {
      type: 'accept-server';
      remoteDraftVersion: number;
    }
  | {
      type: 'external-conflict';
      message: string;
    };

export function createAutosaveState(draftVersion: number): AutosaveState {
  return {
    phase: 'saved',
    draftVersion,
    changeSequence: 0,
    savedSequence: 0,
    savingSequence: null,
    message: null,
  };
}

export function reduceAutosaveState(state: AutosaveState, action: AutosaveAction): AutosaveState {
  switch (action.type) {
    case 'observe-change': {
      if (action.changeSequence <= state.changeSequence) {
        return state;
      }

      return {
        ...state,
        phase:
          state.phase === 'conflict' ? 'conflict' : state.phase === 'saving' ? 'saving' : 'dirty',
        changeSequence: action.changeSequence,
        message: state.phase === 'conflict' ? state.message : null,
      };
    }

    case 'begin': {
      if (state.phase !== 'dirty' || state.changeSequence <= state.savedSequence) {
        return state;
      }

      return {
        ...state,
        phase: 'saving',
        savingSequence: state.changeSequence,
        message: null,
      };
    }

    case 'saved': {
      if (state.savingSequence !== action.savingSequence) {
        return state;
      }

      const hasNewerChanges = state.changeSequence > action.savingSequence;

      return {
        ...state,
        phase: hasNewerChanges ? 'dirty' : 'saved',
        draftVersion: action.draftVersion,
        savedSequence: Math.max(state.savedSequence, action.savingSequence),
        savingSequence: null,
        message: null,
      };
    }

    case 'failed': {
      if (state.savingSequence !== action.savingSequence) {
        return state;
      }

      const hasNewerChanges = state.changeSequence > action.savingSequence;

      return {
        ...state,
        phase: hasNewerChanges ? 'dirty' : 'error',
        savingSequence: null,
        message: action.message,
      };
    }

    case 'conflict': {
      if (state.savingSequence !== action.savingSequence) {
        return state;
      }

      return {
        ...state,
        phase: 'conflict',
        savingSequence: null,
        message: action.message,
      };
    }

    case 'retry': {
      if (state.phase !== 'error') {
        return state;
      }

      return {
        ...state,
        phase: 'dirty',
        message: null,
      };
    }

    case 'keep-local': {
      if (state.phase !== 'conflict') {
        return state;
      }

      return {
        ...state,
        phase: 'dirty',
        draftVersion: action.remoteDraftVersion,
        savingSequence: null,
        message: null,
      };
    }

    case 'use-remote': {
      if (state.phase !== 'conflict') {
        return state;
      }

      return {
        ...state,
        phase: 'saved',
        draftVersion: action.remoteDraftVersion,
        savedSequence: state.changeSequence,
        savingSequence: null,
        message: null,
      };
    }

    case 'accept-server': {
      return {
        ...state,
        phase: 'saved',
        draftVersion: action.remoteDraftVersion,
        savedSequence: state.changeSequence,
        savingSequence: null,
        message: null,
      };
    }

    case 'external-conflict': {
      return {
        ...state,
        phase: 'conflict',
        savingSequence: null,
        message: action.message,
      };
    }
  }
}
