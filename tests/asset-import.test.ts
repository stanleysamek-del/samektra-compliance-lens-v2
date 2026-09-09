import { describe, it, expect } from "vitest";
import {
  parseCsv,
  detectColumns,
  validateEquipmentRows,
} from "@/lib/asset-import";
describe("equipment report parsing", () => {
  it("preserves barcode zeros and quoted locations including commas and line breaks", () => {
    expect(
      parseCsv(
        'Barcode,Location\r\n000123,"West, room 2"\r\n009999,"Floor 1\nRoom 4"',
      ),
    ).toEqual([
      ["Barcode", "Location"],
      ["000123", "West, room 2"],
      ["009999", "Floor 1\nRoom 4"],
    ]);
  });
  it("matches explicit column aliases and rejects malformed CSV", () => {
    expect(detectColumns(["Tag #", "Serial No", "Room"]).serial).toBe(1);
    expect(detectColumns(["Asset Tag", "Location"]).barcode).toBe(0);
    expect(() => parseCsv('Barcode\n"unfinished')).toThrow();
  });
  it("rejects duplicate IDs and unknown equipment types", () => {
    const row = {
      barcode: "000123",
      label: "FE",
      location: "Hall",
      type: "extinguisher",
      manufacturer: "",
      model: "",
      serial: "",
    };
    expect(validateEquipmentRows([row])).toBeNull();
    expect(validateEquipmentRows([row, row])).toContain("duplicate");
    expect(validateEquipmentRows([{ ...row, type: "unknown" }])).toContain(
      "supported",
    );
  });
});
