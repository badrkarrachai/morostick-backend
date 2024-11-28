// types/express.d.ts (create this file if it doesn't exist)
import { JwtPayload } from "../interfaces/jwt_payload_interface";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload["user"];
    }
  }
}
