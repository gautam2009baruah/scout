/**
 * Global type declarations for custom window properties
 * used in orchestration browser automation
 */

declare global {
  interface Window {
    // Data capture overlay functions
    __scoutCaptureContinue?: () => void;
    __scoutCaptureEdit?: () => void;
    
    // Scout Player class for workflow execution
    _ScoutPlayerClass?: any;
  }
}

export {};
