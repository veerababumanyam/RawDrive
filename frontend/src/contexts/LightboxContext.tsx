/**
 * LightboxContext
 * State management for lightbox modes (view, slideshow, compare)
 * Provides centralized state for complex mode interactions
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo, ReactNode } from 'react';

// Lightbox modes
export type LightboxMode = 'view' | 'slideshow' | 'compare';

// Slideshow settings
export interface SlideshowSettings {
  /** Interval between slides in milliseconds (default: 5000) */
  interval: number;
  /** Whether to loop back to start (default: true) */
  loop: boolean;
  /** Whether to hide UI during slideshow (default: true) */
  hideUI: boolean;
  /** Ken Burns effect settings */
  kenBurns: {
    enabled: boolean;
    /** Zoom range as percentage (default: 10-15%) */
    minZoom: number;
    maxZoom: number;
    /** Pan direction per slide */
    randomDirection: boolean;
  };
}

// Compare mode settings
export interface CompareSettings {
  /** Sync zoom between compared images */
  syncZoom: boolean;
  /** Sync pan between compared images */
  syncPan: boolean;
  /** Layout direction */
  layout: 'horizontal' | 'vertical';
}

// State shape
export interface LightboxState {
  /** Current mode */
  mode: LightboxMode;
  /** Whether slideshow is currently playing */
  isPlaying: boolean;
  /** Slideshow settings */
  slideshowSettings: SlideshowSettings;
  /** Compare mode settings */
  compareSettings: CompareSettings;
  /** Index of second image in compare mode */
  compareIndex: number | null;
  /** Whether UI controls are visible */
  showControls: boolean;
  /** Remaining time for current slide in slideshow (ms) */
  slideTimeRemaining: number;
}

// Action types
type LightboxAction =
  | { type: 'SET_MODE'; payload: LightboxMode }
  | { type: 'START_SLIDESHOW' }
  | { type: 'STOP_SLIDESHOW' }
  | { type: 'PAUSE_SLIDESHOW' }
  | { type: 'RESUME_SLIDESHOW' }
  | { type: 'UPDATE_SLIDESHOW_SETTINGS'; payload: Partial<SlideshowSettings> }
  | { type: 'UPDATE_COMPARE_SETTINGS'; payload: Partial<CompareSettings> }
  | { type: 'SET_COMPARE_INDEX'; payload: number | null }
  | { type: 'TOGGLE_CONTROLS' }
  | { type: 'SHOW_CONTROLS' }
  | { type: 'HIDE_CONTROLS' }
  | { type: 'UPDATE_SLIDE_TIME'; payload: number }
  | { type: 'RESET' };

// Default settings
const defaultSlideshowSettings: SlideshowSettings = {
  interval: 5000,
  loop: true,
  hideUI: true,
  kenBurns: {
    enabled: true,
    minZoom: 1.0,
    maxZoom: 1.15,
    randomDirection: true,
  },
};

const defaultCompareSettings: CompareSettings = {
  syncZoom: true,
  syncPan: true,
  layout: 'horizontal',
};

// Initial state
const initialState: LightboxState = {
  mode: 'view',
  isPlaying: false,
  slideshowSettings: defaultSlideshowSettings,
  compareSettings: defaultCompareSettings,
  compareIndex: null,
  showControls: true,
  slideTimeRemaining: 0,
};

