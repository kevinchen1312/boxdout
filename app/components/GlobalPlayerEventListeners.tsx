'use client';

import { useEffect } from 'react';
import { setupGlobalPlayerEventListeners } from '../utils/globalPlayerEvents';

/**
 * Component that sets up global event listeners for player add/remove
 * This ensures the listeners work on all pages, not just where useGames is mounted
 */
export default function GlobalPlayerEventListeners() {
  useEffect(() => {
    setupGlobalPlayerEventListeners();
  }, []);
  
  return null; // This component doesn't render anything
}

