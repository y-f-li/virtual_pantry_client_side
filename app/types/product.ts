export interface Product {
  barcode: string | null;
  name: string | null;
  brand: string | null;
  kcalPer100: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  kcalPerPackage: number | null;
  imageUrl?: string | null;
}
