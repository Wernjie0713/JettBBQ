import Link from "next/link";
import { SITE } from "@/lib/site";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function SiteFooter() {
  return (
    <footer className="bg-char text-bone">
      <div className="mx-auto grid max-w-[76rem] gap-10 px-4 py-16 md:grid-cols-2 md:px-6 lg:grid-cols-4 lg:px-8">
        <div className="flex flex-col gap-3">
          <p className="font-display text-3xl uppercase">Jett Barbecue</p>
          <p className="text-xs font-medium tracking-[0.3em] text-bone/70 uppercase">Meat | Smoke | Love</p>
          <p className="text-sm text-bone/70">
            Texas-style smoked USDA Prime beef ribs, delivered across Singapore.
          </p>
        </div>

        <FooterColumn title="Order">
          <Link href="/order#sets">Barbecue sets</Link>
          <Link href="/order#christmas">Christmas platters</Link>
          <Link href="/order#sides">Sides</Link>
          <a href={SITE.christmasMenuPdfUrl} {...external}>
            Christmas menu (PDF)
          </a>
        </FooterColumn>

        <FooterColumn title="Help">
          <a href={SITE.faqUrl} {...external}>
            FAQ
          </a>
          <a href={SITE.reheatGuideUrl} {...external}>
            Reheat guide
          </a>
          <a href={SITE.cateringUrl} {...external}>
            Catering
          </a>
        </FooterColumn>

        <FooterColumn title="Delivery hours">
          {SITE.hours.map((line) => (
            <span key={line}>{line}</span>
          ))}
          <a href={SITE.whatsappUrl} {...external}>
            WhatsApp {SITE.whatsappDisplay}
          </a>
          <a href={SITE.instagramUrl} {...external}>
            Instagram @jettbarbecue
          </a>
        </FooterColumn>
      </div>
      <div className="border-t border-bone/15">
        <p className="mx-auto max-w-[76rem] px-4 py-6 text-xs text-bone/60 md:px-6 lg:px-8">
          © Jett Barbecue · Prototype for demonstration — orders placed here are not
          fulfilled and no card is charged.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.3em] uppercase">{title}</p>
      <div className="flex flex-col gap-2 text-sm text-bone/80 [&_a]:underline-offset-4 [&_a:hover]:text-bone [&_a:hover]:underline">
        {children}
      </div>
    </div>
  );
}
