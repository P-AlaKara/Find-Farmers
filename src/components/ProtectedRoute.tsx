import { Navigate } from "react-router-dom";
import { getSession, type UserRole } from "@/lib/auth";

export default function ProtectedRoute({ children, role }: { children: JSX.Element; role: UserRole }) {
  const session = getSession();
  if (!session || session.role !== role) return <Navigate to="/login" replace />;
  return children;
}
