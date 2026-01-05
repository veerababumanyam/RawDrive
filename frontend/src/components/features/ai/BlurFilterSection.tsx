/**
 * BlurFilterSection Component
 *
 * Accessible blur filter controls for AI photo filtering.
 * Uses semantic HTML and ARIA attributes for screen reader support.
 *
 * Feature: 025-ai-filter-simplify (T059 accessibility)
 */

import React, { useId } from 'react';
import { Checkbox } from '../../ui/FormControls';

interface BlurFilterSectionProps {
  blurHide: boolean;
  blurShowBokeh: boolean;
  onChange: (values: { blurHide?: boolean; blurShowBokeh?: boolean }) => void;
}

export const BlurFilterSection: React.FC<BlurFilterSectionProps> = ({
  blurHide,
  blurShowBokeh,
  onChange,
}) => {
  const hideId = useId();
  const bokehId = useId();
  const hideDescId = `${hideId}-desc`;
  const bokehDescId = `${bokehId}-desc`;

  return (
    <fieldset className="space-y-2 border-0 p-0 m-0">
      <legend className="text-sm font-semibold text-text-primary mb-2">
        Blur Filter
      </legend>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Checkbox
            id={hideId}
            checked={blurHide}
            onChange={(e) => onChange({ blurHide: e.target.checked })}
            aria-describedby={hideDescId}
          />
          <div className="flex flex-col">
            <label htmlFor={hideId} className="text-sm text-text-secondary cursor-pointer">
              Hide blurry photos
            </label>
            <span id={hideDescId} className="text-xs text-text-tertiary">
              Hides photos detected as out of focus or motion-blurred
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id={bokehId}
            checked={blurShowBokeh}
            onChange={(e) => onChange({ blurShowBokeh: e.target.checked })}
            aria-describedby={bokehDescId}
            disabled={!blurHide}
          />
          <div className="flex flex-col">
            <label
              htmlFor={bokehId}
              className={`text-sm cursor-pointer ${!blurHide ? 'text-text-tertiary' : 'text-text-secondary'}`}
            >
              Show artistic bokeh
            </label>
            <span id={bokehDescId} className="text-xs text-text-tertiary">
              Keep photos with intentional background blur (portrait mode)
            </span>
          </div>
        </div>
      </div>
    </fieldset>
  );
};
