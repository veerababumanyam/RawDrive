/**
 * ElementPropertiesPanel Component
 *
 * Right panel for editing properties of selected elements or the spread.
 */

import React, { useState } from 'react';
import type { AlbumSpread, AlbumSpreadElement } from '@rawdrive/shared-types';
import { ElementType } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ElementPropertiesPanelProps {
  /** Selected elements */
  elements: AlbumSpreadElement[];
  /** Current spread */
  spread?: AlbumSpread;
  /** Callback when element is updated */
  onElementUpdate: (elementId: string, updates: Partial<AlbumSpreadElement>) => void;
  /** Callback when spread is updated */
  onSpreadUpdate: (spreadId: string, updates: Partial<AlbumSpread>) => void;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Property Input Components
// ---------------------------------------------------------------------------

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}) => (
  <div className="flex items-center justify-between">
    <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1 text-sm text-right bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {unit && <span className="text-xs text-gray-500 dark:text-gray-400">{unit}</span>}
    </div>
  </div>
);

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorInput: React.FC<ColorInputProps> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between">
    <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 p-0 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
      />
    </div>
  </div>
);

interface SelectInputProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const SelectInput: React.FC<SelectInputProps> = ({ label, value, options, onChange }) => (
  <div className="flex items-center justify-between">
    <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// ---------------------------------------------------------------------------
// Property Sections
// ---------------------------------------------------------------------------

interface TransformSectionProps {
  element: AlbumSpreadElement;
  onUpdate: (updates: Partial<AlbumSpreadElement>) => void;
}

const TransformSection: React.FC<TransformSectionProps> = ({ element, onUpdate }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      Transform
    </h3>
    <div className="grid grid-cols-2 gap-2">
      <NumberInput label="X" value={Math.round(element.x)} onChange={(x) => onUpdate({ x })} unit="px" />
      <NumberInput label="Y" value={Math.round(element.y)} onChange={(y) => onUpdate({ y })} unit="px" />
      <NumberInput
        label="W"
        value={Math.round(element.width)}
        onChange={(width) => onUpdate({ width })}
        min={10}
        unit="px"
      />
      <NumberInput
        label="H"
        value={Math.round(element.height)}
        onChange={(height) => onUpdate({ height })}
        min={10}
        unit="px"
      />
    </div>
    <NumberInput
      label="Rotation"
      value={element.rotation}
      onChange={(rotation) => onUpdate({ rotation })}
      min={-360}
      max={360}
      unit="deg"
    />
    <NumberInput
      label="Opacity"
      value={element.opacity * 100}
      onChange={(opacity) => onUpdate({ opacity: opacity / 100 })}
      min={0}
      max={100}
      unit="%"
    />
  </div>
);

interface TextStyleSectionProps {
  element: AlbumSpreadElement;
  onUpdate: (updates: Partial<AlbumSpreadElement>) => void;
}

const TextStyleSection: React.FC<TextStyleSectionProps> = ({ element, onUpdate }) => {
  const style = element.style || {};

  const fontFamilies = [
    { value: 'Inter', label: 'Inter' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Playfair Display', label: 'Playfair Display' },
    { value: 'Lora', label: 'Lora' },
    { value: 'Montserrat', label: 'Montserrat' },
  ];

  const textAlignOptions = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
    { value: 'justify', label: 'Justify' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Typography
      </h3>
      <SelectInput
        label="Font"
        value={style.font_family || 'Inter'}
        options={fontFamilies}
        onChange={(font_family) => onUpdate({ style: { ...style, font_family } })}
      />
      <NumberInput
        label="Size"
        value={style.font_size || 16}
        onChange={(font_size) => onUpdate({ style: { ...style, font_size } })}
        min={8}
        max={200}
        unit="px"
      />
      <SelectInput
        label="Align"
        value={style.text_align || 'left'}
        options={textAlignOptions}
        onChange={(text_align) =>
          onUpdate({ style: { ...style, text_align: text_align as 'left' | 'center' | 'right' | 'justify' } })
        }
      />
      <ColorInput
        label="Color"
        value={style.text_color || '#000000'}
        onChange={(text_color) => onUpdate({ style: { ...style, text_color } })}
      />
      <NumberInput
        label="Line Height"
        value={style.line_height || 1.5}
        onChange={(line_height) => onUpdate({ style: { ...style, line_height } })}
        min={0.5}
        max={3}
        step={0.1}
      />
    </div>
  );
};

interface FillStrokeSectionProps {
  element: AlbumSpreadElement;
  onUpdate: (updates: Partial<AlbumSpreadElement>) => void;
}

const FillStrokeSection: React.FC<FillStrokeSectionProps> = ({ element, onUpdate }) => {
  const style = element.style || {};

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Fill & Stroke
      </h3>
      <ColorInput
        label="Fill"
        value={style.fill_color || '#e5e7eb'}
        onChange={(fill_color) => onUpdate({ style: { ...style, fill_color } })}
      />
      <ColorInput
        label="Stroke"
        value={style.stroke_color || '#000000'}
        onChange={(stroke_color) => onUpdate({ style: { ...style, stroke_color } })}
      />
      <NumberInput
        label="Stroke Width"
        value={style.stroke_width || 0}
        onChange={(stroke_width) => onUpdate({ style: { ...style, stroke_width } })}
        min={0}
        max={20}
        unit="px"
      />
      <NumberInput
        label="Border Radius"
        value={style.border_radius || 0}
        onChange={(border_radius) => onUpdate({ style: { ...style, border_radius } })}
        min={0}
        unit="px"
      />
    </div>
  );
};

interface SpreadPropertiesSectionProps {
  spread: AlbumSpread;
  onUpdate: (updates: Partial<AlbumSpread>) => void;
}

const SpreadPropertiesSection: React.FC<SpreadPropertiesSectionProps> = ({ spread, onUpdate }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      Spread
    </h3>
    <ColorInput
      label="Background"
      value={spread.background_color || '#ffffff'}
      onChange={(background_color) => onUpdate({ background_color })}
    />
    <div className="text-xs text-gray-500 dark:text-gray-400">
      Pages: {spread.page_numbers.join('-')}
    </div>
    <div className="text-xs text-gray-500 dark:text-gray-400">
      Elements: {spread.elements.length}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
  elements,
  spread,
  onElementUpdate,
  onSpreadUpdate,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'element' | 'spread'>('element');

  const selectedElement = elements.length === 1 ? elements[0] : null;
  const multiSelect = elements.length > 1;

  const handleElementUpdate = (updates: Partial<AlbumSpreadElement>) => {
    if (selectedElement) {
      onElementUpdate(selectedElement.id, updates);
    }
  };

  return (
    <div className={`flex flex-col bg-white dark:bg-gray-900 overflow-hidden ${className}`}>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'element'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('element')}
        >
          Element
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'spread'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('spread')}
        >
          Spread
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'element' ? (
          <>
            {selectedElement ? (
              <>
                {/* Element Type Badge */}
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                    {selectedElement.element_type}
                  </span>
                  {selectedElement.locked && (
                    <span className="px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded">
                      Locked
                    </span>
                  )}
                </div>

                {/* Transform Section */}
                <TransformSection element={selectedElement} onUpdate={handleElementUpdate} />

                {/* Type-specific sections */}
                {selectedElement.element_type === ElementType.TEXT && (
                  <TextStyleSection element={selectedElement} onUpdate={handleElementUpdate} />
                )}

                {(selectedElement.element_type === ElementType.SHAPE ||
                  selectedElement.element_type === ElementType.FRAME) && (
                  <FillStrokeSection element={selectedElement} onUpdate={handleElementUpdate} />
                )}

                {/* Lock Toggle */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Lock element</span>
                    <input
                      type="checkbox"
                      checked={selectedElement.locked}
                      onChange={(e) => handleElementUpdate({ locked: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </>
            ) : multiSelect ? (
              <div className="text-center py-8">
                <div className="text-gray-400 dark:text-gray-600 mb-2">
                  <svg
                    className="w-12 h-12 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {elements.length} elements selected
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Select a single element to edit properties
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 dark:text-gray-600 mb-2">
                  <svg
                    className="w-12 h-12 mx-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No element selected
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Click on an element to edit its properties
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {spread ? (
              <SpreadPropertiesSection
                spread={spread}
                onUpdate={(updates) => onSpreadUpdate(spread.id, updates)}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No spread selected
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ElementPropertiesPanel;
