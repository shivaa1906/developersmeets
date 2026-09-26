/**
 * Defensive XSS Sanitizer Utility
 * Sanitizes and neutralizes HTML tags, script injection, and javascript: pseudo-protocols
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi,
  /<meta\b[^>]*>/gi,
  /<link\b[^>]*>/gi,
  /javascript:[^"'\s]*/gi,
  /data:text\/html[^"'\s]*/gi,
  /vbscript:[^"'\s]*/gi,
  /on\w+\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, // on* event handlers (e.g. onerror=, onload=)
];

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Strips known dangerous HTML tags, event handlers, and javascript URIs
 */
export function sanitizeInput(input: string | undefined | null): string {
  if (input === undefined || input === null) {
    return '';
  }

  if (typeof input !== 'string') {
    return String(input);
  }

  let sanitized = input;

  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}

/**
 * Strictly escapes HTML special characters to prevent raw HTML rendering
 */
export function escapeHtml(input: string | undefined | null): string {
  if (input === undefined || input === null) {
    return '';
  }

  if (typeof input !== 'string') {
    return String(input);
  }

  return input.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitizes rich user-submitted text (e.g. messages, descriptions, bios)
 * Removes executable script tags while preserving markdown code blocks and safe text.
 */
export function sanitizeRichText(input: string | undefined | null): string {
  if (!input) return '';

  let sanitized = sanitizeInput(input);

  // Strip dangling angle brackets that look like unclosed tags
  sanitized = sanitized.replace(/<(?=[a-zA-Z/])/g, '&lt;');

  return sanitized;
}
