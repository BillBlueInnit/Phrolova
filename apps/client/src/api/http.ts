export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await response.json()) as { status?: string; message?: string };
  if (!response.ok || data.status === "error") {
    throw new ApiError(data.message ?? "请求失败", response.status);
  }
  return data as T;
}

export function apiPath(path: string) {
  const base = import.meta.env.VITE_API_BASE || "/api";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
