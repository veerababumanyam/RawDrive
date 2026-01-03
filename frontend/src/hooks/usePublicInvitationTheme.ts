import { usePublicTheme } from './usePublicTheme';
import type { PublicTheme } from './usePublicTheme';

/* =============================================================================
   usePublicInvitationTheme Hook

   Thin wrapper around usePublicTheme for public invitation pages (/i/{token}).
   Automatically detects and follows the user's system theme preference.
   ============================================================================= */

export type PublicInvitationTheme = PublicTheme;

/**
 * Hook for managing public invitation page theme (auto-detection only)
 *
 * @example
 * ```tsx
 * const { theme, isDark } = usePublicInvitationTheme();
 *
 * return (
 *   <div data-theme={theme}>
 *     <InvitationContent />
 *   </div>
 * );
 * ```
 */
export const usePublicInvitationTheme = () => {
  return usePublicTheme();
};

export default usePublicInvitationTheme;
