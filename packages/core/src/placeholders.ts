/** Même règle que la sandbox : `{nom}` en minuscules, dédoublonnés, triés. */
export function placeholderSignature(text: string): string {
  const found = text.match(/\{[a-z_]+\}/g) ?? [];
  return [...new Set(found)].sort().join(',');
}

export function samePlaceholders(source: string, candidate: string): boolean {
  return placeholderSignature(source) === placeholderSignature(candidate);
}

/** Remplit un gabarit ; un emplacement inconnu reste visible plutôt que de disparaître. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}
