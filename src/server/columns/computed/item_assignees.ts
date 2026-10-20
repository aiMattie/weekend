import { ValidationError } from "../../../lib/errors";
import { peopleColumn, type PeopleValue } from "../people";
import type { ColumnLogic } from "../types";

/**
 * item_assignees: everybody assigned in any people column of the item or of its subitems
 * (computed on read). Same value shape as people.
 */
export const itemAssigneesColumn: ColumnLogic<PeopleValue> = {
  ...peopleColumn,
  type: "item_assignees",
  label: "Item assignees",
  category: "people",
  readOnly: true,
  validate: () => { throw new ValidationError("Item assignees columns are read-only"); },
};
