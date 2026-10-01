export type ErrorCategory =
  | 'RECOVERABLE'
  | 'FATAL'
  | 'USER_ACTION'
  | 'BUSINESS_FAILURE';

export type ErrorSource =
  | 'AUDIO'
  | 'TRANSPORT'
  | 'MODEL'
  | 'CONVERSATION'
  | 'TOOL'
  | 'BUSINESS'
  | 'SYSTEM';
