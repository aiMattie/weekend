/** All column types of the `columns` module (registered with one line in registry.ts). */
import { boardRelationColumn } from "./board_relation";
import { buttonColumn } from "./button";
import { colorPickerColumn } from "./color_picker";
import { autoNumberColumn } from "./computed/auto_number";
import { formulaColumn } from "./computed/formula";
import { itemAssigneesColumn } from "./computed/item_assignees";
import { itemIdColumn } from "./computed/item_id";
import { creationLogColumn, lastUpdatedColumn } from "./computed/log";
import { mirrorColumn } from "./computed/mirror";
import { progressColumn } from "./computed/progress";
import { countryColumn } from "./country";
import { dependencyColumn } from "./dependency";
import { docColumn } from "./doc";
import { emailColumn } from "./email";
import { fileColumn } from "./file";
import { hourColumn } from "./hour";
import { locationColumn } from "./location";
import { phoneColumn } from "./phone";
import { ratingColumn } from "./rating";
import { tagsColumn } from "./tags";
import { timeTrackingColumn } from "./time_tracking";
import { timelineColumn } from "./timeline";
import type { ColumnLogic } from "./types";
import { voteColumn } from "./vote";
import { weekColumn } from "./week";
import { worldClockColumn } from "./world_clock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const columnsPack: ColumnLogic<any>[] = [
  timelineColumn, weekColumn, hourColumn, worldClockColumn, ratingColumn, voteColumn, tagsColumn, emailColumn, phoneColumn,
  locationColumn, countryColumn, colorPickerColumn, fileColumn, buttonColumn, dependencyColumn, timeTrackingColumn,
  boardRelationColumn, docColumn, itemAssigneesColumn,
  mirrorColumn, formulaColumn, progressColumn, autoNumberColumn, itemIdColumn, creationLogColumn, lastUpdatedColumn,
];
