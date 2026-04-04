export const EDIT_COMMAND_IDS = [
  'edit:undo',
  'edit:redo',
  'edit:cut',
  'edit:copy',
  'edit:paste',
  'edit:selectAll',
] as const

export type EditCommandId = (typeof EDIT_COMMAND_IDS)[number]
