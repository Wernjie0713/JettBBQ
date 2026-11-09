import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="bg-wine px-4 py-2.5 text-center text-sm text-white">
      <Link href="/order#christmas" className="underline-offset-4 hover:underline">
        Christmas platters are open · 27 Nov – 3 Jan · Free delivery from $195
      </Link>
    </div>
  );
}
