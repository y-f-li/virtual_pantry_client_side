/**
 * Generates a random UUID (version 4).
 */
export function generateUUID(): string {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  let uuid = "";

  for (const character of template) {
    if (character !== "x" && character !== "y") {
      uuid += character;
      continue;
    }

    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    uuid += value.toString(16);
  }

  return uuid;
}
