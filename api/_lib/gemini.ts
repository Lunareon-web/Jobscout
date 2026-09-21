/**
 * Zentrale Gemini-Konfiguration.
 * Modellname an EINER Stelle pflegen — Google schaltet alte Modelle
 * regelmäßig ab (1.5-flash und 2.0-flash sind beide bereits retired).
 */
export const GEMINI_MODEL = 'gemini-3.6-flash'

export function geminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
}
