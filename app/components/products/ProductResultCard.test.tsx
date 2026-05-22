/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductResultCard from "@/components/products/ProductResultCard";

const postMock = jest.fn();
const pushMock = jest.fn();
const warningMock = jest.fn();
const errorMock = jest.fn();
const successMock = jest.fn();
const setHouseholdsMock = jest.fn();
const clearSelectedHouseholdIdMock = jest.fn();

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ post: postMock }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") {
      return {
        value: [{ householdId: 10, name: "Test House", inviteCode: "ABC", ownerId: 1, role: "owner" }],
        set: setHouseholdsMock,
        clear: jest.fn(),
      };
    }
    if (key === "selectedHouseholdId") {
      return { value: 10, set: jest.fn(), clear: clearSelectedHouseholdIdMock };
    }
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("antd", () => {
  const Image = ({ alt }: any) => <img alt={alt} />;
  const Card = ({ children }: any) => <div>{children}</div>;
  const DatePicker = ({ placeholder, onChange }: any) => (
    <input type="date" placeholder={placeholder} onChange={(e) => onChange?.(e.target.value ? { format: () => e.target.value } : null)} />
  );
  const App = {
    useApp: () => ({
      message: { warning: warningMock, error: errorMock, success: successMock, info: jest.fn() },
    }),
  };
  return { Card, Image, App, DatePicker };
});

describe("ProductResultCard", () => {
  const product = {
    barcode: "123456789",
    name: "Plant Based Caprese",
    brand: "V-Love",
    quantity: "180 g",
    servingSize: null,
    imageUrl: "https://example.com/image.jpg",
    productUrl: null,
    nutriScore: null,
    stores: null,
    storeTags: null,
    purchasePlaces: null,
    nutriments: { "energy-kcal_100g": 220 },
    nutriScoreData: null,
    rawProduct: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders only the streamlined product information", () => {
    render(
      <ProductResultCard
        product={product}
        rawTitle="All raw product fields returned by the API"
        exportContext="Search export"
      />,
    );

    expect(screen.getByText("Plant Based Caprese")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("V-Love")).toBeInTheDocument();
    expect(screen.getByText("Barcode")).toBeInTheDocument();
    expect(screen.getByText("123456789")).toBeInTheDocument();
    expect(screen.getByText("Energy basis")).toBeInTheDocument();
    expect(screen.getAllByText("396").length).toBeGreaterThan(0);
    expect(screen.queryByText("Export full return as TXT")).not.toBeInTheDocument();
    expect(screen.queryByText("Nutri-Score computation data")).not.toBeInTheDocument();
  });

  it("keeps the image and nutrition sections visible when optional product data is missing", () => {
    render(
      <ProductResultCard
        product={{ ...product, imageUrl: null, nutriments: null, nutrition: null }}
        rawTitle="Raw fields"
        exportContext="Pantry export"
      />,
    );

    expect(screen.getByLabelText("No product image available")).toHaveTextContent("No image");
    expect(screen.getByRole("region", { name: "Reported nutrition" })).toBeInTheDocument();
    expect(screen.getByText("Nutrition information not available.")).toBeInTheDocument();
  });

  it("renders reported nutrition as a collapsed expandable section", () => {
    render(
      <ProductResultCard
        product={{
          ...product,
          nutrition: {
            basisAmount: 100,
            basisUnit: "g",
            coreNutrition: {
              "energy-kcal": { value: 220, unit: "kcal" },
              protein: { value: 12, unit: "g" },
            },
            micronutrients: {
              iron: { value: 2.5, unit: "mg" },
            },
          },
        }}
        rawTitle="Raw fields"
        exportContext="Pantry export"
      />,
    );

    expect(screen.getByText(/3 reported · Show details/)).toBeInTheDocument();
    expect(screen.queryByText("Protein")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reported nutrition/i }));

    expect(screen.getByText(/3 reported · Hide details/)).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Iron")).toBeInTheDocument();
  });

  it("posts a pantry item successfully without redirecting when the pantry form is submitted", async () => {
    postMock.mockResolvedValueOnce({
      id: 7,
      householdId: 10,
      barcode: "123456789",
      name: "Plant Based Caprese",
      amount: 2,
      amountUnit: "g",
      kcalPer100g: 220,
      addedAt: "2026-04-12T10:00:00Z",
    });

    render(
      <ProductResultCard
        product={product}
        rawTitle="Raw fields"
        exportContext="Pantry export"
        pantryContext={{ householdId: 10, householdName: "Test House" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Amount in g"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/10/pantry", {
        barcode: "123456789",
        name: "Plant Based Caprese",
        amount: 2,
        amountUnit: "g",
        kcalPerPackage: 396,
        kcalPer100g: 220,
        kcalPer100ml: null,
        kcalPerServing: null,
        expirationDate: null,
        packageQuantity: null,
        packageQuantityUnit: null,
        productIndex: null,
      });
    });

    expect(successMock).toHaveBeenCalledWith("Item successfully added to Test House.");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("uses the householdId from the URL when pantryContext is not passed", async () => {
    window.history.pushState({}, "", "?householdId=12&householdName=URL%20House");

    postMock.mockResolvedValueOnce({
      id: 8,
      householdId: 12,
      barcode: "123456789",
      name: "Plant Based Caprese",
      amount: 180,
      amountUnit: "g",
      kcalPer100g: 220,
      addedAt: "2026-04-12T10:00:00Z",
    });

    render(
      <ProductResultCard
        product={product}
        rawTitle="Raw fields"
        exportContext="Pantry export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/12/pantry", {
        barcode: "123456789",
        name: "Plant Based Caprese",
        amount: 180,
        amountUnit: "g",
        kcalPerPackage: 396,
        kcalPer100g: 220,
        kcalPer100ml: null,
        kcalPerServing: null,
        expirationDate: null,
        packageQuantity: null,
        packageQuantityUnit: null,
        productIndex: null,
      });
    });

    expect(successMock).toHaveBeenCalledWith("Item successfully added to URL House.");
    expect(pushMock).not.toHaveBeenCalled();

    window.history.pushState({}, "", "/");
  });

  it("shows a warning and does not submit when quantity is invalid", async () => {
    render(
      <ProductResultCard
        product={product}
        rawTitle="Raw fields"
        exportContext="Pantry export"
        pantryContext={{ householdId: 10, householdName: "Test House" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Amount in g"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    expect(postMock).not.toHaveBeenCalled();
    expect(warningMock).toHaveBeenCalledWith("Amount must be greater than zero.");
  });

  it("shows the API error message when adding the pantry item fails", async () => {
    postMock.mockRejectedValueOnce(new Error("backend exploded"));

    render(
      <ProductResultCard
        product={product}
        rawTitle="Raw fields"
        exportContext="Pantry export"
        pantryContext={{ householdId: 10, householdName: "Test House" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith("backend exploded");
    });
  });

  it("redirects to /households and removes the household from cache when the pantry returns 404", async () => {
    const notFoundError = Object.assign(new Error("Not found"), { status: 404, info: "" });
    postMock.mockRejectedValueOnce(notFoundError);

    render(
      <ProductResultCard
        product={product}
        rawTitle="Raw fields"
        exportContext="Pantry export"
        pantryContext={{ householdId: 10, householdName: "Test House" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(setHouseholdsMock).toHaveBeenCalledWith([]);
      expect(clearSelectedHouseholdIdMock).toHaveBeenCalled();
      expect(warningMock).toHaveBeenCalledWith("This household is no longer available.");
      expect(pushMock).toHaveBeenCalledWith("/households");
    });
  });
});
