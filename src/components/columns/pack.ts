/** Client half of every column type of the `columns` module (one line in registry.ts). */
import { colorPickerUi } from "./color_picker";
import { autoNumberUi, creationLogUi, formulaUi, itemAssigneesUi, itemIdUi, lastUpdatedUi, mirrorUi, progressUi } from "./computed";
import { buttonUi } from "./button";
import { countryUi } from "./country";
import { docUi } from "./doc";
import { emailUi } from "./email";
import { fileUi } from "./file";
import { hourUi } from "./hour";
import { locationUi } from "./location";
import { phoneUi } from "./phone";
import { ratingUi } from "./rating";
import { boardRelationUi, dependencyUi } from "./relation";
import { tagsUi } from "./tags";
import { timeTrackingUi } from "./time_tracking";
import { timelineUi } from "./timeline";
import type { ColumnUi } from "./types";
import { voteUi } from "./vote";
import { weekUi } from "./week";
import { worldClockUi } from "./world_clock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const columnsPackUis: Record<string, ColumnUi<any>> = {
  timeline: timelineUi, week: weekUi, hour: hourUi, world_clock: worldClockUi, rating: ratingUi, vote: voteUi, tags: tagsUi,
  email: emailUi, phone: phoneUi, location: locationUi, country: countryUi, color_picker: colorPickerUi, file: fileUi,
  button: buttonUi, dependency: dependencyUi, time_tracking: timeTrackingUi, board_relation: boardRelationUi, doc: docUi,
  item_assignees: itemAssigneesUi, mirror: mirrorUi, formula: formulaUi, progress: progressUi, auto_number: autoNumberUi,
  item_id: itemIdUi, creation_log: creationLogUi, last_updated: lastUpdatedUi,
};
