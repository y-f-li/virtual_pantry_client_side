import { getApiDomain } from "@/utils/domain";
import { ApplicationError } from "@/types/error";

export class ApiService {
  private baseURL: string;

  constructor() {
    this.baseURL = getApiDomain();
  }

  private buildHeaders(options?: { hasBody?: boolean }): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (options?.hasBody) {
      headers["Content-Type"] = "application/json";
    }

    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async processResponse<T>(res: Response, errorMessage: string): Promise<T> {
    if (!res.ok) {
      let errorDetail = res.statusText;

      try {
        const errorInfo = await res.json();
        if (errorInfo?.reason) errorDetail = errorInfo.reason;
        else if (errorInfo?.message) errorDetail = errorInfo.message;
        else errorDetail = JSON.stringify(errorInfo);
      } catch {
        // keep statusText fallback
      }

      const error: ApplicationError = new Error(
        `${errorMessage} (${res.status}: ${errorDetail})`,
      ) as ApplicationError;

      error.status = res.status;
      error.info = JSON.stringify(
        { status: res.status, statusText: res.statusText },
        null,
        2,
      );

      throw error;
    }

    if (res.status === 204 || res.status === 205) {
      return undefined as T;
    }

    const contentType = res.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }

    return undefined as T;
  }

  public async get<T>(endpoint: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders({ hasBody: false }),
    });
    return this.processResponse<T>(res, "An error occurred while fetching the data.");
  }

  public async post<T>(endpoint: string, data: unknown): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders({ hasBody: true }),
      body: JSON.stringify(data),
    });
    return this.processResponse<T>(res, "An error occurred while posting the data.");
  }

  public async put<T>(endpoint: string, data: unknown): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: this.buildHeaders({ hasBody: true }),
      body: JSON.stringify(data),
    });
    return this.processResponse<T>(res, "An error occurred while updating the data.");
  }

  public async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.buildHeaders({ hasBody: data !== undefined }),
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return this.processResponse<T>(res, "An error occurred while patching the data.");
  }

  public async delete<T>(endpoint: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.buildHeaders({ hasBody: false }),
    });
    return this.processResponse<T>(res, "An error occurred while deleting the data.");
  }
}
