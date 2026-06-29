export type {
  ElementIdentity,
  Guide,
  GuideStep,
  GuideStepTrigger,
  GuideStepPurpose,
  NavigationStepMode,
  RecordedAction,
  RecordedActionType,
  SelectorCandidate,
  SelectorCandidateType,
  TargetElement
} from "../../shared/guideTypes";

export type GuidePageContext = {
  url: string;
  title: string;
  capturedAt: string;
};

export type GoalContext = GuidePageContext & {
  actionBoundary: number;
};

export type RecordingState = {
  isRecording: boolean;
  isPaused: boolean;
  startContext?: GuidePageContext;
  goalContext?: GoalContext;
  actions: import("../../shared/guideTypes").RecordedAction[];
};

export type RecorderConfig = {
  scoutBaseUrl: string;
  recorderToken: string;
  sessionTitle?: string;
  recordingSessionId?: string;
  ingestPath?: string;
};

export type RecorderStatus = {
  configured: boolean;
  postedCount: number;
  lastPostStatus?: string;
  lastPostedAt?: string;
  lastError?: string;
};
