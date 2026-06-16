export interface JwtPayload {
  sub: string; // userId
  email: string;
  businessId?: string; // active business context
  memberId?: string; // BusinessMember ID
  branchId?: string;
  roleId?: string; // Role ID (resolved to permissions server-side)
  jti: string; // unique token ID for blacklisting
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
