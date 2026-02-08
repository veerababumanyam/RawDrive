/**
 * TemplatePickerPanel Component
 *
 * Panel for browsing and applying album templates.
 * Supports filtering by album type and previewing templates before applying.
 */

import React, { useState, useMemo } from 'react';
import type { AlbumTemplate, AlbumType, SpreadTemplate } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplatePickerPanelProps {
  /** Available templates */
  templates: AlbumTemplate[];
  /** Current album type for filtering */
  currentAlbumType?: AlbumType;
  /** Whether templates are loading */
  isLoading: boolean;
  /** Callback when template is selected */
  onApplyTemplate: (template: AlbumTemplate) => void;
  /** Callback when spread template is applied to current spread */
  onApplySpreadTemplate: (spreadTemplate: SpreadTemplate) => void;
  /** Callback to close panel */
  onClose: () => void;
  /** Class name for container */
  className?: string;
}

type TabType = 'album' | 'spread';

// ---------------------------------------------------------------------------
// Album Type Labels
// ---------------------------------------------------------------------------

const ALBUM_TYPE_LABELS: Record<AlbumType, string> = {
  wedding: 'Wedding',
  portrait: 'Portrait',
  events: 'Events',
  family: 'Family',
  newborn: 'Newborn',
  corporate: 'Corporate',
  custom: 'Custom',
};

