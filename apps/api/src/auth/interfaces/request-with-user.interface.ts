import { Request } from 'express';

export interface JWTPayload {
  id?: string; // some use sub, some use id
  sub: string;
  username: string;
  email: string;
  role: string;
}

export interface PolyUpdatePayload {
  coeffsX: number[];
  coeffsY: number[];
}

export interface MlpUpdatePayload {
  mlpWeightsJson: string;
  mlpWeightsBin: Buffer;
}

export interface RequestWithUser extends Request {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}
