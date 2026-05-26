import { ApiService } from "@/api/apiService";
import { ApplicationError } from "@/types/error";

jest.mock("@/utils/domain", () => ({
  getApiDomain: () => "http://localhost:8080",
}));

describe("ApiService", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    sessionStorage.clear();
  });

  it("attaches the stored token to requests", async () => {
    sessionStorage.setItem("token", JSON.stringify("stored-token"));
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });

    const api = new ApiService();
    await api.get("/households/10/pantry");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/households/10/pantry",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "stored-token" }),
      }),
    );
  });

  it("skips Authorization when token storage is malformed", async () => {
    sessionStorage.setItem("token", "not-json");
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });

    const api = new ApiService();
    await api.get("/users");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/users",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it("serializes POST and PUT payloads", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });

    const api = new ApiService();
    await api.post("/households", { name: "Test House" });
    await api.put("/users/1", { bio: "hi" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/households",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Test House" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/users/1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ bio: "hi" }),
      }),
    );
  });

  it("uploads multipart form data without forcing a JSON content type", async () => {
    sessionStorage.setItem("token", JSON.stringify("stored-token"));
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ status: "succeeded" }),
    });

    const api = new ApiService();
    const formData = new FormData();
    formData.append("image", new Blob(["file"]), "receipt.png");

    await api.postFormData("/products/receipt/analyze", formData);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/products/receipt/analyze",
      expect.objectContaining({
        method: "POST",
        body: formData,
        headers: expect.objectContaining({ Authorization: "stored-token" }),
      }),
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit as RequestInit).headers).not.toEqual(
      expect.objectContaining({ "Content-Type": "application/json" }),
    );
  });

  it("returns the raw response for non-json content", async () => {
    const response = {
      ok: true,
      headers: { get: () => "text/plain" },
      text: async () => "ok",
    } as unknown as Response;
    fetchMock.mockResolvedValue(response);

    const api = new ApiService();
    const result = await api.delete<Response>("/households/10");

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/households/10",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws ApplicationError with backend details on 401", async () => {
    sessionStorage.setItem("token", JSON.stringify("stored-token"));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: { get: () => "application/json" },
      json: async () => ({ message: "Invalid token" }),
    });

    const api = new ApiService();
    await expect(api.get("/households/10/pantry")).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("Invalid token"),
    } satisfies Partial<ApplicationError>);
    expect(sessionStorage.getItem("token")).not.toBeNull();
  });

  it("throws ApplicationError with backend details on non-401 failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: { get: () => "application/json" },
      json: async () => ({ message: "Something broke" }),
    });

    const api = new ApiService();

    await expect(api.get("/households/10/pantry")).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("Something broke"),
      info: expect.stringContaining('"status": 500'),
    } satisfies Partial<ApplicationError>);
  });
});
