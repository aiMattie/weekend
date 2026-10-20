import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj, toNumber } from "./util";

/** location: `{ lat, lng, address }` (API shape). lat/lng may be empty when only an address is known. */
export type LocationValue = { lat: number | null; lng: number | null; address: string };

export const locationColumn: ColumnLogic<LocationValue> = {
  type: "location",
  label: "Location",
  category: "advanced",
  icon: "Location",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    let lat: number | null = null;
    let lng: number | null = null;
    let address = "";
    if (typeof input === "string") {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(input);
      if (m) [lat, lng] = [Number(m[1]), Number(m[2])];
      else address = input.trim();
    } else if (isObj(input)) {
      lat = toNumber(input.lat ?? input.latitude);
      lng = toNumber(input.lng ?? input.lon ?? input.longitude);
      address = String(input.address ?? input.text ?? "").trim();
    } else throw new ValidationError("Location must be an address or { lat, lng, address }");
    if ((lat === null) !== (lng === null)) throw new ValidationError("Location needs both lat and lng");
    if (lat !== null && (lat < -90 || lat > 90)) throw new ValidationError("lat must be between -90 and 90");
    if (lng !== null && (lng < -180 || lng > 180)) throw new ValidationError("lng must be between -180 and 180");
    if (!address && lat === null) return null;
    return { lat, lng, address: address || `${lat}, ${lng}` };
  },
  serialize: (v) => v,
  format: (v) => v?.address ?? "",
  filter: { operators: TEXT_OPS, test: (v, op, operand) => testText(v?.address ?? "", op, operand) },
  sortKey: (v) => (v ? v.address.toLowerCase() : null),
};
