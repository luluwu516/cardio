import { redirect } from "next/navigation";

// "/" is just a router: send signed-in users into their Collection (the home
// of the app — you open it to see what you own, and dip into Search only when
// you need to). Unauthenticated users get bounced to /login by proxy.ts before
// this ever renders. Every entry path funnels through here — PWA launch
// (manifest start_url "/"), password login and the OAuth callback both
// redirect("/") — so this one target covers them all.
export default function Home() {
  redirect("/collection");
}
