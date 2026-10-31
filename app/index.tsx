import { Redirect } from "expo-router";

// The tabs live in a group, so "/" has no screen of its own; open on Lookup.
export default function Index() {
  return <Redirect href="/lookup" />;
}
