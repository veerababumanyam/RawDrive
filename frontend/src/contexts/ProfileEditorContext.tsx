/**
 * ProfileEditorContext
 *
 * Provides form state via useReducer for the profile editor.
 * Any child component can read state and dispatch actions.
 */

import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import type { ProfileType } from '@/components/features/profile/shared/SectionRegistry';
import type {
  DeviceMode,
  Theme,
  ThemeCustomization,
  ProfileVisibilityConfig,
} from '@/types/profileEditor';

// =============================================================================
// Action Types
// =============================================================================

export type EditorAction =
  | { type: 'SET_FIELD'; field: string; value: unknown }
  | { type: 'SET_THEME'; theme: Theme | null; customization?: ThemeCustomization | null }
  | { type: 'SET_DEVICE_MODE'; mode: DeviceMode }
  | { type: 'SET_SECTION_ORDER'; order: string[] }
  | { type: 'SET_VISIBILITY'; visibility: ProfileVisibilityConfig | null }
  | { type: 'RESET'; profile: Record<string, unknown>; sectionOrder?: string[] }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_SAVING'; isSaving: boolean };

// =============================================================================
// State
// =============================================================================

export interface ProfileEditorState {
  profile: Record<string, unknown>;
  profileType: ProfileType;
  visibility: ProfileVisibilityConfig | null;
  theme: Theme | null;
  customization: ThemeCustomization | null;
  deviceMode: DeviceMode;
  sectionOrder: string[];
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt?: string;
}

const DEFAULT_SECTION_ORDER = ['header', 'bio', 'contact', 'socials'];

function createInitialState(
  profileType: ProfileType,
  initialProfile: Record<string, unknown> = {},
  initialSectionOrder?: string[],
  initialThemeId?: string,
): ProfileEditorState {
  return {
    profile: initialProfile,
    profileType,
    visibility: null,
    theme: null,
    customization: null,
    deviceMode: 'desktop',
    sectionOrder: initialSectionOrder ?? DEFAULT_SECTION_ORDER,
    isDirty: false,
    isSaving: false,
    lastSavedAt: undefined,
  };
}

// =============================================================================
// Reducer
// =============================================================================

function editorReducer(state: ProfileEditorState, action: EditorAction): ProfileEditorState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        profile: { ...state.profile, [action.field]: action.value },
        isDirty: true,
      };

    case 'SET_THEME':
      return {
        ...state,
        theme: action.theme,
        customization: action.customization ?? state.customization,
        isDirty: true,
      };

    case 'SET_DEVICE_MODE':
      return {
        ...state,
        deviceMode: action.mode,
      };

    case 'SET_SECTION_ORDER':
      return {
        ...state,
        sectionOrder: action.order,
        isDirty: true,
      };

    case 'SET_VISIBILITY':
      return {
        ...state,
        visibility: action.visibility,
        isDirty: true,
      };

    case 'RESET':
      return {
        ...state,
        profile: action.profile,
        sectionOrder: action.sectionOrder ?? state.sectionOrder,
        isDirty: false,
        isSaving: false,
        lastSavedAt: undefined,
      };

    case 'MARK_SAVED':
      return {
        ...state,
        isDirty: false,
        isSaving: false,
        lastSavedAt: new Date().toISOString(),
      };

    case 'SET_SAVING':
      return {
        ...state,
        isSaving: action.isSaving,
      };

    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

const EditorStateContext = createContext<ProfileEditorState | undefined>(undefined);
const EditorDispatchContext = createContext<React.Dispatch<EditorAction> | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

interface ProfileEditorProviderProps {
  children: React.ReactNode;
  initialProfile: Record<string, unknown>;
  profileType: ProfileType;
  initialThemeId?: string;
  initialSectionOrder?: string[];
}

export const ProfileEditorProvider: React.FC<ProfileEditorProviderProps> = ({
  children,
  initialProfile,
  profileType,
  initialThemeId,
  initialSectionOrder,
}) => {
  const [state, dispatch] = useReducer(
    editorReducer,
    createInitialState(profileType, initialProfile, initialSectionOrder, initialThemeId),
  );

  // Reset when initial data changes (e.g., profile reload)
  useEffect(() => {
    dispatch({
      type: 'RESET',
      profile: initialProfile,
      sectionOrder: initialSectionOrder,
    });
  }, [initialProfile, initialSectionOrder]);

  const stateValue = useMemo(() => state, [state]);

  return (
    <EditorStateContext.Provider value={stateValue}>
      <EditorDispatchContext.Provider value={dispatch}>
        {children}
      </EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Returns the current editor state.
 */
export function useProfileEditor(): ProfileEditorState {
  const context = useContext(EditorStateContext);
  if (context === undefined) {
    throw new Error('useProfileEditor must be used within a ProfileEditorProvider');
  }
  return context;
}

/**
 * Returns the dispatch function for editor actions.
 */
export function useProfileEditorDispatch(): React.Dispatch<EditorAction> {
  const context = useContext(EditorDispatchContext);
  if (context === undefined) {
    throw new Error('useProfileEditorDispatch must be used within a ProfileEditorProvider');
  }
  return context;
}
