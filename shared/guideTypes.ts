export type RecordedActionType = "click" | "input" | "navigation" | "submit" | "change" | "manual-select";
export type GuideStepPurpose = "navigation" | "main";
export type NavigationStepMode = "autoClick" | "waitForUser";

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
  accessibleName?: string;
  text?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  inputType?: string;
  selectedOptionText?: string;
  name?: string;
  id?: string;
  dataAttributes: Record<string, string>;
  nearbyHeading?: string;
  parentContainerText?: string;
  previousSiblingText?: string;
  nextSiblingText?: string;
  parentTagName?: string;
  parentRole?: string;
  parentAccessibleName?: string;
  parentText?: string;
  formTitle?: string;
  dialogTitle?: string;
  cardTitle?: string;
  url: string;
  path: string;
  cssFallback?: string;
  xpathFallback?: string;
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
  navigationMode?: NavigationStepMode;
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
  selectedOptionText?: string;
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
  accessibleName?: string;
  text?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  inputType?: string;
  selectedOptionText?: string;
  name?: string;
  id?: string;
  dataAttributes?: Record<string, string>;
  nearbyHeading?: string;
  parentContainerText?: string;
  previousSiblingText?: string;
  nextSiblingText?: string;
  parentTagName?: string;
  parentRole?: string;
  parentAccessibleName?: string;
  parentText?: string;
  formTitle?: string;
  dialogTitle?: string;
  cardTitle?: string;
  cssFallback?: string;
  xpathFallback?: string;
  boundingBox?: ElementIdentity["boundingBox"];
};

export type GuideStep = {
  id: string;
  order: number;
  type?: "highlight" | "click" | "input" | "waitForUrl" | "waitForElement" | "manualInstruction";
  urlMatch: string;
  target: TargetElement;
  title: string;
  message: string;
  stepPurpose?: GuideStepPurpose;
  navigationMode?: NavigationStepMode;
  autoClick?: boolean;
  trigger: GuideStepTrigger;
  validation?: Record<string, unknown>;
  actionSourceId: string;
};

export type GuidePageContext = {
  url: string;
  title?: string;
};

export type GoalContext = GuidePageContext & {
  target?: TargetElement;
  requiredElement?: TargetElement;
};

export type Guide = {
  id: string;
  title: string;
  description: string;
  status: GuideStatus;
  createdAt: string;
  updatedAt: string;
  startContext?: GuidePageContext;
  goalContext?: GoalContext;
  entrySteps?: GuideStep[];
  mainSteps?: GuideStep[];
  steps: GuideStep[];
};
