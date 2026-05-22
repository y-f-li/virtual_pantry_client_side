import { buildPantryItemPayload, estimateKcalPerPackage, formatQuantity } from "@/utils/pantry";

describe("pantry helpers", () => {
  it("estimates calories from 100g nutrition data and package size", () => {
    const kcal = estimateKcalPerPackage({
      barcode: "1",
      name: "Caprese",
      brand: "Brand",
      quantity: "180 g",
      servingSize: null,
      imageUrl: null,
      productUrl: null,
      nutriScore: null,
      stores: null,
      storeTags: null,
      purchasePlaces: null,
      nutriments: { "energy-kcal_100g": 220 },
      nutriScoreData: null,
      rawProduct: null,
    });

    expect(kcal).toBe(396);
  });

  it("supports multi-pack liquid quantities against 100ml nutrition data", () => {
    const kcal = estimateKcalPerPackage({
      barcode: "2",
      name: "Juice",
      brand: "Brand",
      quantity: "2 x 500 ml",
      servingSize: null,
      imageUrl: null,
      productUrl: null,
      nutriScore: null,
      stores: null,
      storeTags: null,
      purchasePlaces: null,
      nutriments: { "energy-kcal_100ml": 45 },
      nutriScoreData: null,
      rawProduct: null,
    });

    expect(kcal).toBe(450);
  });

  it("returns null for package calories when quantity is missing, even if serving data exists", () => {
    const kcal = estimateKcalPerPackage({
      barcode: "3",
      name: "Snack",
      brand: "Brand",
      quantity: null,
      servingSize: "1 bar",
      imageUrl: null,
      productUrl: null,
      nutriScore: null,
      stores: null,
      storeTags: null,
      purchasePlaces: null,
      nutriments: { "energy-kcal_serving": "123" },
      nutriScoreData: null,
      rawProduct: null,
    });

    expect(kcal).toBeNull();
  });

  it("builds a trimmed pantry payload from the product", () => {
    const payload = buildPantryItemPayload(
      {
        barcode: " 7613035974685 ",
        name: " Chocolate Bar ",
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
      },
      3,
      "package",
    );

    expect(payload).toEqual({
      barcode: "7613035974685",
      name: "Chocolate Bar",
      amount: 3,
      amountUnit: "package",
      kcalPerPackage: null,
      kcalPer100g: null,
      kcalPer100ml: null,
      kcalPerServing: null,
      packageQuantity: null,
      packageQuantityUnit: null,
      productIndex: null,
    });
  });

  // Issue #95 — formatQuantity uses unit suffix for g/ml, × for package/unknown
  describe("formatQuantity", () => {
    it("appends g suffix for gram unit", () => {
      expect(formatQuantity(200, "g")).toBe("200g");
    });
    it("appends ml suffix for millilitre unit", () => {
      expect(formatQuantity(250, "ml")).toBe("250ml");
    });
    it("uses × suffix for package unit", () => {
      expect(formatQuantity(3, "package")).toBe("3×");
    });
    it("uses × suffix when unit is undefined", () => {
      expect(formatQuantity(1, undefined)).toBe("1×");
    });
  });
});
