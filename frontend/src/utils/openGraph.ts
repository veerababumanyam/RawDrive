/**
 * Open Graph Meta Tags Utility
 *
 * Generates Open Graph and Twitter Card meta tags for invitation sharing.
 * Used by the public invitation page for social media previews.
 *
 * Feature: 016-save-the-date Phase 9
 */

export interface OpenGraphData {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  siteName?: string;
  type?: 'website' | 'article' | 'event';
  locale?: string;
  eventDate?: string;
  eventLocation?: string;
}

/**
 * Generate Open Graph meta tags as an object.
 * Useful for SSR or head management libraries.
 */
export function generateOpenGraphTags(data: OpenGraphData): Record<string, string> {
  const tags: Record<string, string> = {
    'og:title': data.title,
    'og:description': data.description || '',
    'og:url': data.url,
    'og:type': data.type || 'website',
    'og:site_name': data.siteName || 'RawDrive Invitations',
    'og:locale': data.locale || 'en_US',
  };

  if (data.imageUrl) {
    tags['og:image'] = data.imageUrl;
    tags['og:image:width'] = '1200';
    tags['og:image:height'] = '630';
    tags['og:image:alt'] = data.title;
  }

  return tags;
}

/**
 * Generate Twitter Card meta tags as an object.
 */
export function generateTwitterCardTags(data: OpenGraphData): Record<string, string> {
  const tags: Record<string, string> = {
    'twitter:card': data.imageUrl ? 'summary_large_image' : 'summary',
    'twitter:title': data.title,
    'twitter:description': data.description || '',
  };

  if (data.imageUrl) {
    tags['twitter:image'] = data.imageUrl;
    tags['twitter:image:alt'] = data.title;
  }

  return tags;
}

/**
 * Generate all social media meta tags.
 */
export function generateSocialMetaTags(data: OpenGraphData): Record<string, string> {
  return {
    ...generateOpenGraphTags(data),
    ...generateTwitterCardTags(data),
  };
}

/**
 * Create HTML meta tag strings for SSR.
 */
export function renderMetaTagsAsHTML(data: OpenGraphData): string {
  const tags = generateSocialMetaTags(data);
  
  return Object.entries(tags)
    .map(([name, content]) => {
      const attrName = name.startsWith('og:') ? 'property' : 'name';
      return `<meta ${attrName}="${name}" content="${escapeHtml(content)}" />`;
    })
    .join('\n');
}

/**
 * Update document head with meta tags (client-side).
 * Removes existing OG/Twitter tags and adds new ones.
 */
export function updateDocumentMetaTags(data: OpenGraphData): void {
  if (typeof document === 'undefined') return;

  const tags = generateSocialMetaTags(data);
  
  // Remove existing OG and Twitter tags
  const existingTags = document.querySelectorAll(
    'meta[property^="og:"], meta[name^="twitter:"]'
  );
  existingTags.forEach((tag) => tag.remove());

  // Add new tags
  const head = document.head;
  Object.entries(tags).forEach(([name, content]) => {
    const meta = document.createElement('meta');
    if (name.startsWith('og:')) {
      meta.setAttribute('property', name);
    } else {
      meta.setAttribute('name', name);
    }
    meta.setAttribute('content', content);
    head.appendChild(meta);
  });

  // Also update title if needed
  const titleEl = document.querySelector('title');
  if (titleEl) {
    titleEl.textContent = data.title;
  }
}

/**
 * Generate WhatsApp share URL with pre-filled message.
 */
export function getWhatsAppShareUrl(
  url: string,
  title: string,
  description?: string
): string {
  const message = description
    ? `${title}\n${description}\n${url}`
    : `${title}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Generate Facebook share URL.
 */
export function getFacebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * Generate Twitter/X share URL.
 */
export function getTwitterShareUrl(url: string, text: string): string {
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/**
 * Generate Email mailto URL.
 */
export function getEmailShareUrl(
  subject: string,
  body: string,
  url: string
): string {
  const emailBody = `${body}\n\n${url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
}

// Helper: escape HTML special characters
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default {
  generateOpenGraphTags,
  generateTwitterCardTags,
  generateSocialMetaTags,
  renderMetaTagsAsHTML,
  updateDocumentMetaTags,
  getWhatsAppShareUrl,
  getFacebookShareUrl,
  getTwitterShareUrl,
  getEmailShareUrl,
};
