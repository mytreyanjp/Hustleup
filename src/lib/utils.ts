import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a consistent, sorted chat ID from two user UIDs.
 * @param uid1 - The UID of the first user.
 * @param uid2 - The UID of the second user.
 * @returns A string representing the unique chat ID.
 */
export function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}
