/**
 * Privacy and Identity Scrubber for Anonymous Chat and Proposal Pipelines
 * Detects and redacts direct contact information (emails, phone numbers, WhatsApp, Telegram, Discord, URLs)
 * to maintain client & developer identity confidentiality during evaluation and selection phases.
 */

export interface ScrubResult {
  scrubbedText: string;
  violationsFound: string[];
  hasViolations: boolean;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
const TELEGRAM_REGEX = /(?:t\.me\/|telegram\.me\/|@)[a-zA-Z0-9_]{5,32}/gi;
const WHATSAPP_REGEX = /(?:wa\.me\/|whatsapp:\/?\/?)[a-zA-Z0-9_]+/gi;
const DISCORD_REGEX = /(?:discord\.gg\/|discordapp\.com\/invite\/)[a-zA-Z0-9]+/gi;

export function scrubPrivateContactInfo(text: string): ScrubResult {
  const violations: string[] = [];

  let scrubbed = text;

  if (EMAIL_REGEX.test(scrubbed)) {
    violations.push('EMAIL_ADDRESS');
    scrubbed = scrubbed.replace(EMAIL_REGEX, '[CONTACT_INFO_REDACTED_EMAIL]');
  }

  // Check phone numbers only if length >= 10 digits to avoid stripping normal numbers/budgets
  const matches = scrubbed.match(PHONE_REGEX);
  if (matches) {
    for (const match of matches) {
      const digitCount = match.replace(/\D/g, '').length;
      if (digitCount >= 10 && digitCount <= 15) {
        violations.push('PHONE_NUMBER');
        scrubbed = scrubbed.replace(match, '[CONTACT_INFO_REDACTED_PHONE]');
      }
    }
  }

  if (TELEGRAM_REGEX.test(scrubbed)) {
    violations.push('TELEGRAM_HANDLE');
    scrubbed = scrubbed.replace(TELEGRAM_REGEX, '[CONTACT_INFO_REDACTED_TELEGRAM]');
  }

  if (WHATSAPP_REGEX.test(scrubbed)) {
    violations.push('WHATSAPP_LINK');
    scrubbed = scrubbed.replace(WHATSAPP_REGEX, '[CONTACT_INFO_REDACTED_WHATSAPP]');
  }

  if (DISCORD_REGEX.test(scrubbed)) {
    violations.push('DISCORD_LINK');
    scrubbed = scrubbed.replace(DISCORD_REGEX, '[CONTACT_INFO_REDACTED_DISCORD]');
  }

  return {
    scrubbedText: scrubbed,
    violationsFound: Array.from(new Set(violations)),
    hasViolations: violations.length > 0,
  };
}
