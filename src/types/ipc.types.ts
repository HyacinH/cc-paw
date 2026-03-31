export type IPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }
