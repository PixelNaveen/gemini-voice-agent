export interface ApiErrorResponseDto {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, any>;
  };
}
