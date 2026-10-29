import english from "../i18n/messages/en.json";

/** Resolve static UI translation calls for existing source-level contracts. */
export function withEnglishUiCopy(source: string): string {
  const messages: Record<string, string> = english.messages;
  const literal = (key: string) => {
    if (!Object.hasOwn(messages, key)) throw new Error(`Unknown UI message: ${key}`);
    return JSON.stringify(messages[key]);
  };
  return source
    .replace(/=\{uiT\("ui:messages\.(m_[a-f0-9]+)"\)\}/g, (_match, key: string) => `=${literal(key)}`)
    .replace(/uiT\("ui:messages\.(m_[a-f0-9]+)"\)/g, (_match, key: string) => literal(key));
}
