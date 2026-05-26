import { buildProductExportText, exportProductAsText } from "@/utils/productExport";
import type { Product } from "@/types/product";

describe("productExport", () => {
  const sampleProduct: Product = {
    barcode: "123456789",
    name: "Plant Based Caprese / V-Love",
    brand: "Migros",
    quantity: "180 g",
    servingSize: "100 g",
    imageUrl: "https://example.com/image.jpg",
    productUrl: "https://example.com/product",
    nutriScore: "b",
    stores: ["Migros", "Coop"],
    storeTags: ["migros", "coop"],
    purchasePlaces: ["Zurich"],
    nutriments: {
      "energy-kcal_100g": 220,
      proteins_100g: 12,
    },
    nutriScoreData: {
      negative_points: 4,
      positive_points: 7,
    },
    rawProduct: {
      code: "123456789",
      product_name: "Plant Based Caprese / V-Love",
    },
  };

  it("builds a readable export with the main sections and fields", () => {
    const text = buildProductExportText(sampleProduct, "Lookup context: barcode search");

    expect(text).toContain("Lookup context: barcode search");
    expect(text).toContain("Priority fields");
    expect(text).toContain("Name: Plant Based Caprese / V-Love");
    expect(text).toContain("Barcode: 123456789");
    expect(text).toContain("Nutrition object");
    expect(text).toContain('"energy-kcal_100g": 220');
    expect(text).toContain("Nutri-Score computation data");
    expect(text).toContain('"negative_points": 4');
    expect(text).toContain("Full raw return");
  });

  it("uses fallbacks for missing values", () => {
    const sparseProduct: Product = {
      barcode: null,
      name: "",
      brand: null,
      quantity: null,
      servingSize: null,
      imageUrl: null,
      productUrl: null,
      nutriScore: null,
      stores: null,
      storeTags: null,
      purchasePlaces: null,
      nutriments: null,
      nutriScoreData: null,
      rawProduct: null,
    };

    const text = buildProductExportText(sparseProduct, "Empty product");

    expect(text).toContain("Name: —");
    expect(text).toContain("Barcode: —");
    expect(text).toContain("Stores: []");
    expect(text).toContain("Store tags: []");
    expect(text).toContain("Purchase places: []");
    expect(text).toContain("{}");
  });

  it("creates and clicks a download link, then removes it and revokes the blob URL", () => {
    const createObjectURLMock = jest.fn(() => "blob:mock-url");
    const revokeObjectURLMock = jest.fn();
    const clickMock = jest.fn();
    const removeMock = jest.fn();

    const appendChildSpy = jest.spyOn(document.body, "appendChild");

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);

    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;

    const createElementSpy = jest
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string): HTMLElement => {
        if (tagName === "a") {
          const anchor = originalCreateElement("a") as HTMLAnchorElement;
          anchor.click = clickMock;
          anchor.remove = removeMock;
          return anchor;
        }
        return originalCreateElement(tagName);
      });

    try {
      exportProductAsText(sampleProduct, "Lookup context");

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");

      const appendedAnchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(appendedAnchor.href).toBe("blob:mock-url");
      expect(appendedAnchor.download).toBe(
        "Plant_Based_Caprese_V-Love_123456789_export.txt",
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    }
  });
});
