export type {
  ElementIdentity,
  Guide,
  GuideStep,
  GuideStepTrigger,
  RecordedAction,
  RecordedActionType,
  SelectorCandidate,
  SelectorCandidateType,
  TargetElement
} from "../../shared/guideTypes";

export type RecordingState = {
  isRecording: boolean;
  isPaused: boolean;
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
