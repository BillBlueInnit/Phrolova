import { apiPath, requestJson } from "./http";

export interface AcknowledgementItem {
  id: number;
  player_id: string;
  category: string;
  description: string;
  sort_order: number;
  created_at: string | null;
}

export interface AcknowledgementsResponse {
  status: string;
  list: AcknowledgementItem[];
}

export function fetchAcknowledgements() {
  return requestJson<AcknowledgementsResponse>(apiPath("/acknowledgements"));
}

export function adminFetchAcknowledgements(headers: Record<string, string>) {
  return requestJson<AcknowledgementsResponse>(apiPath("/admin/acknowledgements"), { headers });
}

export function adminAddAcknowledgement(
  headers: Record<string, string>,
  payload: { player_id: string; category: string; description: string; sort_order: number },
) {
  return requestJson<{ status: string; id: number }>(apiPath("/admin/acknowledgements"), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

export function adminUpdateAcknowledgement(
  headers: Record<string, string>,
  id: number,
  payload: Partial<{ player_id: string; category: string; description: string; sort_order: number }>,
) {
  return requestJson<{ status: string }>(apiPath(`/admin/acknowledgements/${id}`), {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
}

export function adminDeleteAcknowledgement(headers: Record<string, string>, id: number) {
  return requestJson<{ status: string }>(apiPath(`/admin/acknowledgements/${id}`), {
    method: "DELETE",
    headers,
  });
}
