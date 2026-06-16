import { type Request, type Response, type NextFunction } from 'express';
import { UserRole } from '../../shared/types.js';

export interface AuthRequest extends Request {
  user?: {
    username: string;
    role: UserRole;
  };
}

const ROLE_HEADER = 'x-user-role';
const USER_HEADER = 'x-user-name';

const VALID_ROLES: UserRole[] = ['admin', 'viewer', 'operator'];

function parseRole(roleStr: string | undefined): UserRole {
  if (roleStr && VALID_ROLES.includes(roleStr as UserRole)) {
    return roleStr as UserRole;
  }
  return 'viewer';
}

function parseUsername(name: string | undefined): string {
  return name && name.trim() ? name.trim() : 'anonymous';
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const role = parseRole(req.header(ROLE_HEADER));
  const username = parseUsername(req.header(USER_HEADER));
  req.user = { username, role };
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '未授权：缺少用户信息',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: '权限不足：该操作需要以下角色之一：' + allowedRoles.join('、'),
        requiredRole: allowedRoles,
        currentRole: req.user.role,
      });
    }
    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  return requireRole('admin')(req, res, next);
}

export function canViewBackup(user?: { role: UserRole }): boolean {
  if (!user) return false;
  return ['admin', 'viewer', 'operator'].includes(user.role);
}

export function canCreateBackup(user?: { role: UserRole }): boolean {
  if (!user) return false;
  return ['admin', 'operator'].includes(user.role);
}

export function canRestoreBackup(user?: { role: UserRole }): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

export function canRollback(user?: { role: UserRole }): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

export function canDeleteBackup(user?: { role: UserRole }): boolean {
  if (!user) return false;
  return user.role === 'admin';
}
