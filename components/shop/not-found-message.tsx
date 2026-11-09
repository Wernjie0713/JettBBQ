import Link from "next/link";

export function NotFoundMessage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-5xl uppercase">Page not found</h1>
      <p className="text-lg font-light">This page went up in smoke.</p>
      <Link href="/" className="font-bold text-brand underline underline-offset-4">
        Back to Jett Barbecue
      </Link>
    </div>
  );
}