// ---------------------------------------------------------------------------
// Default Templates (when API doesn't return any)
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: AlbumTemplate[] = [
  {
    id: 'template-wedding-classic',
    name: 'Classic Wedding',
    description: 'Elegant traditional wedding album with full-spread layouts',
    album_type: 'wedding',
    thumbnail_url: '/assets/templates/wedding-classic.jpg',
    default_width: 3600,
    default_height: 2400,
    spread_templates: [
      {
        id: 'spread-cover',
        name: 'Cover',
        spread_type: 'single_page',
        thumbnail_url: '/assets/templates/spreads/cover.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 0,
            y: 0,
            width: 3600,
            height: 2400,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'text',
            x: 1600,
            y: 2100,
            width: 400,
            height: 100,
            rotation: 0,
            z_index: 2,
            opacity: 1,
            content: { text: 'Our Wedding' },
            style: {
              font_family: 'Playfair Display',
              font_size: 48,
              text_color: '#ffffff',
              text_align: 'center',
            },
          },
        ],
      },
      {
        id: 'spread-full-photo',
        name: 'Full Spread Photo',
        spread_type: 'full_spread',
        thumbnail_url: '/assets/templates/spreads/full-photo.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 0,
            y: 0,
            width: 7200,
            height: 2400,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
      {
        id: 'spread-two-photos',
        name: 'Two Photos',
        spread_type: 'full_spread',
        thumbnail_url: '/assets/templates/spreads/two-photos.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 100,
            y: 100,
            width: 3400,
            height: 2200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 3700,
            y: 100,
            width: 3400,
            height: 2200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
    ],
    is_premium: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-portrait-minimal',
    name: 'Minimal Portrait',
    description: 'Clean, minimalist portrait album with generous white space',
    album_type: 'portrait',
    thumbnail_url: '/assets/templates/portrait-minimal.jpg',
    default_width: 3000,
    default_height: 3000,
    spread_templates: [
      {
        id: 'spread-centered',
        name: 'Centered Portrait',
        spread_type: 'single_page',
        thumbnail_url: '/assets/templates/spreads/centered.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 500,
            y: 500,
            width: 2000,
            height: 2000,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
    ],
    is_premium: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-events-dynamic',
    name: 'Dynamic Events',
    description: 'Vibrant event album with collage-style layouts',
    album_type: 'events',
    thumbnail_url: '/assets/templates/events-dynamic.jpg',
    default_width: 3600,
    default_height: 2400,
    spread_templates: [
      {
        id: 'spread-collage-4',
        name: '4-Photo Collage',
        spread_type: 'full_spread',
        thumbnail_url: '/assets/templates/spreads/collage-4.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 100,
            y: 100,
            width: 3400,
            height: 1100,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 3700,
            y: 100,
            width: 3400,
            height: 1100,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 100,
            y: 1300,
            width: 3400,
            height: 1000,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 3700,
            y: 1300,
            width: 3400,
            height: 1000,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
    ],
    is_premium: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-family-warm',
    name: 'Warm Family',
    description: 'Cozy family album with soft borders and warm tones',
    album_type: 'family',
    thumbnail_url: '/assets/templates/family-warm.jpg',
    default_width: 3600,
    default_height: 2700,
    spread_templates: [
      {
        id: 'spread-family-grid',
        name: 'Family Grid',
        spread_type: 'full_spread',
        thumbnail_url: '/assets/templates/spreads/family-grid.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 200,
            y: 200,
            width: 2200,
            height: 2300,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 2600,
            y: 200,
            width: 2200,
            height: 1100,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 2600,
            y: 1400,
            width: 2200,
            height: 1100,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 5000,
            y: 200,
            width: 2000,
            height: 2300,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
    ],
    is_premium: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-newborn-soft',
    name: 'Soft Newborn',
    description: 'Gentle newborn album with delicate pastel accents',
    album_type: 'newborn',
    thumbnail_url: '/assets/templates/newborn-soft.jpg',
    default_width: 3000,
    default_height: 3000,
    spread_templates: [
      {
        id: 'spread-newborn-single',
        name: 'Single Portrait',
        spread_type: 'single_page',
        thumbnail_url: '/assets/templates/spreads/newborn-single.jpg',
        elements: [
          {
            element_type: 'shape',
            x: 100,
            y: 100,
            width: 2800,
            height: 2800,
            rotation: 0,
            z_index: 1,
            opacity: 0.1,
            content: {},
            style: {
              fill_color: '#fce7f3',
              border_radius: 1400,
            },
          },
          {
            element_type: 'photo',
            x: 400,
            y: 400,
            width: 2200,
            height: 2200,
            rotation: 0,
            z_index: 2,
            opacity: 1,
            content: {},
            style: {
              border_radius: 1100,
            },
          },
        ],
      },
    ],
    is_premium: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-corporate-professional',
    name: 'Professional Corporate',
    description: 'Sleek corporate album for headshots and team photos',
    album_type: 'corporate',
    thumbnail_url: '/assets/templates/corporate-professional.jpg',
    default_width: 4200,
    default_height: 2970,
    spread_templates: [
      {
        id: 'spread-team-grid',
        name: 'Team Grid',
        spread_type: 'full_spread',
        thumbnail_url: '/assets/templates/spreads/team-grid.jpg',
        elements: [
          {
            element_type: 'photo',
            x: 200,
            y: 200,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 2200,
            y: 200,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 4200,
            y: 200,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 6200,
            y: 200,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 200,
            y: 1570,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 2200,
            y: 1570,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 4200,
            y: 1570,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
          {
            element_type: 'photo',
            x: 6200,
            y: 1570,
            width: 1800,
            height: 1200,
            rotation: 0,
            z_index: 1,
            opacity: 1,
            content: {},
            style: {},
          },
        ],
      },
    ],
    is_premium: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TemplatePickerPanel: React.FC<TemplatePickerPanelProps> = ({
  templates: propTemplates,
  currentAlbumType,
  isLoading,
  onApplyTemplate,
  onApplySpreadTemplate,
  onClose,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('album');
  const [selectedType, setSelectedType] = useState<AlbumType | 'all'>(
    currentAlbumType || 'all'
  );
  const [previewTemplate, setPreviewTemplate] = useState<AlbumTemplate | null>(null);
  const [previewSpread, setPreviewSpread] = useState<SpreadTemplate | null>(null);

  // Merge prop templates with defaults
  const templates = useMemo(() => {
    if (propTemplates.length > 0) return propTemplates;
    return DEFAULT_TEMPLATES;
  }, [propTemplates]);

  // Filter templates by album type
  const filteredTemplates = useMemo(() => {
    if (selectedType === 'all') return templates;
    return templates.filter((t) => t.album_type === selectedType);
  }, [templates, selectedType]);

  // Get all spread templates from all templates
  const allSpreadTemplates = useMemo(() => {
    const spreads: Array<SpreadTemplate & { albumName: string }> = [];
    templates.forEach((template) => {
      template.spread_templates.forEach((spread) => {
        spreads.push({ ...spread, albumName: template.name });
      });
    });
    return spreads;
  }, [templates]);

  // Handle apply template
  const handleApplyTemplate = (template: AlbumTemplate) => {
    onApplyTemplate(template);
    setPreviewTemplate(null);
  };

  // Handle apply spread template
  const handleApplySpread = (spread: SpreadTemplate) => {
    onApplySpreadTemplate(spread);
    setPreviewSpread(null);
  };

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Templates</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('album')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'album'
              ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Album Templates
        </button>
        <button
          onClick={() => setActiveTab('spread')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'spread'
              ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Spread Layouts
        </button>
      </div>

      {/* Album Type Filter (for album tab) */}
      {activeTab === 'album' && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as AlbumType | 'all')}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Types</option>
            {Object.entries(ALBUM_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : activeTab === 'album' ? (
          <div className="grid grid-cols-1 gap-3">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={() => setPreviewTemplate(template)}
                onApply={() => handleApplyTemplate(template)}
              />
            ))}
            {filteredTemplates.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No templates available for this type.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {allSpreadTemplates.map((spread) => (
              <SpreadTemplateCard
                key={spread.id}
                spread={spread}
                albumName={spread.albumName}
                onPreview={() => setPreviewSpread(spread)}
                onApply={() => handleApplySpread(spread)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Album Template Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onApply={() => handleApplyTemplate(previewTemplate)}
        />
      )}

      {/* Spread Preview Modal */}
      {previewSpread && (
        <SpreadPreviewModal
          spread={previewSpread}
          onClose={() => setPreviewSpread(null)}
          onApply={() => handleApplySpread(previewSpread)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  template: AlbumTemplate;
  onPreview: () => void;
  onApply: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onPreview, onApply }) => {
  return (
    <div className="relative group bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-700">
        {template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Premium Badge */}
        {template.is_premium && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500 text-white text-xs font-medium rounded">
            Premium
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={onPreview}
            className="px-3 py-1.5 text-sm bg-white text-gray-900 rounded-md hover:bg-gray-100"
          >
            Preview
          </button>
          <button
            onClick={onApply}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm">
          {template.name}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {template.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
            {ALBUM_TYPE_LABELS[template.album_type]}
          </span>
          <span className="text-xs text-gray-400">
            {template.spread_templates.length} spreads
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Spread Template Card
// ---------------------------------------------------------------------------

interface SpreadTemplateCardProps {
  spread: SpreadTemplate;
  albumName: string;
  onPreview: () => void;
  onApply: () => void;
}

const SpreadTemplateCard: React.FC<SpreadTemplateCardProps> = ({
  spread,
  albumName,
  onPreview,
  onApply,
}) => {
  return (
    <div className="relative group bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Thumbnail */}
      <div className="aspect-[16/9] bg-gray-200 dark:bg-gray-700">
        {spread.thumbnail_url ? (
          <img
            src={spread.thumbnail_url}
            alt={spread.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <SpreadTemplatePreview spread={spread} />
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={onPreview}
            className="p-1.5 bg-white text-gray-900 rounded-md hover:bg-gray-100"
            title="Preview"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
          <button
            onClick={onApply}
            className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            title="Apply to current spread"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <h4 className="font-medium text-gray-900 dark:text-white text-xs truncate">
          {spread.name}
        </h4>
        <p className="text-xs text-gray-400 truncate">{albumName}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Spread Template Preview (Mini)
// ---------------------------------------------------------------------------

interface SpreadTemplatePreviewProps {
  spread: SpreadTemplate;
}

const SpreadTemplatePreview: React.FC<SpreadTemplatePreviewProps> = ({ spread }) => {
  const width = spread.spread_type === 'full_spread' ? 200 : 100;
  const height = 66;
  const scale = 0.02;

  return (
    <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-600">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {spread.elements.map((el, idx) => {
          const x = el.x * scale;
          const y = el.y * scale;
          const w = el.width * scale;
          const h = el.height * scale;

          if (el.element_type === 'photo') {
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#e5e7eb"
                stroke="#9ca3af"
                strokeWidth={0.5}
              />
            );
          } else if (el.element_type === 'text') {
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#dbeafe"
                stroke="#93c5fd"
                strokeWidth={0.5}
              />
            );
          } else if (el.element_type === 'shape') {
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#fce7f3"
                stroke="#f9a8d4"
                strokeWidth={0.5}
                rx={el.style?.border_radius ? (el.style.border_radius * scale) : 0}
              />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Template Preview Modal
// ---------------------------------------------------------------------------

interface TemplatePreviewModalProps {
  template: AlbumTemplate;
  onClose: () => void;
  onApply: () => void;
}

const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  onClose,
  onApply,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
              {template.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {template.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Main Image */}
          <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-700 rounded-lg mb-4">
            {template.thumbnail_url ? (
              <img
                src={template.thumbnail_url}
                alt={template.name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-400">No preview available</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Album Type</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {ALBUM_TYPE_LABELS[template.album_type]}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Default Size</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {template.default_width} × {template.default_height} px
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Spread Templates</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {template.spread_templates.length} layouts included
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Tier</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {template.is_premium ? 'Premium' : 'Free'}
              </p>
            </div>
          </div>

          {/* Spread Previews */}
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Included Spreads
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {template.spread_templates.map((spread) => (
                <div
                  key={spread.id}
                  className="flex-shrink-0 w-32 bg-gray-100 dark:bg-gray-800 rounded p-2"
                >
                  <SpreadTemplatePreview spread={spread} />
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 text-center truncate">
                    {spread.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply Template
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Spread Preview Modal
// ---------------------------------------------------------------------------

interface SpreadPreviewModalProps {
  spread: SpreadTemplate;
  onClose: () => void;
  onApply: () => void;
}

const SpreadPreviewModal: React.FC<SpreadPreviewModalProps> = ({
  spread,
  onClose,
  onApply,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{spread.name}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview */}
        <div className="p-6">
          <div className="aspect-[16/9] bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${spread.spread_type === 'full_spread' ? 400 : 200} 133`}
              preserveAspectRatio="xMidYMid meet"
            >
              <rect
                x="0"
                y="0"
                width={spread.spread_type === 'full_spread' ? 400 : 200}
                height="133"
                fill="white"
              />
              {spread.elements.map((el, idx) => {
                const scale = 0.04;
                const x = el.x * scale;
                const y = el.y * scale;
                const w = el.width * scale;
                const h = el.height * scale;

                if (el.element_type === 'photo') {
                  return (
                    <g key={idx}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill="#e5e7eb"
                        stroke="#9ca3af"
                        strokeWidth={1}
                      />
                      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="#9ca3af" strokeWidth={0.5} />
                      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="#9ca3af" strokeWidth={0.5} />
                    </g>
                  );
                } else if (el.element_type === 'text') {
                  return (
                    <rect
                      key={idx}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="#dbeafe"
                      stroke="#3b82f6"
                      strokeWidth={1}
                    />
                  );
                } else if (el.element_type === 'shape') {
                  return (
                    <rect
                      key={idx}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={el.style?.fill_color || '#fce7f3'}
                      stroke="#ec4899"
                      strokeWidth={1}
                      rx={el.style?.border_radius ? (el.style.border_radius * scale) : 0}
                    />
                  );
                }
                return null;
              })}
            </svg>
          </div>

          <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            <p>
              <span className="font-medium">Type:</span>{' '}
              {spread.spread_type === 'full_spread' ? 'Full Spread (2 pages)' : 'Single Page'}
            </p>
            <p>
              <span className="font-medium">Elements:</span> {spread.elements.length} placeholders
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply to Current Spread
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplatePickerPanel;