// Reducer
function lightboxReducer(state: LightboxState, action: LightboxAction): LightboxState {
  switch (action.type) {
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        isPlaying: action.payload === 'slideshow' ? state.isPlaying : false,
        compareIndex: action.payload === 'compare' ? state.compareIndex : null,
        showControls: action.payload === 'slideshow' && state.slideshowSettings.hideUI ? false : true,
      };

    case 'START_SLIDESHOW':
      return {
        ...state,
        mode: 'slideshow',
        isPlaying: true,
        showControls: !state.slideshowSettings.hideUI,
        slideTimeRemaining: state.slideshowSettings.interval,
      };

    case 'STOP_SLIDESHOW':
      return {
        ...state,
        mode: 'view',
        isPlaying: false,
        showControls: true,
        slideTimeRemaining: 0,
      };

    case 'PAUSE_SLIDESHOW':
      return {
        ...state,
        isPlaying: false,
        showControls: true,
      };

    case 'RESUME_SLIDESHOW':
      return {
        ...state,
        isPlaying: true,
        showControls: !state.slideshowSettings.hideUI,
      };

    case 'UPDATE_SLIDESHOW_SETTINGS':
      return {
        ...state,
        slideshowSettings: {
          ...state.slideshowSettings,
          ...action.payload,
          kenBurns: {
            ...state.slideshowSettings.kenBurns,
            ...(action.payload.kenBurns || {}),
          },
        },
      };

    case 'UPDATE_COMPARE_SETTINGS':
      return {
        ...state,
        compareSettings: {
          ...state.compareSettings,
          ...action.payload,
        },
      };

    case 'SET_COMPARE_INDEX':
      return {
        ...state,
        compareIndex: action.payload,
      };

    case 'TOGGLE_CONTROLS':
      return {
        ...state,
        showControls: !state.showControls,
      };

    case 'SHOW_CONTROLS':
      return {
        ...state,
        showControls: true,
      };

    case 'HIDE_CONTROLS':
      return {
        ...state,
        showControls: false,
      };

    case 'UPDATE_SLIDE_TIME':
      return {
        ...state,
        slideTimeRemaining: action.payload,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Context value type
interface LightboxContextValue {
  state: LightboxState;
  // Mode actions
  setMode: (mode: LightboxMode) => void;
  // Slideshow actions
  startSlideshow: () => void;
  stopSlideshow: () => void;
  pauseSlideshow: () => void;
  resumeSlideshow: () => void;
  toggleSlideshow: () => void;
  updateSlideshowSettings: (settings: Partial<SlideshowSettings>) => void;
  // Compare actions
  setCompareIndex: (index: number | null) => void;
  updateCompareSettings: (settings: Partial<CompareSettings>) => void;
  enterCompareMode: (secondIndex: number) => void;
  exitCompareMode: () => void;
  // UI actions
  toggleControls: () => void;
  showControls: () => void;
  hideControls: () => void;
  // Utility
  reset: () => void;
}

// Create context
const LightboxContext = createContext<LightboxContextValue | null>(null);

// Provider props
interface LightboxProviderProps {
  children: ReactNode;
  /** Initial slideshow settings override */
  initialSlideshowSettings?: Partial<SlideshowSettings>;
  /** Initial compare settings override */
  initialCompareSettings?: Partial<CompareSettings>;
}

/**
 * LightboxProvider
 * Wraps lightbox components to provide state management
 */
export function LightboxProvider({
  children,
  initialSlideshowSettings,
  initialCompareSettings,
}: LightboxProviderProps) {
  const [state, dispatch] = useReducer(lightboxReducer, {
    ...initialState,
    slideshowSettings: {
      ...defaultSlideshowSettings,
      ...initialSlideshowSettings,
      kenBurns: {
        ...defaultSlideshowSettings.kenBurns,
        ...(initialSlideshowSettings?.kenBurns || {}),
      },
    },
    compareSettings: {
      ...defaultCompareSettings,
      ...initialCompareSettings,
    },
  });

  // Mode actions
  const setMode = useCallback((mode: LightboxMode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  // Slideshow actions
  const startSlideshow = useCallback(() => {
    dispatch({ type: 'START_SLIDESHOW' });
  }, []);

  const stopSlideshow = useCallback(() => {
    dispatch({ type: 'STOP_SLIDESHOW' });
  }, []);

  const pauseSlideshow = useCallback(() => {
    dispatch({ type: 'PAUSE_SLIDESHOW' });
  }, []);

  const resumeSlideshow = useCallback(() => {
    dispatch({ type: 'RESUME_SLIDESHOW' });
  }, []);

  const toggleSlideshow = useCallback(() => {
    if (state.mode === 'slideshow') {
      if (state.isPlaying) {
        dispatch({ type: 'PAUSE_SLIDESHOW' });
      } else {
        dispatch({ type: 'RESUME_SLIDESHOW' });
      }
    } else {
      dispatch({ type: 'START_SLIDESHOW' });
    }
  }, [state.mode, state.isPlaying]);

  const updateSlideshowSettings = useCallback((settings: Partial<SlideshowSettings>) => {
    dispatch({ type: 'UPDATE_SLIDESHOW_SETTINGS', payload: settings });
  }, []);

  // Compare actions
  const setCompareIndex = useCallback((index: number | null) => {
    dispatch({ type: 'SET_COMPARE_INDEX', payload: index });
  }, []);

  const updateCompareSettings = useCallback((settings: Partial<CompareSettings>) => {
    dispatch({ type: 'UPDATE_COMPARE_SETTINGS', payload: settings });
  }, []);

  const enterCompareMode = useCallback((secondIndex: number) => {
    dispatch({ type: 'SET_COMPARE_INDEX', payload: secondIndex });
    dispatch({ type: 'SET_MODE', payload: 'compare' });
  }, []);

  const exitCompareMode = useCallback(() => {
    dispatch({ type: 'SET_COMPARE_INDEX', payload: null });
    dispatch({ type: 'SET_MODE', payload: 'view' });
  }, []);

  // UI actions
  const toggleControls = useCallback(() => {
    dispatch({ type: 'TOGGLE_CONTROLS' });
  }, []);

  const showControlsAction = useCallback(() => {
    dispatch({ type: 'SHOW_CONTROLS' });
  }, []);

  const hideControls = useCallback(() => {
    dispatch({ type: 'HIDE_CONTROLS' });
  }, []);

  // Reset
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Memoize context value
  const value = useMemo<LightboxContextValue>(
    () => ({
      state,
      setMode,
      startSlideshow,
      stopSlideshow,
      pauseSlideshow,
      resumeSlideshow,
      toggleSlideshow,
      updateSlideshowSettings,
      setCompareIndex,
      updateCompareSettings,
      enterCompareMode,
      exitCompareMode,
      toggleControls,
      showControls: showControlsAction,
      hideControls,
      reset,
    }),
    [
      state,
      setMode,
      startSlideshow,
      stopSlideshow,
      pauseSlideshow,
      resumeSlideshow,
      toggleSlideshow,
      updateSlideshowSettings,
      setCompareIndex,
      updateCompareSettings,
      enterCompareMode,
      exitCompareMode,
      toggleControls,
      showControlsAction,
      hideControls,
      reset,
    ]
  );

  return <LightboxContext.Provider value={value}>{children}</LightboxContext.Provider>;
}

/**
 * useLightboxContext
 * Hook to access lightbox state and actions
 */
export function useLightboxContext(): LightboxContextValue {
  const context = useContext(LightboxContext);
  if (!context) {
    throw new Error('useLightboxContext must be used within a LightboxProvider');
  }
  return context;
}

/**
 * useLightboxMode
 * Convenience hook for mode-related state
 */
export function useLightboxMode() {
  const { state, setMode } = useLightboxContext();
  return {
    mode: state.mode,
    isViewMode: state.mode === 'view',
    isSlideshowMode: state.mode === 'slideshow',
    isCompareMode: state.mode === 'compare',
    setMode,
  };
}

/**
 * useSlideshowState
 * Convenience hook for slideshow-related state
 */
export function useSlideshowState() {
  const {
    state,
    startSlideshow,
    stopSlideshow,
    pauseSlideshow,
    resumeSlideshow,
    toggleSlideshow,
    updateSlideshowSettings,
  } = useLightboxContext();

  return {
    isPlaying: state.isPlaying,
    isSlideshowMode: state.mode === 'slideshow',
    settings: state.slideshowSettings,
    slideTimeRemaining: state.slideTimeRemaining,
    startSlideshow,
    stopSlideshow,
    pauseSlideshow,
    resumeSlideshow,
    toggleSlideshow,
    updateSlideshowSettings,
  };
}

/**
 * useCompareState
 * Convenience hook for compare mode state
 */
export function useCompareState() {
  const {
    state,
    setCompareIndex,
    updateCompareSettings,
    enterCompareMode,
    exitCompareMode,
  } = useLightboxContext();

  return {
    isCompareMode: state.mode === 'compare',
    compareIndex: state.compareIndex,
    settings: state.compareSettings,
    setCompareIndex,
    updateCompareSettings,
    enterCompareMode,
    exitCompareMode,
  };
}

export default LightboxContext;
