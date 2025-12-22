import React, { forwardRef } from 'react';
import { GlassCard, GlassCardProps, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent, GlassCardFooter } from './GlassCard';

/* =============================================================================
   AppCard Component

   A wrapper around GlassCard for feature displays.
   ============================================================================= */

export interface AppCardProps extends GlassCardProps {
    /** Optional separate title/description props for simpler usage */
    title?: string;
    description?: string;
}

export const AppCard = forwardRef<HTMLDivElement, AppCardProps>(
    ({ children, title, description, ...props }, ref) => {
        return (
            <GlassCard ref={ref} {...props}>
                {(title || description) && (
                    <GlassCardHeader>
                        {title && <GlassCardTitle>{title}</GlassCardTitle>}
                        {description && <GlassCardDescription>{description}</GlassCardDescription>}
                    </GlassCardHeader>
                )}
                <GlassCardContent>
                    {children}
                </GlassCardContent>
            </GlassCard>
        );
    }
);

AppCard.displayName = 'AppCard';

export const AppCardHeader = GlassCardHeader;
export const AppCardTitle = GlassCardTitle;
export const AppCardDescription = GlassCardDescription;
export const AppCardContent = GlassCardContent;
export const AppCardFooter = GlassCardFooter;

export default AppCard;
