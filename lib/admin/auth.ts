import type { TenantContext } from "./database";
import type { AdminModule } from "./permissions";

export type UserCompanyAccess = {
  companyId: string;
  companyName: string;
  companySlug: string;
  roleId: string;
  roleName: string;
  isPrimary: boolean;
};

export type AdminUser = {
  id: string;
  tenantId: string; // Current company context
  name: string;
  email: string;
  roleId: string; // Role in current company
  isAdminRole: boolean; // Admin in current company
  isActive: boolean;
  mustChangePassword: boolean;
};

export type AdminSession = {
  user: AdminUser;
  tenant: TenantContext;
  modules: AdminModule[];
  availableCompanies: UserCompanyAccess[]; // All companies user has access to
  expiresAt: Date;
};

export type AdminLoginCredentials = {
  email: string;
  password: string;
};

export interface AdminAuthProvider {
  signIn(credentials: AdminLoginCredentials): Promise<AdminSession>;
  signOut(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<AdminSession | null>;
}

export class AdminAuthError extends Error {
  constructor(message = "Unable to sign in with the provided credentials.") {
    super(message);
    this.name = "AdminAuthError";
  }
}
