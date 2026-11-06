import { AuthPage } from "@/components/auth-page";

export const metadata = { title: "Sign in · Trip Planner" };

export default function SignInPage() {
  return <AuthPage mode="signIn" />;
}
