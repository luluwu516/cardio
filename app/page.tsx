import { redirect } from "next/navigation";

// "/" is just a router: send signed-in users into the Search tab (the de-facto
// home of the app via BottomTabBar). Unauthenticated users get bounced to
// /login by proxy.ts before this ever renders.
export default function Home() {
  redirect("/search");
}
