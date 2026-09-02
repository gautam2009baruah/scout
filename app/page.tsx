import { redirect } from "next/navigation";

export default function Home() {
  redirect("/control-panel/login");
}
