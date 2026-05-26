import { renderHook } from "@testing-library/react";
import { useApi } from "@/hooks/useApi";
import { ApiService } from "@/api/apiService";

jest.mock("@/utils/domain", () => ({
  getApiDomain: () => "http://localhost:8080",
}));

describe("useApi", () => {
  it("returns the same ApiService instance across rerenders", () => {
    const { result, rerender } = renderHook(() => useApi());
    const firstInstance = result.current;

    rerender();

    expect(firstInstance).toBeInstanceOf(ApiService);
    expect(result.current).toBe(firstInstance);
  });
});
