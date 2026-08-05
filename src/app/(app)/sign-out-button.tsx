import { Button } from "@/components/ui/button";

/** A form POST rather than a link — see the note in /auth/signout. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" className="mt-8">
      <Button type="submit" variant="ghost">
        Log out
      </Button>
    </form>
  );
}
