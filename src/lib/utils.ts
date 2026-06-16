import { Dialog } from '@capacitor/dialog';

/**
 * Generates a unique identifier.
 * Uses crypto.randomUUID if available, with a fallback for older environments.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts or older browsers
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Shows a native alert dialog.
 */
export async function showAlert(title: string, message: string): Promise<void> {
  await Dialog.alert({
    title,
    message,
  });
}

/**
 * Shows a native confirmation dialog.
 */
export async function showConfirm(title: string, message: string): Promise<boolean> {
  const { value } = await Dialog.confirm({
    title,
    message,
  });
  return value;
}
