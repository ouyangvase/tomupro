export interface BindingPair {
  id: string;
  ownerId: string;
  subjectId: string;
}

export function indexBindingPairs(bindings: BindingPair[]) {
  const byOwner = new Map<string, BindingPair[]>();
  const bySubject = new Map<string, BindingPair[]>();

  for (const binding of bindings) {
    byOwner.set(binding.ownerId, [...(byOwner.get(binding.ownerId) || []), binding]);
    bySubject.set(binding.subjectId, [...(bySubject.get(binding.subjectId) || []), binding]);
  }

  return { byOwner, bySubject };
}

export function matchesBindingCount(count: number, filter: string) {
  if (filter === 'none') return count === 0;
  if (filter === 'one') return count === 1;
  if (filter === 'two-three') return count >= 2 && count <= 3;
  if (filter === 'four-plus') return count >= 4;
  return true;
}

export function pluralizeBinding(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
