export type RecordedActionType = "click" | "input" | "navigation" | "submit" | "change" | "manual-select";
export type GuideStepPurpose = "navigation" | "main";
export type NavigationStepMode = "autoClick" | "waitForUser";
export type ContinueWhen =
  | { type: "urlContains"; value: string }
  | { type: "elementVisible"; selector: string }
  | { type: "manualNext" };

export type SelectorCandidateType =
  | "data-adoption-id"
  | "data-testid"
  | "data-test"
  | "data-cy"
  | "id"
  | "name"
  | "aria-label"
  | "role-text"
  | "label-text"
  | "placeholder"
  | "css"
  | "xpath"
  | "text-context";

export type GuideStatus = "draft" | "published";
export type GuideStepTrigger = "click" | "change" | "blur" | "focus" | "input" | "manualNext";

export type SelectorCandidate = {
  type: SelectorCandidateType;
  value: string;
  confidence: number;
  reason: string;
};

export type ElementIdentity = {
  tagName: string;
  role?: string;
  text?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  inputType?: string;
  name?: string;
  id?: string;
  dataAttributes: Record<string, string>;
  url: string;
  path: string;
  selectorCandidates: SelectorCandidate[];
  confidenceScore: number;
  needsUserConfirmation: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type RecordedAction = {
  id: string;
  type: RecordedActionType;
  url: string;
  timestamp: number;
  stepOrder?: number;
  stepPurpose?: GuideStepPurpose;
  isMainStep?: boolean;
  guidePhase?: "entry" | "main";
  navigationMode?: NavigationStepMode;
  continueWhen?: ContinueWhen;
  trigger?: GuideStepTrigger;
  elementIdentity?: ElementIdentity;
  stepDescription?: string;
  maskedValue?: string;
  originalEventType?: string;
  // Legacy fields for backward compatibility
  selectorCandidates?: SelectorCandidate[];
  elementText?: string;
  ariaLabel?: string;
  role?: string;
  tagName?: string;
  inputType?: string;
  labelText?: string;
  nearbyText?: string;
  valueMasked?: string;
  screenshot?: string;
};

export type TargetElement = {
  selectorCandidates: SelectorCandidate[];
  fallbackText?: string;
  role?: string;
  tagName?: string;
};

export type GuideStep = {
  id: string;
  order: number;
  urlMatch: string;
  target: TargetElement;
  title: string;
  message: string;
  stepPurpose?: GuideStepPurpose;
  navigationMode?: NavigationStepMode;
  continueWhen?: ContinueWhen;
  isMainStep?: boolean;
  trigger: GuideStepTrigger;
  validation?: Record<string, unknown>;
  actionSourceId: string;
};

export type Guide = {
  id: string;
  title: string;
  description: string;
  status: GuideStatus;
  createdAt: string;
  updatedAt: string;
  steps: GuideStep[];
};
