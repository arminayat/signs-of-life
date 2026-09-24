import { api } from "./data";

export type CatalogItem = {
  id: string;
  name: string;
  organizationName?: string | null;
};
export type Catalog = { items: CatalogItem[]; manualAppId?: boolean };

export function catalogQuery(connectionId: string) {
  return {
    queryKey: ["catalog", connectionId],
    queryFn: () => api<Catalog>(`/connections/${connectionId}/catalog`),
    staleTime: 60_000,
  };
}

export function catalogLabel(item: CatalogItem) {
  return item.organizationName
    ? `${item.organizationName} / ${item.name}`
    : item.name;
}
