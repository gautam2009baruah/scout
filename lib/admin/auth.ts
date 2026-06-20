import type { TenantContext } from "./database";
import type { AdminModule } from "./permissions";

export type AdminUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  roleId: string;
  isAdminRole: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type AdminSession = {
  user: AdminUser;
  tenant: TenantContext;
  modules: AdminModule[];
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
