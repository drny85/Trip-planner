import { AuthPage } from "@/components/auth-page";

export const metadata = { title: "Create account · Trip Planner" };

export default function SignUpPage() {
  return <AuthPage mode="signUp" />;
}
