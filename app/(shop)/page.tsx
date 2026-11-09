import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ArrowRightIcon, BeefIcon, ClockIcon, FlameIcon, PlayIcon, TruckIcon } from "lucide-react";
import { SITE } from "@/lib/site";
import { Button } from "@/components/ui/button";

// Home page structure: docs/DESIGN.md §7.2.

const PRODUCT_LINES = [
  {
    title: "Barbecue sets",
    text: "Two USDA Prime beef ribs with sides, sauces and pickles. Feeds 3–5.",
    image: "/images/beef-rib-set-spread.webp",
    href: "/order#sets",
    cta: "Order a set",
  },
  {
    title: "Christmas platters",
    text: "Festive spreads for 4 to 15, delivered 27 Nov – 3 Jan.",
    image: "/images/christmas-platter.webp",
    href: "/order#christmas",
    cta: "See platters",
  },
  {
    title: "Catering & events",
    text: "Office parties and big hostings, planned with the pitmaster.",
    image: "/images/beef-rib-knife.webp",
    href: SITE.cateringUrl,
    cta: "Enquire",
    external: true,
  },
];

const FACTS = [
  { icon: ClockIcon, title: "Smoked 8–14 hours", text: "Low and slow over oak, every batch." },
  { icon: FlameIcon, title: "800-gallon smoker", text: "Built for Texas-style beef ribs." },
  { icon: BeefIcon, title: "USDA Prime beef", text: "Only the top grade of beef rib." },
  { icon: TruckIcon, title: "Free delivery from $195", text: "Islandwide, in a time window you pick." },
];

// Press headlines as published on jettbarbecue.sg.
const PRESS = [
  {
    outlet: "CNA",
    headline: "The go-getter behind Jett Barbecue turns up the heat on chasing after his dreams",
    href: "https://www.channelnewsasia.com/cna-insider/up-close/chua-jett-yong-barbecue-smoked-grilled-meats-food-business-ribs-5381846",
  },
  {
    outlet: "8 Days",
    headline: "NTU grad sells superb beef ribs using $80K smokers",
    href: "https://www.8days.sg/eatanddrink/newsandreviews/ntu-grad-superb-american-barbecue-beef-ribs-bbq-723931",
  },
  {
    outlet: "Eatbook",
    headline: "Highly raved American barbecue in Singapore",
    href: "https://eatbook.sg/jett-barbecue/",
  },
];

const VIDEOS = [
  { channel: "Zermatt Neo", title: "$600 Dino Rib Platter Challenge", href: "https://www.youtube.com/watch?v=_NcBGm0n3PU&t=193s" },
  { channel: "Overkill Singapore", title: "Zermatt's Recommendations", href: "https://www.youtube.com/watch?v=ARCWrGlVx8Q&t=560s" },
];

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProductLines />
      <WhyJett />
      <Press />
      <WatchAndFollow />
    </>
  );
}

