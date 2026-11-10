export const delay = (ms = 300) => new Promise<void>((r) => setTimeout(r, ms));

export function paginate<T>(items: T[], page = 1, pageSize = 20): { items: T[]; total: number; page: number; page_size: number } {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, page_size: pageSize };
}
