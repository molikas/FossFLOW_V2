import { Model } from 'src/types';
import { exportAsJSON } from './exportOptions';

const AUTOSAVE_KEY = 'fossflow-autosave';

/**
 * Attempts to persist the model to localStorage.
 * Falls back to a file download if localStorage is unavailable or full.
 * Returns true if saved to localStorage, false if fell back to download.
 */
export const saveModelLocally = (model: Model): boolean => {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(model));
    return true;
  } catch {
    // localStorage unavailable (private browsing quota exceeded, etc.) — fall back to file
    exportAsJSON(model);
    return false;
  }
};
