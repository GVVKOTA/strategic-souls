import { HttpError } from "../../middleware/security";
import type { SharedErrorCode } from "../market-data/data-types";

export class ScanActionError extends HttpError {
  constructor(
    status: number,
    message: string,
    public errorCode: SharedErrorCode,
    public retryable: boolean,
    public details?: Record<string, unknown>,
  ) {
    super(status, message);
  }
}
