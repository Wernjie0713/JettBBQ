import { Anton, DM_Sans, Fraunces } from "next/font/google";

// Font roles are defined in docs/DESIGN.md §4.
export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const fontVariables = `${dmSans.variable} ${anton.variable} ${fraunces.variable}`;
