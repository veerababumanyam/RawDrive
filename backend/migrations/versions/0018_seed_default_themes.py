"""Seed default themes for Public Profile Editor.

Creates 5 pre-built modern themes:
- Minimal: Clean, simple, whitespace-focused
- Bold: High contrast, vibrant colors
- Elegant: Sophisticated, refined typography
- Modern: Contemporary gradients, glassmorphism
- Creative: Expressive, artistic layouts

Revision ID: 0018
Revises: 0017
Create Date: 2025-12-21
"""

from alembic import op
import json

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


# Theme definitions with complete configuration
THEMES = [
    {
        "name": "Minimal",
        "category": "minimal",
        "description": "Clean and simple design with plenty of whitespace. Perfect for photographers who want their work to speak for itself.",
        "preview_image_url": "/themes/minimal-preview.jpg",
        "base_colors": {
            "primary": "#0F172A",
            "secondary": "#64748B",
            "accent": "#0EA5E9",
            "neutral": ["#F8FAFC", "#F1F5F9", "#E2E8F0", "#CBD5E1"],
            "gradients": []
        },
        "default_typography": {
            "heading_font": {
                "family": "Inter",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [600, 700]
            },
            "body_font": {
                "family": "Inter",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [400, 500]
            }
        },
        "layout_config": {
            "spacing": "spacious",
            "hero_style": "card",
            "section_layout": "single-column"
        },
        "is_premium": False,
        "is_popular": True,
        "supports_dark_mode": True,
        "variants": [
            {
                "variant_id": "minimal-light",
                "name": "light",
                "colors": {
                    "background": "#FFFFFF",
                    "surface": "#F8FAFC",
                    "text_primary": "#0F172A",
                    "text_secondary": "#64748B"
                }
            },
            {
                "variant_id": "minimal-dark",
                "name": "dark",
                "colors": {
                    "background": "#0F172A",
                    "surface": "#1E293B",
                    "text_primary": "#F8FAFC",
                    "text_secondary": "#94A3B8"
                }
            }
        ]
    },
    {
        "name": "Bold",
        "category": "bold",
        "description": "High contrast design with vibrant accent colors. Makes a strong statement and captures attention instantly.",
        "preview_image_url": "/themes/bold-preview.jpg",
        "base_colors": {
            "primary": "#18181B",
            "secondary": "#3F3F46",
            "accent": "#EF4444",
            "neutral": ["#FAFAFA", "#F4F4F5", "#E4E4E7", "#D4D4D8"],
            "gradients": [
                {
                    "name": "hero",
                    "type": "linear",
                    "direction": "135deg",
                    "stops": ["#EF4444", "#F97316"]
                }
            ]
        },
        "default_typography": {
            "heading_font": {
                "family": "Poppins",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [700, 800]
            },
            "body_font": {
                "family": "Open Sans",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [400, 600]
            }
        },
        "layout_config": {
            "spacing": "normal",
            "hero_style": "full-bleed",
            "section_layout": "single-column"
        },
        "is_premium": False,
        "is_popular": True,
        "supports_dark_mode": True,
        "variants": [
            {
                "variant_id": "bold-light",
                "name": "light",
                "colors": {
                    "background": "#FFFFFF",
                    "surface": "#FAFAFA",
                    "text_primary": "#18181B",
                    "text_secondary": "#52525B"
                }
            },
            {
                "variant_id": "bold-dark",
                "name": "dark",
                "colors": {
                    "background": "#18181B",
                    "surface": "#27272A",
                    "text_primary": "#FAFAFA",
                    "text_secondary": "#A1A1AA"
                }
            }
        ]
    },
    {
        "name": "Elegant",
        "category": "elegant",
        "description": "Sophisticated design with refined typography and subtle accents. Perfect for luxury and fine art photography.",
        "preview_image_url": "/themes/elegant-preview.jpg",
        "base_colors": {
            "primary": "#1C1917",
            "secondary": "#78716C",
            "accent": "#D4AF37",
            "neutral": ["#FAFAF9", "#F5F5F4", "#E7E5E4", "#D6D3D1"],
            "gradients": []
        },
        "default_typography": {
            "heading_font": {
                "family": "Playfair Display",
                "source": "web",
                "fallback": ["Georgia", "serif"],
                "weights": [500, 600, 700]
            },
            "body_font": {
                "family": "Lato",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [300, 400, 500]
            },
            "accent_font": {
                "family": "Cormorant Garamond",
                "source": "web",
                "fallback": ["Georgia", "serif"],
                "weights": [400, 500]
            }
        },
        "layout_config": {
            "spacing": "spacious",
            "hero_style": "card",
            "section_layout": "single-column"
        },
        "is_premium": False,
        "is_popular": False,
        "supports_dark_mode": True,
        "variants": [
            {
                "variant_id": "elegant-light",
                "name": "light",
                "colors": {
                    "background": "#FAFAF9",
                    "surface": "#FFFFFF",
                    "text_primary": "#1C1917",
                    "text_secondary": "#57534E"
                }
            },
            {
                "variant_id": "elegant-dark",
                "name": "dark",
                "colors": {
                    "background": "#1C1917",
                    "surface": "#292524",
                    "text_primary": "#FAFAF9",
                    "text_secondary": "#A8A29E"
                }
            }
        ]
    },
    {
        "name": "Modern",
        "category": "modern",
        "description": "Contemporary design featuring gradients and glassmorphism effects. Trendy and visually striking.",
        "preview_image_url": "/themes/modern-preview.jpg",
        "base_colors": {
            "primary": "#0F172A",
            "secondary": "#475569",
            "accent": "#06B6D4",
            "neutral": ["#F8FAFC", "#F1F5F9", "#E2E8F0", "#CBD5E1"],
            "gradients": [
                {
                    "name": "hero",
                    "type": "linear",
                    "direction": "135deg",
                    "stops": ["#06B6D4", "#8B5CF6"]
                },
                {
                    "name": "accent",
                    "type": "linear",
                    "direction": "90deg",
                    "stops": ["#0EA5E9", "#06B6D4"]
                }
            ]
        },
        "default_typography": {
            "heading_font": {
                "family": "Plus Jakarta Sans",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [600, 700, 800]
            },
            "body_font": {
                "family": "Inter",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [400, 500]
            }
        },
        "layout_config": {
            "spacing": "normal",
            "hero_style": "full-bleed",
            "section_layout": "two-column"
        },
        "is_premium": False,
        "is_popular": True,
        "supports_dark_mode": True,
        "variants": [
            {
                "variant_id": "modern-light",
                "name": "light",
                "colors": {
                    "background": "#F8FAFC",
                    "surface": "#FFFFFF",
                    "text_primary": "#0F172A",
                    "text_secondary": "#64748B",
                    "glass": "rgba(255, 255, 255, 0.8)",
                    "glass_border": "rgba(255, 255, 255, 0.2)"
                }
            },
            {
                "variant_id": "modern-dark",
                "name": "dark",
                "colors": {
                    "background": "#0F172A",
                    "surface": "#1E293B",
                    "text_primary": "#F8FAFC",
                    "text_secondary": "#94A3B8",
                    "glass": "rgba(15, 23, 42, 0.8)",
                    "glass_border": "rgba(255, 255, 255, 0.1)"
                }
            }
        ]
    },
    {
        "name": "Creative",
        "category": "creative",
        "description": "Expressive and artistic design with unique layouts and dynamic elements. For photographers who push boundaries.",
        "preview_image_url": "/themes/creative-preview.jpg",
        "base_colors": {
            "primary": "#1E1B4B",
            "secondary": "#4338CA",
            "accent": "#F472B6",
            "neutral": ["#FAFAFA", "#F4F4F5", "#E4E4E7", "#D4D4D8"],
            "gradients": [
                {
                    "name": "hero",
                    "type": "linear",
                    "direction": "45deg",
                    "stops": ["#4338CA", "#7C3AED", "#F472B6"]
                },
                {
                    "name": "accent",
                    "type": "radial",
                    "stops": ["#F472B6", "#EC4899"]
                }
            ]
        },
        "default_typography": {
            "heading_font": {
                "family": "Space Grotesk",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [500, 600, 700]
            },
            "body_font": {
                "family": "DM Sans",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [400, 500]
            },
            "accent_font": {
                "family": "Syne",
                "source": "web",
                "fallback": ["system-ui", "sans-serif"],
                "weights": [700, 800]
            }
        },
        "layout_config": {
            "spacing": "compact",
            "hero_style": "full-bleed",
            "section_layout": "two-column"
        },
        "is_premium": False,
        "is_popular": False,
        "supports_dark_mode": True,
        "variants": [
            {
                "variant_id": "creative-light",
                "name": "light",
                "colors": {
                    "background": "#FAFAFA",
                    "surface": "#FFFFFF",
                    "text_primary": "#1E1B4B",
                    "text_secondary": "#4C4F69"
                }
            },
            {
                "variant_id": "creative-dark",
                "name": "dark",
                "colors": {
                    "background": "#1E1B4B",
                    "surface": "#2E2B5B",
                    "text_primary": "#FAFAFA",
                    "text_secondary": "#C4C4CC"
                }
            }
        ]
    }
]


def upgrade() -> None:
    # Insert all themes
    for theme in THEMES:
        op.execute(
            f"""
            INSERT INTO themes (
                name, category, description, preview_image_url,
                base_colors, default_typography, layout_config,
                is_premium, is_popular, supports_dark_mode, variants
            ) VALUES (
                '{theme["name"]}',
                '{theme["category"]}',
                '{theme["description"].replace("'", "''")}',
                '{theme["preview_image_url"]}',
                '{json.dumps(theme["base_colors"])}'::jsonb,
                '{json.dumps(theme["default_typography"])}'::jsonb,
                '{json.dumps(theme["layout_config"])}'::jsonb,
                {str(theme["is_premium"]).lower()},
                {str(theme["is_popular"]).lower()},
                {str(theme["supports_dark_mode"]).lower()},
                '{json.dumps(theme["variants"])}'::jsonb
            )
            ON CONFLICT DO NOTHING;
            """
        )


def downgrade() -> None:
    # Remove seeded themes (only the ones we added)
    theme_names = ", ".join([f"'{t['name']}'" for t in THEMES])
    op.execute(f"DELETE FROM themes WHERE name IN ({theme_names});")
