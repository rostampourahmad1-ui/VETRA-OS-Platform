export const FormFieldType = {
  text: "text",
  number: "number",
  date: "date",
  select: "select",
  checkbox: "checkbox",
} as const;

export type FormFieldType = (typeof FormFieldType)[keyof typeof FormFieldType];