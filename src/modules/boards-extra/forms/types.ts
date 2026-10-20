/** DTOs shared between the forms services and the client (no db imports). */
import type { FormSettings, QuestionLogic } from "../../../db/schema/forms";

export type { FormSettings, QuestionLogic };

export interface FormDto {
  id: string;
  workspaceId: string;
  boardId: string;
  groupId: string | null;
  name: string;
  token: string;
  isPublished: boolean;
  /** passwordHash is never sent, only whether one is set */
  settings: Omit<FormSettings, "passwordHash"> & { hasPassword: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface QuestionDto {
  id: string;
  formId: string;
  columnId: string | null;
  kind: string;
  title: string;
  description: string | null;
  required: boolean;
  hidden: boolean;
  position: number;
  settings: Record<string, unknown> & { logic?: QuestionLogic; placeholder?: string; optionIds?: number[] };
}

export interface FormWithQuestions { form: FormDto; questions: QuestionDto[] }

export interface PublicOption { id: number; text: string; color?: string }
export interface PublicQuestion {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  required: boolean;
  placeholder?: string;
  options?: PublicOption[];
  multiple?: boolean;
  logic?: QuestionLogic;
}

export interface PublicForm {
  token: string;
  name: string;
  /** true when a password is required and was not (correctly) given: no questions are returned */
  locked: boolean;
  requireLogin: boolean;
  settings: Pick<FormSettings, "description" | "coverUrl" | "logoUrl" | "primaryColor" | "backgroundColor" | "submitLabel" | "thankYou" | "tags">;
  questions: PublicQuestion[];
}

export interface SubmitResult { ok: true; itemId: string | null; submissionId: string | null; thankYou: { title: string; message: string; redirectUrl: string | null } }
export interface FieldError { questionId: string; message: string }