function Hero() {
  // Art direction: landscape spread on desktop, portrait spread on mobile. Only one is downloaded.
  const common = { alt: "", sizes: "100vw", quality: 75 };
  const {
    props: { srcSet: desktop },
  } = getImageProps({ ...common, src: "/images/hero-spread-landscape.webp", width: 2400, height: 1600 });
  const {
    props: { srcSet: mobile, ...rest },
  } = getImageProps({ ...common, src: "/images/hero-spread-portrait.webp", width: 1280, height: 1600 });

  return (
    // -mt-18 slides the hero under the sticky header, which is transparent here.
    <section className="relative -mt-18 flex h-[75svh] min-h-[560px] items-end overflow-hidden bg-char text-white md:h-[88svh]">
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop} />
        <source srcSet={mobile} />
        <img
          {...rest}
          alt="USDA Prime beef ribs on a wooden board with mashed potato, coleslaw, mac and cheese and sauces"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-linear-to-t from-char/85 via-char/35 to-char/10" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-char/60 to-transparent" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-[76rem] flex-col gap-5 px-4 pb-14 md:px-6 md:pb-20 lg:px-8">
        <p className="text-xs font-medium tracking-[0.3em] uppercase">Meat | Smoke | Love</p>
        <h1 className="max-w-3xl font-display text-[clamp(3rem,7vw,5.5rem)] leading-[0.95] tracking-[0.01em] uppercase">
          Texas-style beef ribs, delivered
        </h1>
        <p className="max-w-xl text-lg font-light">
          USDA Prime beef ribs smoked low and slow over oak, brought to your door anywhere in Singapore.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild size="cta">
            <Link href="/order">Order now</Link>
          </Button>
          <Button asChild size="cta" variant="inverse">
            <a href={SITE.christmasMenuPdfUrl} {...external}>
              Christmas menu (PDF)
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function ProductLines() {
  return (
    <section className="px-4 py-16 md:px-6 md:py-24 lg:px-8">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-10">
        <h2 className="text-center font-display text-[2rem] leading-[1.2] uppercase md:text-[2.5rem]">
          What are you feeding?
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {PRODUCT_LINES.map((line) => {
            const content = (
              <>
                <Image
                  src={line.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 368px, 100vw"
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-linear-to-t from-char/75 via-char/25 to-transparent" aria-hidden />
                <div className="relative mt-auto flex flex-col items-start gap-3 p-6 text-white">
                  <h3 className="font-display text-4xl leading-[1.05] uppercase">{line.title}</h3>
                  <p className="text-base">{line.text}</p>
                  <span className="mt-1 inline-flex h-11 items-center gap-2 rounded-sm border border-white/80 px-5 font-bold group-hover:bg-white/10">
                    {line.cta}
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </span>
                </div>
              </>
            );
            const className =
              "group relative flex aspect-[4/5] overflow-hidden rounded-sm bg-char sm:aspect-[3/4] lg:aspect-[3/5]";
            return line.external ? (
              <a key={line.title} href={line.href} {...external} className={className}>
                {content}
              </a>
            ) : (
              <Link key={line.title} href={line.href} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhyJett() {
  return (
    <section className="bg-sand px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <ul className="mx-auto grid max-w-[72rem] gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col gap-2">
            <Icon className="size-7 text-brand" aria-hidden />
            <p className="text-lg font-bold">{title}</p>
            <p className="text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Press() {
  return (
    <section className="px-4 py-16 md:px-6 md:py-24 lg:px-8">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-12">
        <h2 className="mx-auto max-w-2xl text-center font-serif text-[2.5rem] leading-[1.1] font-bold md:text-[3.375rem]">
          Singapore is talking about the ribs
        </h2>
        <ul className="grid gap-8 md:grid-cols-3">
          {PRESS.map((item) => (
            <li key={item.outlet}>
              <a href={item.href} {...external} className="group flex h-full flex-col gap-4 border-t-2 border-brand pt-6">
                <p className="text-sm font-bold tracking-[0.08em] text-brand uppercase">{item.outlet}</p>
                <p className="text-lg font-light">“{item.headline}”</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold underline-offset-4 group-hover:underline">
                  Read on {item.outlet}
                  <ArrowRightIcon className="size-4" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WatchAndFollow() {
  return (
    <section className="bg-wood px-4 py-16 text-bone md:px-6 md:py-24 lg:px-8">
      <div className="mx-auto grid max-w-[72rem] gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[2rem] leading-[1.2] uppercase md:text-[2.5rem]">Watch the dino ribs</h2>
          <p className="text-lg font-light text-bone/80">
            Food creators have taken on our ribs on camera. Follow along for smoker days and new drops.
          </p>
          <div>
            <Button asChild size="cta" variant="inverse">
              <a href={SITE.instagramUrl} {...external}>
                Follow @jettbarbecue
              </a>
            </Button>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {VIDEOS.map((video) => (
            <li key={video.href}>
              <a
                href={video.href}
                {...external}
                className="flex items-center gap-4 rounded-sm bg-char p-4 hover:bg-char/80"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand">
                  <PlayIcon className="size-5 fill-current" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm text-bone/70">{video.channel} on YouTube</span>
                  <span className="font-bold">{video.title}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
