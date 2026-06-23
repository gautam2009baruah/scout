export type RecordedActionType = "click" | "input" | "navigation" | "submit";

export type SelectorCandidateType =
  | "data-testid"
  | "id"
  | "name"
  | "aria-label"
  | "role-text"
  | "css"
  | "xpath";

export type GuideStatus = "draft" | "published";
export type GuideStepTrigger = "click" | "input" | "manualNext";

export type SelectorCandidate = {
  type: SelectorCandidateType;
  value: string;
  confidence: number;
};

export type RecordedAction = {
  id: string;
  type: RecordedActionType;
  url: string;
  timestamp: number;
  selectorCandidates: SelectorCandidate[];
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
